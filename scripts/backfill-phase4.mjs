import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeText,
  nowIso,
  softDeleteFilter,
  sortByCreatedAt,
  sortByDisplayOrder,
  uniqueBy,
  uuidFromName,
  UUID_NAMESPACE,
} from "./backfill-phase4.shared.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_DIR = resolve(ROOT, "reports", "backfill-phase4");
const EXPECTED = {
  venues: 1,
  events: 4,
  resolvedEvents: 4,
  venueLayouts: 1,
  venueLayoutSectors: 3,
  venueLayoutResources: 16,
  eventLayouts: 4,
  eventLayoutSectors: 12,
  eventLayoutResources: 64,
  reservations: 10,
  reservationsMapped: 10,
  ambiguousReservations: 0,
  unmappedReservations: 0,
  conflictClusters: 5,
};

const TABLES = [
  "organizations",
  "events",
  "venues",
  "sectors",
  "resources",
  "reservations",
  "guests",
  "venue_layouts",
  "venue_layout_sectors",
  "venue_layout_resources",
  "event_layouts",
  "event_layout_sectors",
  "event_layout_resources",
];

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return { url, serviceRoleKey };
}

async function fetchTable(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  const payload = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to read ${table}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function writeReport(report, fileName = `dry-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`) {
  await mkdir(REPORT_DIR, { recursive: true });
  const filePath = resolve(REPORT_DIR, fileName);
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

function buildIndex(items, keyFn) {
  const index = new Map();

  for (const item of items) {
    index.set(keyFn(item), item);
  }

  return index;
}

function buildMultiIndex(items, keyFn) {
  const index = new Map();

  for (const item of items) {
    const key = keyFn(item);
    const bucket = index.get(key);

    if (bucket) {
      bucket.push(item);
    } else {
      index.set(key, [item]);
    }
  }

  return index;
}

function resolveVenueForEvent(event, venues, venueById) {
  const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? event.metadata
    : {};
  const candidates = [];
  const byVenueId = event.venue_id && venueById.get(event.venue_id);
  const byMetadataVenueId = typeof metadata.venueId === "string" ? venueById.get(metadata.venueId) : undefined;
  const textualMatches = venues.filter((venue) => normalizeText(venue.name) === normalizeText(event.venue));

  if (byVenueId) {
    candidates.push({ method: "events.venue_id", venue: byVenueId });
  }

  if (byMetadataVenueId) {
    candidates.push({ method: "metadata.venueId", venue: byMetadataVenueId });
  }

  if (textualMatches.length === 1) {
    candidates.push({ method: "textual match", venue: textualMatches[0] });
  }

  const unique = uniqueBy(candidates, (candidate) => candidate.venue.id);
  const chosen = unique[0] ?? null;
  const conflicting = unique.length > 1 && unique.some((candidate) => candidate.venue.id !== unique[0].venue.id);

  return {
    eventId: event.id,
    eventName: event.name,
    venueText: event.venue,
    eventVenueId: event.venue_id ?? null,
    metadataVenueId: typeof metadata.venueId === "string" ? metadata.venueId : null,
    candidates: unique.map((candidate) => ({
      method: candidate.method,
      venueId: candidate.venue.id,
      venueName: candidate.venue.name,
    })),
    resolvedVenueId: conflicting ? null : chosen?.venue.id ?? null,
    resolvedVenueName: conflicting ? null : chosen?.venue.name ?? null,
    resolutionMethod: conflicting ? "ambiguous" : chosen?.method ?? null,
    ambiguous: conflicting || unique.length > 1,
  };
}

function detectDuplicatesByNormalizedName(items, label) {
  const groups = new Map();

  for (const item of items) {
    const normalized = normalizeText(item.name);
    const bucket = groups.get(normalized) ?? [];
    bucket.push(item);
    groups.set(normalized, bucket);
  }

  return [...groups.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([normalizedName, bucket]) => ({
      label,
      normalizedName,
      count: bucket.length,
      ids: bucket.map((item) => item.id),
      names: bucket.map((item) => item.name),
    }));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildReportBundle(mode, report) {
  return {
    mode,
    generatedAt: nowIso(),
    ...report,
  };
}

function normalizeReportBundle(bundle) {
  function strip(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => strip(entry));
    }

    if (value && typeof value === "object") {
      const result = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        if (key === "mode" || key === "generatedAt" || key === "action" || key === "existingLayoutId" || key === "sourceResourceLayoutName") {
          continue;
        }

        result[key] = strip(nestedValue);
      }
      return result;
    }

    return value;
  }

  return strip(cloneJson(bundle));
}

function reportBundlesMatch(a, b) {
  return JSON.stringify(normalizeReportBundle(a)) === JSON.stringify(normalizeReportBundle(b));
}

function buildBundleDigest(bundle) {
  return createHash("sha256").update(JSON.stringify(normalizeReportBundle(bundle))).digest("hex");
}

async function writeJsonFile(filePath, value) {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function asJsonMetadata(source) {
  return cloneJson(source);
}

function stripWritePlanRow(row) {
  const copy = { ...row };
  delete copy.__created;
  delete copy.previous;
  delete copy.next;
  return copy;
}

function mapLayoutResourceStatus(status, closed) {
  if (closed) {
    return "inactive";
  }

  if (status === "Blocked" || status === "Closed") {
    return "inactive";
  }

  return "active";
}

function buildDisambiguatedNames(items, getName) {
  const counts = new Map();

  for (const item of items) {
    const normalized = normalizeText(getName(item));
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const seen = new Map();

  return items.map((item) => {
    const rawName = String(getName(item) ?? "").trim();
    const normalized = normalizeText(rawName);
    const count = counts.get(normalized) ?? 1;
    const index = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, index);

    return {
      ...item,
      layoutName: count > 1 ? `${rawName} · ${index}` : rawName,
      originalName: rawName,
      duplicateIndex: index,
      duplicateCount: count,
    };
  });
}

async function runDryRun({ emit = true, reportName = `dry-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json` } = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();

  const records = {};

  for (const table of TABLES) {
    records[table] = softDeleteFilter(await fetchTable(url, serviceRoleKey, table));
  }

  const organizations = records.organizations;
  const events = sortByCreatedAt(records.events);
  const venues = sortByCreatedAt(records.venues);
  const sectors = sortByDisplayOrder(records.sectors);
  const resources = sortByDisplayOrder(records.resources);
  const reservations = sortByCreatedAt(records.reservations);
  const guests = sortByCreatedAt(records.guests);
  const venueLayouts = sortByCreatedAt(records.venue_layouts);
  const venueLayoutSectors = sortByDisplayOrder(records.venue_layout_sectors);
  const venueLayoutResources = sortByDisplayOrder(records.venue_layout_resources);
  const eventLayouts = sortByCreatedAt(records.event_layouts);
  const eventLayoutSectors = sortByDisplayOrder(records.event_layout_sectors);
  const eventLayoutResources = sortByDisplayOrder(records.event_layout_resources);

  const venueById = buildIndex(venues, (venue) => venue.id);
  const eventById = buildIndex(events, (event) => event.id);

  const eventVenueResolutions = events.map((event) => resolveVenueForEvent(event, venues, venueById));
  const resolvedVenueById = new Map(eventVenueResolutions.filter((entry) => entry.resolvedVenueId).map((entry) => [entry.eventId, entry.resolvedVenueId]));

  const venueLayoutPlan = [];
  const venueLayoutByVenueId = new Map();

  for (const venue of venues) {
    const existingLayouts = venueLayouts.filter((layout) => layout.venue_id === venue.id);
    const defaultLayout = existingLayouts.find((layout) => layout.is_default) ?? existingLayouts[0] ?? null;
    const layoutId = defaultLayout?.id ?? uuidFromName(UUID_NAMESPACE, `venue-layout:${venue.id}`);
    venueLayoutByVenueId.set(venue.id, layoutId);

    venueLayoutPlan.push({
      venueId: venue.id,
      venueName: venue.name,
      action: defaultLayout ? "reuse" : "create",
      layoutId,
      existingLayoutId: defaultLayout?.id ?? null,
      sourceVenueId: venue.id,
    });
  }

  const venueLayoutSectorPlan = [];
  const venueLayoutResourcePlan = [];

  for (const venue of venues) {
    const layoutId = venueLayoutByVenueId.get(venue.id);
    const sourceSectors = sectors.filter((sector) => sector.venue_id === venue.id);
    const sourceResources = resources.filter((resource) => resource.venue_id === venue.id);
    const namedSourceResources = buildDisambiguatedNames(sourceResources, (resource) => resource.name);
    const existingLayoutSectors = venueLayoutSectors.filter((item) => item.venue_layout_id === layoutId);
    const existingLayoutResources = venueLayoutResources.filter((item) => item.venue_layout_id === layoutId);

    for (const sector of sourceSectors) {
      const existing = existingLayoutSectors.find((item) => item.source_sector_id === sector.id) ?? existingLayoutSectors.find((item) => normalizeText(item.name) === normalizeText(sector.name));
      venueLayoutSectorPlan.push({
        venueId: venue.id,
        venueName: venue.name,
        sourceSectorId: sector.id,
        sourceSectorName: sector.name,
        layoutId,
        layoutSectorId: existing?.id ?? uuidFromName(UUID_NAMESPACE, `venue-layout-sector:${layoutId}:${sector.id}`),
        action: existing ? "reuse" : "create",
      });
    }

    for (const resource of namedSourceResources) {
      const existing = existingLayoutResources.find((item) => item.source_resource_id === resource.id) ?? existingLayoutResources.find((item) => normalizeText(item.name) === normalizeText(resource.name));
      venueLayoutResourcePlan.push({
        venueId: venue.id,
        venueName: venue.name,
        sourceResourceId: resource.id,
        sourceResourceName: resource.originalName ?? resource.name,
        sourceResourceLayoutName: resource.layoutName ?? resource.name,
        sourceSectorId: resource.sector_id ?? null,
        layoutId,
        layoutResourceId: existing?.id ?? uuidFromName(UUID_NAMESPACE, `venue-layout-resource:${layoutId}:${resource.id}`),
        action: existing ? "reuse" : "create",
      });
    }
  }

  const eventLayoutPlan = [];
  const eventLayoutSectorPlan = [];
  const eventLayoutResourcePlan = [];
  const eventLayoutByEventId = new Map();

  for (const event of events) {
    const resolvedVenueId = resolvedVenueById.get(event.id) ?? null;
    const sourceVenueLayoutId = resolvedVenueId ? venueLayoutByVenueId.get(resolvedVenueId) ?? null : null;
    const existing = eventLayouts.find((layout) => layout.event_id === event.id) ?? null;
    const layoutId = existing?.id ?? uuidFromName(UUID_NAMESPACE, `event-layout:${event.id}`);
    eventLayoutByEventId.set(event.id, layoutId);
    eventLayoutPlan.push({
      eventId: event.id,
      eventName: event.name,
      resolvedVenueId,
      resolvedVenueName: resolvedVenueId ? venueById.get(resolvedVenueId)?.name ?? null : null,
      sourceVenueLayoutId,
      layoutId,
      action: existing ? "reuse" : "create",
    });
  }

  for (const event of events) {
    const venueId = resolvedVenueById.get(event.id) ?? null;
    const venueLayoutId = venueId ? venueLayoutByVenueId.get(venueId) ?? null : null;
    const layoutId = eventLayoutByEventId.get(event.id);

    const sourceSectors = sectors.filter((sector) => sector.venue_id === venueId);
    const sourceResources = resources.filter((resource) => resource.venue_id === venueId);
    const namedSourceResources = buildDisambiguatedNames(sourceResources, (resource) => resource.name);
    const existingEventLayoutSectors = eventLayoutSectors.filter((item) => item.event_layout_id === layoutId);
    const existingEventLayoutResources = eventLayoutResources.filter((item) => item.event_layout_id === layoutId);

    for (const sector of sourceSectors) {
      const existing = existingEventLayoutSectors.find((item) => item.source_venue_layout_sector_id === sector.id) ?? existingEventLayoutSectors.find((item) => normalizeText(item.name) === normalizeText(sector.name));
      const venueLayoutSector = venueLayoutSectors.find((item) => item.source_sector_id === sector.id && item.venue_layout_id === venueLayoutId) ?? null;
      eventLayoutSectorPlan.push({
        eventId: event.id,
        eventName: event.name,
        sourceSectorId: sector.id,
        sourceSectorName: sector.name,
        venueLayoutSectorId: venueLayoutSector?.id ?? null,
        layoutId,
        eventLayoutSectorId: existing?.id ?? uuidFromName(UUID_NAMESPACE, `event-layout-sector:${layoutId}:${sector.id}`),
        action: existing ? "reuse" : "create",
      });
    }

    for (const resource of namedSourceResources) {
      const venueLayoutResource = venueLayoutResources.find((item) => item.source_resource_id === resource.id && item.venue_layout_id === venueLayoutId) ?? null;
      const existing = existingEventLayoutResources.find((item) => item.source_venue_layout_resource_id === venueLayoutResource?.id) ?? existingEventLayoutResources.find((item) => normalizeText(item.name) === normalizeText(resource.name));
      eventLayoutResourcePlan.push({
        eventId: event.id,
        eventName: event.name,
        sourceResourceId: resource.id,
      sourceResourceName: resource.originalName ?? resource.name,
      sourceResourceLayoutName: resource.layoutName ?? resource.name,
      venueLayoutResourceId: venueLayoutResource?.id ?? null,
      layoutId,
      eventLayoutResourceId: existing?.id ?? uuidFromName(UUID_NAMESPACE, `event-layout-resource:${layoutId}:${resource.id}`),
        action: existing ? "reuse" : "create",
      });
    }
  }

  const reservationMapping = [];
  const activeReservationBuckets = buildMultiIndex(
    reservations.filter((reservation) => ["Pending", "Confirmed", "Checked In", "Completed"].includes(reservation.status)),
    (reservation) => `${reservation.event_id}::${reservation.table_id ?? "null"}`,
  );
  const conflictClusters = [...activeReservationBuckets.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({
      key,
      reservations: bucket.map((reservation) => ({
        reservationId: reservation.id,
        code: reservation.code,
        status: reservation.status,
        tableId: reservation.table_id ?? null,
        tableName: reservation.table_name,
        guestCount: Array.isArray(reservation.guest_ids) ? reservation.guest_ids.length : 0,
      })),
    }));

  const orphanResources = resources.filter((resource) => !venueById.has(resource.venue_id));
  const orphanSectors = sectors.filter((sector) => !venueById.has(sector.venue_id));
  const resourceDuplicates = detectDuplicatesByNormalizedName(resources, "resource");
  const sectorDuplicates = detectDuplicatesByNormalizedName(sectors, "sector");

  for (const reservation of reservations) {
    const event = eventById.get(reservation.event_id);
    const legacyResource = reservation.table_id ? resources.find((resource) => resource.id === reservation.table_id) : null;
    const venueResolution = eventVenueResolutions.find((entry) => entry.eventId === reservation.event_id);
    const venueId = venueResolution?.resolvedVenueId ?? null;
    const venueLayoutId = venueId ? venueLayoutByVenueId.get(venueId) ?? null : null;
    const venueLayoutResource = legacyResource && venueLayoutId
      ? venueLayoutResources.find((item) => item.source_resource_id === legacyResource.id && item.venue_layout_id === venueLayoutId) ?? {
          id: uuidFromName(UUID_NAMESPACE, `venue-layout-resource:${venueLayoutId}:${legacyResource.id}`),
        }
      : null;
    const eventLayoutId = reservation.event_id ? eventLayoutByEventId.get(reservation.event_id) ?? null : null;
    const eventLayoutResource = legacyResource && venueLayoutResource && eventLayoutId
      ? eventLayoutResources.find((item) => item.source_venue_layout_resource_id === venueLayoutResource.id && item.event_layout_id === eventLayoutId) ?? {
          id: uuidFromName(UUID_NAMESPACE, `event-layout-resource:${eventLayoutId}:${legacyResource.id}`),
        }
      : null;

    if (!event || !venueResolution?.resolvedVenueId || !legacyResource || !venueLayoutResource || !eventLayoutResource) {
      reservationMapping.push({
        reservationId: reservation.id,
        code: reservation.code,
        eventId: reservation.event_id,
        tableId: reservation.table_id ?? null,
        mapped: false,
        reason:
          !event
            ? "event not found"
            : !venueResolution?.resolvedVenueId
              ? "venue unresolved"
              : !legacyResource
                ? "legacy resource not found"
                : !venueLayoutResource
                  ? "venue layout resource not found"
                  : "event layout resource not found",
      });
      continue;
    }

    const sameEvent = eventLayoutResource ? eventLayoutId === uuidFromName(UUID_NAMESPACE, `event-layout:${reservation.event_id}`) : false;

    reservationMapping.push({
      reservationId: reservation.id,
      code: reservation.code,
      eventId: reservation.event_id,
      eventName: reservation.event_name,
      tableId: reservation.table_id ?? null,
      legacyResourceId: legacyResource.id,
      legacyResourceName: legacyResource.name,
      venueLayoutResourceId: venueLayoutResource.id,
      eventLayoutResourceId: eventLayoutResource.id,
      eventLayoutId,
      mapped: true,
      sameEvent,
      sameVenue: legacyResource.venue_id === venueId,
      guestCount: Array.isArray(reservation.guest_ids) ? reservation.guest_ids.length : 0,
    });
  }

  const report = {
    venues: {
      detected: venues.length,
      items: venues.map((venue) => ({
        venueId: venue.id,
        venueName: venue.name,
        organizationId: venue.organization_id,
        status: venue.status,
      })),
    },
    events: {
      detected: events.length,
      venueResolution: eventVenueResolutions,
      resolved: eventVenueResolutions.filter((entry) => entry.resolvedVenueId).length,
      unresolved: eventVenueResolutions.filter((entry) => !entry.resolvedVenueId),
      ambiguous: eventVenueResolutions.filter((entry) => entry.ambiguous),
    },
    venueLayouts: venueLayoutPlan,
    venueLayoutSectors: venueLayoutSectorPlan,
    venueLayoutResources: venueLayoutResourcePlan,
    eventLayouts: eventLayoutPlan,
    eventLayoutSectors: eventLayoutSectorPlan,
    eventLayoutResources: eventLayoutResourcePlan,
    reservations: {
      total: reservations.length,
      mapped: reservationMapping.filter((entry) => entry.mapped).length,
      ambiguous: 0,
      unmapped: reservationMapping.filter((entry) => !entry.mapped),
      mappings: reservationMapping,
    },
    conflicts: {
      duplicateActiveReservationsByResource: conflictClusters,
      orphanResources,
      orphanSectors,
      duplicateResourcesByName: resourceDuplicates,
      duplicateSectorsByName: sectorDuplicates,
    },
    trace: {
      legacySourceCount: {
        organizations: organizations.length,
        venues: venues.length,
        sectors: sectors.length,
        resources: resources.length,
        events: events.length,
        reservations: reservations.length,
        guests: guests.length,
      },
      venuePresetCount: venueLayoutPlan.length,
      eventSnapshotCount: eventLayoutPlan.length,
    },
    expectations: EXPECTED,
  };

  if (emit) {
    const reportPath = await writeReport(buildReportBundle("dry-run", report), reportName);
    console.log(printHumanReport(report));
    console.log("");
    console.log(`JSON report written to: ${reportPath}`);
  }

  return {
    report,
    records,
    plans: {
      venueLayoutPlan,
      venueLayoutSectorPlan,
      venueLayoutResourcePlan,
      eventLayoutPlan,
      eventLayoutSectorPlan,
      eventLayoutResourcePlan,
      reservationMapping,
      conflictClusters,
      eventVenueResolutions,
      resolvedVenueById,
      venueById,
      eventById,
      venueLayoutByVenueId,
      eventLayoutByEventId,
    },
  };
}

function buildWritePlan(context, batchId) {
  const {
    records,
    plans: {
      venueLayoutPlan,
      venueLayoutSectorPlan,
      venueLayoutResourcePlan,
      eventLayoutPlan,
      eventLayoutSectorPlan,
      eventLayoutResourcePlan,
      reservationMapping,
      venueById,
      eventById,
    },
  } = context;

  const currentIds = Object.fromEntries(
    Object.entries(records).map(([table, rows]) => [table, new Set(rows.map((row) => row.id))]),
  );

  const venueLayoutSectorIdBySourceSectorId = new Map();
  const eventLayoutSectorIdBySourceSectorId = new Map();

  const venueLayoutRows = [];
  const venueLayoutSectorRows = [];
  const venueLayoutResourceRows = [];
  const eventLayoutRows = [];
  const eventLayoutSectorRows = [];
  const eventLayoutResourceRows = [];
  const eventRows = [];
  const reservationRows = [];

  for (const plan of venueLayoutPlan) {
    const venue = venueById.get(plan.venueId) ?? null;
    venueLayoutRows.push({
      id: plan.layoutId,
      venue_id: plan.venueId,
      name: venue?.name ?? plan.venueName,
      description: venue?.description ?? null,
      is_default: true,
      status: "active",
      metadata: asJsonMetadata({
        backfill: {
          batchId,
          source: "phase4",
          kind: "venue_layout",
          venueId: plan.venueId,
        },
      }),
      __created: !currentIds.venue_layouts.has(plan.layoutId),
    });
  }

  for (const plan of venueLayoutSectorPlan) {
    const sourceSector = records.sectors.find((sector) => sector.id === plan.sourceSectorId) ?? null;
    venueLayoutSectorIdBySourceSectorId.set(plan.sourceSectorId, plan.layoutSectorId);
    venueLayoutSectorRows.push({
      id: plan.layoutSectorId,
      venue_layout_id: plan.layoutId,
      source_sector_id: plan.sourceSectorId,
      name: sourceSector?.name ?? plan.sourceSectorName,
      description: sourceSector?.description ?? null,
      capacity: sourceSector?.capacity ?? null,
      display_order: sourceSector?.display_order ?? 0,
      status: sourceSector?.status ?? "active",
      metadata: asJsonMetadata({
        backfill: {
          batchId,
          source: "phase4",
          kind: "venue_layout_sector",
          sourceSectorId: plan.sourceSectorId,
          venueLayoutId: plan.layoutId,
        },
      }),
      __created: !currentIds.venue_layout_sectors.has(plan.layoutSectorId),
    });
  }

  for (const plan of venueLayoutResourcePlan) {
    const sourceResource = records.resources.find((resource) => resource.id === plan.sourceResourceId) ?? null;
    const venueLayoutSectorId = sourceResource?.sector_id ? venueLayoutSectorIdBySourceSectorId.get(sourceResource.sector_id) ?? null : null;
    venueLayoutResourceRows.push({
      id: plan.layoutResourceId,
      venue_layout_id: plan.layoutId,
      venue_layout_sector_id: venueLayoutSectorId,
      source_resource_id: plan.sourceResourceId,
      type: sourceResource?.type ?? "table",
      name: plan.sourceResourceLayoutName ?? sourceResource?.name ?? plan.sourceResourceName,
      capacity: sourceResource?.capacity ?? 0,
      status: mapLayoutResourceStatus(sourceResource?.status, sourceResource?.closed),
      display_order: sourceResource?.display_order ?? 0,
      notes: sourceResource?.notes ?? null,
      metadata: asJsonMetadata({
        backfill: {
          batchId,
          source: "phase4",
          kind: "venue_layout_resource",
          sourceResourceId: plan.sourceResourceId,
          originalName: plan.sourceResourceName,
          layoutName: plan.sourceResourceLayoutName ?? plan.sourceResourceName,
          venueLayoutId: plan.layoutId,
          venueLayoutSectorId,
        },
      }),
      __created: !currentIds.venue_layout_resources.has(plan.layoutResourceId),
    });
  }

  for (const plan of eventLayoutPlan) {
    const event = eventById.get(plan.eventId) ?? null;
    const currentEvent = records.events.find((row) => row.id === plan.eventId) ?? null;
    eventRows.push({
      id: plan.eventId,
      previous: {
        venue_id: currentEvent?.venue_id ?? null,
      },
      next: {
        venue_id: plan.resolvedVenueId,
      },
    });
    eventLayoutRows.push({
      id: plan.layoutId,
      event_id: plan.eventId,
      venue_id: plan.resolvedVenueId,
      source_venue_layout_id: plan.sourceVenueLayoutId,
      name: event?.name ?? plan.eventName,
      description: event?.description ?? null,
      status: "active",
      metadata: asJsonMetadata({
        backfill: {
          batchId,
          source: "phase4",
          kind: "event_layout",
          eventId: plan.eventId,
          venueId: plan.resolvedVenueId,
        },
      }),
      __created: !currentIds.event_layouts.has(plan.layoutId),
    });
  }

  for (const plan of eventLayoutSectorPlan) {
    const sourceSector = records.sectors.find((sector) => sector.id === plan.sourceSectorId) ?? null;
    eventLayoutSectorIdBySourceSectorId.set(plan.sourceSectorId, plan.eventLayoutSectorId);
    eventLayoutSectorRows.push({
      id: plan.eventLayoutSectorId,
      event_layout_id: plan.layoutId,
      source_venue_layout_sector_id: plan.venueLayoutSectorId,
      name: sourceSector?.name ?? plan.sourceSectorName,
      description: sourceSector?.description ?? null,
      capacity: sourceSector?.capacity ?? null,
      display_order: sourceSector?.display_order ?? 0,
      status: sourceSector?.status ?? "active",
      metadata: asJsonMetadata({
        backfill: {
          batchId,
          source: "phase4",
          kind: "event_layout_sector",
          sourceSectorId: plan.sourceSectorId,
          eventLayoutId: plan.layoutId,
        },
      }),
      __created: !currentIds.event_layout_sectors.has(plan.eventLayoutSectorId),
    });
  }

  for (const plan of eventLayoutResourcePlan) {
    const sourceResource = records.resources.find((resource) => resource.id === plan.sourceResourceId) ?? null;
    const eventLayoutSectorId = sourceResource?.sector_id ? eventLayoutSectorIdBySourceSectorId.get(sourceResource.sector_id) ?? null : null;
    eventLayoutResourceRows.push({
      id: plan.eventLayoutResourceId,
      event_layout_id: plan.layoutId,
      event_layout_sector_id: eventLayoutSectorId,
      source_venue_layout_resource_id: plan.venueLayoutResourceId,
      type: sourceResource?.type ?? "table",
      name: plan.sourceResourceLayoutName ?? sourceResource?.name ?? plan.sourceResourceName,
      capacity: sourceResource?.capacity ?? 0,
      status: mapLayoutResourceStatus(sourceResource?.status, sourceResource?.closed),
      display_order: sourceResource?.display_order ?? 0,
      notes: sourceResource?.notes ?? null,
      metadata: asJsonMetadata({
        backfill: {
          batchId,
          source: "phase4",
          kind: "event_layout_resource",
          sourceResourceId: plan.sourceResourceId,
          originalName: plan.sourceResourceName,
          layoutName: plan.sourceResourceLayoutName ?? plan.sourceResourceName,
          eventLayoutId: plan.layoutId,
          eventLayoutSectorId,
        },
      }),
      __created: !currentIds.event_layout_resources.has(plan.eventLayoutResourceId),
    });
  }

  for (const mapping of reservationMapping.filter((entry) => entry.mapped)) {
    const reservation = records.reservations.find((row) => row.id === mapping.reservationId) ?? null;
    if (!reservation) {
      continue;
    }

    reservationRows.push({
      id: reservation.id,
      previous: {
        event_layout_id: reservation.event_layout_id ?? null,
        event_layout_resource_id: reservation.event_layout_resource_id ?? null,
        table_id: reservation.table_id ?? null,
      },
      next: {
        event_layout_id: mapping.eventLayoutId,
        event_layout_resource_id: mapping.eventLayoutResourceId,
      },
    });
  }

  return {
    venueLayoutRows,
    venueLayoutSectorRows,
    venueLayoutResourceRows,
    eventLayoutRows,
    eventLayoutSectorRows,
    eventLayoutResourceRows,
    eventRows,
    reservationRows,
  };
}

async function restRequest(url, key, table, { method = "GET", query = "", body, prefer = [] } = {}) {
  const res = await fetch(`${url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer.length ? { Prefer: prefer.join(",") } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`Failed ${method} ${table}${query}: ${JSON.stringify(payload ?? text)}`);
  }

  return payload;
}

async function upsertRows(url, key, table, rows) {
  if (!rows.length) {
    return [];
  }

  const payload = rows.map((row) => stripWritePlanRow(row));
  return restRequest(url, key, table, {
    method: "POST",
    query: "?on_conflict=id",
    body: payload,
    prefer: ["resolution=merge-duplicates", "return=representation"],
  });
}

async function patchRows(url, key, table, rows) {
  const results = [];

  for (const row of rows) {
    results.push(
      await restRequest(url, key, table, {
        method: "PATCH",
        query: `?id=eq.${row.id}`,
        body: row.next,
        prefer: ["return=representation"],
      }),
    );
  }

  return results;
}

async function deleteRows(url, key, table, ids) {
  const results = [];

  for (const id of ids) {
    results.push(
      await restRequest(url, key, table, {
        method: "DELETE",
        query: `?id=eq.${id}`,
        prefer: ["return=representation"],
      }),
    );
  }

  return results;
}

function buildSnapshot(context, batchId, approvedReportPath, approvedDigest, writePlan) {
  return {
    batchId,
    approvedReportPath,
    approvedReportDigest: approvedDigest,
    generatedAt: nowIso(),
    expected: context.report.expectations,
    affected: {
      events: writePlan.eventRows.map((row) => ({
        id: row.id,
        previous: row.previous,
        next: row.next,
      })),
      reservations: writePlan.reservationRows.map((row) => ({
        id: row.id,
        previous: row.previous,
        next: row.next,
      })),
      venueLayoutRows: writePlan.venueLayoutRows.map((row) => ({ id: row.id, created: row.__created, row: stripWritePlanRow(row) })),
      venueLayoutSectorRows: writePlan.venueLayoutSectorRows.map((row) => ({ id: row.id, created: row.__created, row: stripWritePlanRow(row) })),
      venueLayoutResourceRows: writePlan.venueLayoutResourceRows.map((row) => ({ id: row.id, created: row.__created, row: stripWritePlanRow(row) })),
      eventLayoutRows: writePlan.eventLayoutRows.map((row) => ({ id: row.id, created: row.__created, row: stripWritePlanRow(row) })),
      eventLayoutSectorRows: writePlan.eventLayoutSectorRows.map((row) => ({ id: row.id, created: row.__created, row: stripWritePlanRow(row) })),
      eventLayoutResourceRows: writePlan.eventLayoutResourceRows.map((row) => ({ id: row.id, created: row.__created, row: stripWritePlanRow(row) })),
    },
    createdIds: {
      venueLayouts: writePlan.venueLayoutRows.filter((row) => row.__created).map((row) => row.id),
      venueLayoutSectors: writePlan.venueLayoutSectorRows.filter((row) => row.__created).map((row) => row.id),
      venueLayoutResources: writePlan.venueLayoutResourceRows.filter((row) => row.__created).map((row) => row.id),
      eventLayouts: writePlan.eventLayoutRows.filter((row) => row.__created).map((row) => row.id),
      eventLayoutSectors: writePlan.eventLayoutSectorRows.filter((row) => row.__created).map((row) => row.id),
      eventLayoutResources: writePlan.eventLayoutResourceRows.filter((row) => row.__created).map((row) => row.id),
    },
  };
}

async function runApply({ approvedReportPath, emit = true } = {}) {
  if (!approvedReportPath) {
    throw new Error("Missing --report path for apply.");
  }

  const approvedBundle = await readJsonFile(approvedReportPath);
  const context = await runDryRun({ emit: false });
  const currentBundle = buildReportBundle("dry-run", context.report);

  if (!reportBundlesMatch(currentBundle, approvedBundle)) {
    throw new Error("Pre-apply validation failed: remote state differs materially from the approved dry-run report.");
  }

  const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${buildBundleDigest(currentBundle).slice(0, 8)}`;
  const writePlan = buildWritePlan(context, batchId);
  const snapshot = buildSnapshot(context, batchId, approvedReportPath, buildBundleDigest(approvedBundle), writePlan);
  const snapshotPath = resolve(REPORT_DIR, `apply-snapshot-${batchId}.json`);
  await writeJsonFile(snapshotPath, snapshot);

  const { url, serviceRoleKey } = getSupabaseConfig();
  await upsertRows(url, serviceRoleKey, "venue_layouts", writePlan.venueLayoutRows);
  await upsertRows(url, serviceRoleKey, "venue_layout_sectors", writePlan.venueLayoutSectorRows);
  await upsertRows(url, serviceRoleKey, "venue_layout_resources", writePlan.venueLayoutResourceRows);
  await upsertRows(url, serviceRoleKey, "event_layouts", writePlan.eventLayoutRows);
  await upsertRows(url, serviceRoleKey, "event_layout_sectors", writePlan.eventLayoutSectorRows);
  await upsertRows(url, serviceRoleKey, "event_layout_resources", writePlan.eventLayoutResourceRows);
  await patchRows(url, serviceRoleKey, "events", writePlan.eventRows);
  await patchRows(url, serviceRoleKey, "reservations", writePlan.reservationRows);

  const postContext = await runDryRun({ emit: false });
  const postEventsById = new Map(postContext.records.events.map((event) => [event.id, event]));
  const postEventLayoutResourcesById = new Map(postContext.records.event_layout_resources.map((row) => [row.id, row]));
  const mappingByReservationId = new Map(context.plans.reservationMapping.filter((entry) => entry.mapped).map((entry) => [entry.reservationId, entry]));

  for (const eventResolution of context.report.events.venueResolution) {
    const event = postEventsById.get(eventResolution.eventId);
    if (!event || event.venue_id !== eventResolution.resolvedVenueId) {
      throw new Error(`Post-apply validation failed for event ${eventResolution.eventId}: venue_id mismatch.`);
    }
  }

  for (const reservation of postContext.records.reservations) {
    const expected = mappingByReservationId.get(reservation.id);
    if (!expected) {
      continue;
    }

    if (reservation.event_layout_id !== expected.eventLayoutId) {
      throw new Error(`Post-apply validation failed for reservation ${reservation.id}: event_layout_id mismatch.`);
    }

    if (reservation.event_layout_resource_id !== expected.eventLayoutResourceId) {
      throw new Error(`Post-apply validation failed for reservation ${reservation.id}: event_layout_resource_id mismatch.`);
    }

    const eventLayoutResource = postEventLayoutResourcesById.get(reservation.event_layout_resource_id);
    if (!eventLayoutResource || eventLayoutResource.event_layout_id !== reservation.event_layout_id) {
      throw new Error(`Post-apply validation failed for reservation ${reservation.id}: event_layout_resource does not belong to the same event.`);
    }
  }

  for (const row of postContext.records.reservations) {
    const previous = snapshot.affected.reservations.find((item) => item.id === row.id)?.previous;
    if (!previous || previous.table_id !== row.table_id) {
      throw new Error(`Post-apply validation failed for reservation ${row.id}: table_id changed.`);
    }
  }

  if (postContext.report.events.resolved !== EXPECTED.resolvedEvents || postContext.report.events.unresolved.length !== 0 || postContext.report.events.ambiguous.length !== 0) {
    throw new Error("Post-apply validation failed: event venue resolution is not clean.");
  }

  if (postContext.report.reservations.total !== EXPECTED.reservations || postContext.report.reservations.mapped !== EXPECTED.reservationsMapped || postContext.report.reservations.unmapped.length !== 0 || postContext.report.reservations.ambiguous !== 0) {
    throw new Error("Post-apply validation failed: reservation mapping counts are not correct.");
  }

  if (postContext.report.conflicts.duplicateActiveReservationsByResource.length !== EXPECTED.conflictClusters) {
    throw new Error("Post-apply validation failed: historical conflict clusters changed.");
  }

  const result = {
    batchId,
    snapshotPath,
    approvedReportPath,
    appliedAt: nowIso(),
    postValidation: {
      eventsWithVenueId: postContext.report.events.resolved,
      reservationsWithEventLayoutId: postContext.records.reservations.filter((row) => row.event_layout_id).length,
      reservationsWithEventLayoutResourceId: postContext.records.reservations.filter((row) => row.event_layout_resource_id).length,
      reservationsPreservedTableId: postContext.records.reservations.every((row) => snapshot.affected.reservations.find((item) => item.id === row.id)?.previous.table_id === row.table_id),
      ambiguousReservations: postContext.report.reservations.ambiguous,
      unmappedReservations: postContext.report.reservations.unmapped.length,
      conflicts: postContext.report.conflicts.duplicateActiveReservationsByResource.length,
    },
  };

  const resultPath = await writeJsonFile(resolve(REPORT_DIR, `apply-result-${batchId}.json`), result);

  if (emit) {
    console.log("APPLY completed successfully.");
    console.log(`Snapshot written to: ${snapshotPath}`);
    console.log(`Result written to: ${resultPath}`);
  }

  return result;
}

async function runRollback({ snapshotPath } = {}) {
  if (!snapshotPath) {
    throw new Error("Missing --snapshot path for rollback.");
  }

  const snapshot = await readJsonFile(snapshotPath);
  const { url, serviceRoleKey } = getSupabaseConfig();

  await patchRows(url, serviceRoleKey, "reservations", snapshot.affected.reservations.map((row) => ({ id: row.id, next: row.previous })));
  await patchRows(url, serviceRoleKey, "events", snapshot.affected.events.map((row) => ({ id: row.id, next: row.previous })));
  await deleteRows(url, serviceRoleKey, "event_layout_resources", snapshot.createdIds.eventLayoutResources);
  await deleteRows(url, serviceRoleKey, "event_layout_sectors", snapshot.createdIds.eventLayoutSectors);
  await deleteRows(url, serviceRoleKey, "event_layouts", snapshot.createdIds.eventLayouts);
  await deleteRows(url, serviceRoleKey, "venue_layout_resources", snapshot.createdIds.venueLayoutResources);
  await deleteRows(url, serviceRoleKey, "venue_layout_sectors", snapshot.createdIds.venueLayoutSectors);
  await deleteRows(url, serviceRoleKey, "venue_layouts", snapshot.createdIds.venueLayouts);

  const result = {
    batchId: snapshot.batchId,
    rolledBackAt: nowIso(),
    snapshotPath,
  };

  const resultPath = await writeJsonFile(resolve(REPORT_DIR, `rollback-result-${snapshot.batchId}.json`), result);
  console.log("ROLLBACK completed successfully.");
  console.log(`Result written to: ${resultPath}`);
  return result;
}

function printHumanReport(report) {
  const lines = [];
  lines.push("Fase 4 - dry-run");
  lines.push(`Generated at: ${nowIso()}`);
  lines.push("");
  lines.push(`Venues detected: ${report.venues.detected}`);
  lines.push(`Events detected: ${report.events.detected}`);
  lines.push(`Events resolved: ${report.events.resolved}`);
  lines.push(`Events unresolved: ${report.events.unresolved.length}`);
  lines.push(`Events ambiguous: ${report.events.ambiguous.length}`);
  lines.push(`Venue layouts to create/reuse: ${report.venueLayouts.length}`);
  lines.push(`Venue layout sectors to create/reuse: ${report.venueLayoutSectors.length}`);
  lines.push(`Venue layout resources to create/reuse: ${report.venueLayoutResources.length}`);
  lines.push(`Event layouts to create/reuse: ${report.eventLayouts.length}`);
  lines.push(`Event layout sectors to create/reuse: ${report.eventLayoutSectors.length}`);
  lines.push(`Event layout resources to create/reuse: ${report.eventLayoutResources.length}`);
  lines.push(`Reservations total: ${report.reservations.total}`);
  lines.push(`Reservations mapped: ${report.reservations.mapped}`);
  lines.push(`Reservations unmapped: ${report.reservations.unmapped.length}`);
  lines.push(`Conflict clusters: ${report.conflicts.duplicateActiveReservationsByResource.length}`);
  lines.push(`Orphan resources: ${report.conflicts.orphanResources.length}`);
  lines.push(`Orphan sectors: ${report.conflicts.orphanSectors.length}`);
  lines.push("");
  lines.push("Venue resolution by event:");
  for (const item of report.events.venueResolution) {
    lines.push(`- ${item.eventName}: ${item.resolvedVenueName ?? "UNRESOLVED"} via ${item.resolutionMethod ?? "n/a"}`);
  }
  lines.push("");
  lines.push("Expected vs actual:");
  for (const [key, expected] of Object.entries(report.expectations)) {
    const actual =
      key === "venues" ? report.venues.detected
        : key === "events" ? report.events.detected
          : key === "resolvedEvents" ? report.events.resolved
            : key === "venueLayouts" ? report.venueLayouts.length
              : key === "venueLayoutSectors" ? report.venueLayoutSectors.length
                : key === "venueLayoutResources" ? report.venueLayoutResources.length
                  : key === "eventLayouts" ? report.eventLayouts.length
                    : key === "eventLayoutSectors" ? report.eventLayoutSectors.length
                      : key === "eventLayoutResources" ? report.eventLayoutResources.length
                        : key === "reservations" ? report.reservations.total
                          : key === "reservationsMapped" ? report.reservations.mapped
                            : key === "ambiguousReservations" ? report.reservations.ambiguous
                              : key === "unmappedReservations" ? report.reservations.unmapped.length
                                : key === "conflictClusters" ? report.conflicts.duplicateActiveReservationsByResource.length
                                  : undefined;
    lines.push(`- ${key}: expected ${expected}, actual ${actual}, ${expected === actual ? "PASS" : "FAIL"}`);
  }
  lines.push("");
  lines.push("Conflicts:");
  for (const cluster of report.conflicts.duplicateActiveReservationsByResource) {
    lines.push(`- ${cluster.key}: ${cluster.reservations.length} active reservations`);
    for (const reservation of cluster.reservations) {
      lines.push(`  - ${reservation.code} (${reservation.status}) ${reservation.tableName} [${reservation.tableId}]`);
    }
  }
  return lines.join("\n");
}

async function main() {
  const mode = (process.argv[2] ?? "dry-run").trim();

  if (mode !== "dry-run" && mode !== "apply" && mode !== "rollback") {
    throw new Error(`Unknown mode: ${mode}. Use dry-run, apply, or rollback.`);
  }

  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (mode === "dry-run") {
    await runDryRun();
    return;
  }

  if (mode === "apply") {
    const reportIndex = process.argv.indexOf("--report");
    const approvedReportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : null;
    if (!approvedReportPath) {
      throw new Error("Use --report <approved-dry-run-json> for apply.");
    }
    await runApply({ approvedReportPath });
    return;
  }

  const snapshotIndex = process.argv.indexOf("--snapshot");
  const snapshotPath = snapshotIndex >= 0 ? process.argv[snapshotIndex + 1] : null;
  if (!snapshotPath) {
    throw new Error("Use --snapshot <apply-snapshot-json> for rollback.");
  }
  await runRollback({ snapshotPath });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
