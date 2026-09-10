import type { Guest } from "@/features/check-in/types";
import type { BuildEventReportInput, ReportDiagnostic, ResourceReport, ZoneReport } from "@/features/reporting/types";
import { createReportDiagnostic, sortReportDiagnostics } from "@/features/reporting/domain/report-diagnostics";
import { combineMoney, extraWristbandSaleMoney, reservationMoney } from "@/features/reporting/domain/report-money";
import { isCommerciallyRegistered } from "@/features/reservations/domain/commercial-summary";
import { isReservationOperational, normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import type { ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";
import type { ReservationRecord } from "@/features/reservations/types";
import { isPhysicalTableGuest } from "@/features/tables/domain/table-domain";

type ResourceInputs = Pick<
  BuildEventReportInput,
  "event" | "venue" | "resources" | "sectors" | "tables" | "eventLayouts" | "eventLayoutResources" | "eventLayoutSectors"
> & {
  reservations: ReservationRecord[];
  guests: Guest[];
  operationalGuestIds: Set<string>;
  soldSales: ExtraWristbandSale[];
};

type ResolvedResource = {
  key: string;
  id: string;
  name: string;
  type: ResourceReport["resourceType"];
  capacity: number;
  venueId: string;
  venueName: string;
  sectorId: string | null;
  sectorName: string | null;
  activeInventory: boolean;
  diagnostics: ReportDiagnostic[];
};

function isActiveReservation(reservation: ReservationRecord) {
  return normalizeReservationStatus(reservation.status) !== "Draft" && isReservationOperational(reservation.status);
}

function resolveSector(
  reservation: ReservationRecord,
  resource: Omit<ResolvedResource, "sectorId" | "sectorName" | "diagnostics">,
  input: ResourceInputs,
  eventLayoutSectorId?: string,
) {
  if (eventLayoutSectorId) {
    const layoutSector = input.eventLayoutSectors.find((sector) => sector.id === eventLayoutSectorId);
    if (layoutSector) return { sectorId: layoutSector.id, sectorName: layoutSector.name, diagnostics: [] as ReportDiagnostic[] };
  }

  if (reservation.sectorId && reservation.sectorName) {
    return { sectorId: reservation.sectorId, sectorName: reservation.sectorName, diagnostics: [] as ReportDiagnostic[] };
  }

  const currentResource = input.resources.find((item) => item.id === reservation.resourceId);
  const legacyTable = input.tables.find((item) => item.id === reservation.tableId);
  const sectorId = reservation.sectorId ?? currentResource?.sectorId ?? legacyTable?.sectorId;
  const currentSector = sectorId ? input.sectors.find((sector) => sector.id === sectorId) : undefined;
  if (currentSector) return { sectorId: currentSector.id, sectorName: currentSector.name, diagnostics: [] as ReportDiagnostic[] };

  return {
    sectorId: sectorId ?? null,
    sectorName: reservation.sectorName ?? null,
    diagnostics: [createReportDiagnostic({
      code: "historical_sector_unresolved",
      severity: "warning",
      entityType: "resource",
      entityId: resource.id,
      message: `No se pudo resolver la zona histórica del Resource ${resource.name}.`,
      details: { reservationId: reservation.id, sectorId: sectorId ?? null },
    })],
  };
}

function resolveReservationResource(reservation: ReservationRecord, input: ResourceInputs): ResolvedResource | null {
  const venueId = reservation.venueId ?? input.event.venueId ?? input.venue?.id ?? "";
  const venueName = input.venue?.name ?? input.event.venue;
  const layoutResource = reservation.eventLayoutResourceId
    ? input.eventLayoutResources.find((resource) => resource.id === reservation.eventLayoutResourceId)
    : undefined;
  let base: Omit<ResolvedResource, "sectorId" | "sectorName" | "diagnostics"> | null = null;
  let layoutSectorId: string | undefined;

  if (layoutResource) {
    base = {
      key: `event-layout-resource:${layoutResource.id}`,
      id: layoutResource.id,
      name: layoutResource.name,
      type: layoutResource.type,
      capacity: Math.max(0, layoutResource.capacity),
      venueId,
      venueName,
      activeInventory: layoutResource.status === "active",
    };
    layoutSectorId = layoutResource.eventLayoutSectorId;
  } else if (reservation.resourceId && (reservation.resourceName || reservation.tableName)) {
    const currentResource = input.resources.find((resource) => resource.id === reservation.resourceId);
    const legacyTable = input.tables.find((table) => table.id === reservation.tableId || table.id === reservation.resourceId);
    base = {
      key: `resource:${reservation.resourceId}`,
      id: reservation.resourceId,
      name: reservation.resourceName || reservation.tableName,
      type: currentResource?.type ?? legacyTable?.type ?? "table",
      capacity: Math.max(0, reservation.tableCapacity),
      venueId,
      venueName,
      activeInventory: currentResource?.status !== "Closed",
    };
  } else if (reservation.resourceId) {
    const currentResource = input.resources.find((resource) => resource.id === reservation.resourceId);
    if (currentResource) {
      base = {
        key: `resource:${currentResource.id}`,
        id: currentResource.id,
        name: currentResource.name,
        type: currentResource.type,
        capacity: Math.max(0, currentResource.capacity),
        venueId: currentResource.venueId,
        venueName,
        activeInventory: currentResource.status !== "Closed",
      };
    }
  }

  if (!base && reservation.tableId) {
    const table = input.tables.find((item) => item.id === reservation.tableId);
    if (table) {
      base = {
        key: `resource:${table.id}`,
        id: table.id,
        name: table.name,
        type: table.type,
        capacity: Math.max(0, table.capacity),
        venueId: table.venueId,
        venueName,
        activeInventory: table.status !== "Closed" && !table.closed,
      };
    }
  }

  if (!base) return null;
  const sector = resolveSector(reservation, base, input, layoutSectorId);
  return { ...base, ...sector };
}

function resolveLayoutResource(resourceId: string, input: ResourceInputs): ResolvedResource {
  const resource = input.eventLayoutResources.find((item) => item.id === resourceId)!;
  const sector = resource.eventLayoutSectorId
    ? input.eventLayoutSectors.find((item) => item.id === resource.eventLayoutSectorId)
    : undefined;
  const diagnostics = sector ? [] : [createReportDiagnostic({
    code: "historical_sector_unresolved",
    severity: "warning",
    entityType: "resource",
    entityId: resource.id,
    message: `No se pudo resolver la zona histórica del Resource ${resource.name}.`,
    details: { sectorId: resource.eventLayoutSectorId ?? null },
  })];
  return {
    key: `event-layout-resource:${resource.id}`,
    id: resource.id,
    name: resource.name,
    type: resource.type,
    capacity: Math.max(0, resource.capacity),
    venueId: input.event.venueId ?? input.venue?.id ?? "",
    venueName: input.venue?.name ?? input.event.venue,
    activeInventory: resource.status === "active",
    sectorId: sector?.id ?? resource.eventLayoutSectorId ?? null,
    sectorName: sector?.name ?? null,
    diagnostics,
  };
}

function seedAvailableResources(input: ResourceInputs) {
  const eventLayoutIds = new Set(input.eventLayouts.filter((layout) => layout.eventId === input.event.id).map((layout) => layout.id));
  const layoutResources = input.eventLayoutResources.filter(
    (resource) => eventLayoutIds.has(resource.eventLayoutId) && resource.status === "active",
  );
  if (layoutResources.length) return layoutResources.map((resource) => resolveLayoutResource(resource.id, input));

  const venueId = input.event.venueId ?? input.venue?.id;
  const venueResources = input.resources.filter((resource) => !venueId || resource.venueId === venueId);
  const currentResources = venueResources.filter((resource) => resource.status !== "Closed");
  if (venueResources.length) {
    return currentResources.map((resource): ResolvedResource => {
      const sector = resource.sectorId ? input.sectors.find((item) => item.id === resource.sectorId) : undefined;
      return {
        key: `resource:${resource.id}`,
        id: resource.id,
        name: resource.name,
        type: resource.type,
        capacity: Math.max(0, resource.capacity),
        venueId: resource.venueId,
        venueName: input.venue?.name ?? input.event.venue,
        activeInventory: resource.status !== "Closed",
        sectorId: sector?.id ?? resource.sectorId ?? null,
        sectorName: sector?.name ?? null,
        diagnostics: sector ? [] : [createReportDiagnostic({
          code: "historical_sector_unresolved",
          severity: "warning",
          entityType: "resource",
          entityId: resource.id,
          message: `No se pudo resolver la zona del Resource ${resource.name}.`,
          details: { sectorId: resource.sectorId ?? null },
        })],
      };
    });
  }

  return input.tables
    .filter((table) => table.eventId === input.event.id)
    .map((table): ResolvedResource => ({
      key: `resource:${table.id}`,
      id: table.id,
      name: table.name,
      type: table.type,
      capacity: Math.max(0, table.capacity),
      venueId: table.venueId,
      venueName: input.venue?.name ?? input.event.venue,
      activeInventory: table.status !== "Closed" && !table.closed,
      sectorId: table.sectorId ?? null,
      sectorName: table.sectorId ? input.sectors.find((sector) => sector.id === table.sectorId)?.name ?? null : null,
      diagnostics: [],
    }));
}

function sumNumber(resources: ResourceReport[], field: keyof Pick<ResourceReport, "physicalCapacity" | "capacityAssigned" | "baseAccesses" | "extraWristbands" | "operationalPeople" | "historicalPeople" | "checkedInPeople" | "pendingPeople">) {
  return resources.reduce((total, resource) => total + resource[field], 0);
}

export function buildResourceReports(input: ResourceInputs) {
  const mesaReservations = input.reservations.filter((reservation) => reservation.reservationType === "Mesa");
  const resolvedByReservationId = new Map<string, ResolvedResource>();
  const diagnostics: ReportDiagnostic[] = [];

  for (const reservation of mesaReservations) {
    const resolved = resolveReservationResource(reservation, input);
    if (resolved) {
      resolvedByReservationId.set(reservation.id, resolved);
      diagnostics.push(...resolved.diagnostics);
    } else {
      diagnostics.push(createReportDiagnostic({
        code: "historical_resource_unresolved",
        severity: "error",
        entityType: "reservation",
        entityId: reservation.id,
        message: `No se pudo resolver el Resource histórico de ${reservation.code}.`,
      }));
    }
  }

  const identities = new Map(seedAvailableResources(input).map((resource) => [resource.key, resource]));
  for (const resolved of resolvedByReservationId.values()) {
    const existing = identities.get(resolved.key);
    if (existing && (existing.sectorId !== resolved.sectorId || existing.venueId !== resolved.venueId)) {
      diagnostics.push(createReportDiagnostic({
        code: "entity_relation_inconsistent",
        severity: "warning",
        entityType: "resource",
        entityId: resolved.id,
        message: `El Resource ${resolved.name} tiene relaciones históricas incompatibles.`,
      }));
    }
    if (!existing) identities.set(resolved.key, resolved);
  }

  const resources = [...identities.values()].map((identity): ResourceReport => {
    const reservations = mesaReservations.filter((reservation) => resolvedByReservationId.get(reservation.id)?.key === identity.key);
    const reservationIds = new Set(reservations.map((reservation) => reservation.id));
    const historicalGuests = input.guests.filter((guest) => reservationIds.has(guest.reservationId));
    const operationalGuests = historicalGuests.filter((guest) => input.operationalGuestIds.has(guest.id));
    const baseGuests = operationalGuests.filter(isPhysicalTableGuest);
    const extraGuests = operationalGuests.filter((guest) => !isPhysicalTableGuest(guest));
    const soldReservations = reservations.filter(isCommerciallyRegistered);
    const sales = input.soldSales.filter((sale) => reservationIds.has(sale.reservationId));
    const soldReservationValue = combineMoney(soldReservations.map(reservationMoney));
    const extraWristbandValue = combineMoney(sales.map(extraWristbandSaleMoney));
    const commercialDiagnostics: ReportDiagnostic[] = soldReservations
      .filter((reservation) => reservationMoney(reservation).amount === null)
      .map((reservation) => createReportDiagnostic({
        code: "commercial_snapshot_missing",
        severity: "error",
        entityType: "reservation",
        entityId: reservation.id,
        message: `No se puede reconstruir el valor vendido de ${reservation.code} en ${identity.name}.`,
        details: { resourceId: identity.id },
      }));
    const soldTotal = combineMoney([soldReservationValue, extraWristbandValue]);
    if (soldTotal.currencies.length > 1) {
      commercialDiagnostics.push(createReportDiagnostic({
        code: "commercial_currency_mixed",
        severity: "error",
        entityType: "resource",
        entityId: identity.id,
        message: `El Resource ${identity.name} contiene valores en monedas incompatibles.`,
        details: { currencies: soldTotal.currencies.join(",") },
      }));
    }
    const resourceDiagnostics = sortReportDiagnostics([
      ...identity.diagnostics,
      ...diagnostics.filter((diagnostic) => diagnostic.entityType === "resource" && diagnostic.entityId === identity.id),
      ...commercialDiagnostics,
    ]);
    const activeReservation = [...reservations]
      .filter(isActiveReservation)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return {
      resourceId: identity.id,
      resourceName: identity.name,
      resourceType: identity.type,
      sectorId: identity.sectorId,
      sectorName: identity.sectorName,
      venueId: identity.venueId,
      venueName: identity.venueName,
      activeInventory: identity.activeInventory,
      physicalCapacity: identity.capacity,
      capacityAssigned: baseGuests.length,
      reservationIds: reservations.map((reservation) => reservation.id),
      activeReservationId: activeReservation?.id ?? null,
      reservationCount: reservations.length,
      baseAccesses: baseGuests.length,
      extraWristbands: extraGuests.length,
      operationalPeople: operationalGuests.length,
      historicalPeople: historicalGuests.length,
      checkedInPeople: operationalGuests.filter((guest) => guest.admissionStatus === "Ingresó").length,
      pendingPeople: operationalGuests.filter((guest) => guest.admissionStatus === "Pendiente").length,
      soldReservationValue,
      extraWristbandValue,
      soldTotal,
      diagnostics: resourceDiagnostics,
    };
  });

  diagnostics.push(...resources.flatMap((resource) => resource.diagnostics));

  const zoneIds = [...new Set(resources.flatMap((resource) => resource.sectorId && resource.sectorName ? [resource.sectorId] : []))];
  const zones: ZoneReport[] = zoneIds.map((sectorId) => {
    const zoneResources = resources.filter((resource) => resource.sectorId === sectorId);
    const sectorName = zoneResources.find((resource) => resource.sectorName)?.sectorName;
    const zoneDiagnostics = sortReportDiagnostics(zoneResources.flatMap((resource) => resource.diagnostics));
    return {
      sectorId,
      sectorName: sectorName ?? "",
      resourceCount: zoneResources.length,
      physicalCapacity: sumNumber(zoneResources, "physicalCapacity"),
      capacityAssigned: sumNumber(zoneResources, "capacityAssigned"),
      baseAccesses: sumNumber(zoneResources, "baseAccesses"),
      extraWristbands: sumNumber(zoneResources, "extraWristbands"),
      operationalPeople: sumNumber(zoneResources, "operationalPeople"),
      historicalPeople: sumNumber(zoneResources, "historicalPeople"),
      checkedInPeople: sumNumber(zoneResources, "checkedInPeople"),
      pendingPeople: sumNumber(zoneResources, "pendingPeople"),
      soldReservationValue: combineMoney(zoneResources.map((resource) => resource.soldReservationValue)),
      extraWristbandValue: combineMoney(zoneResources.map((resource) => resource.extraWristbandValue)),
      soldTotal: combineMoney(zoneResources.map((resource) => resource.soldTotal)),
      resources: zoneResources,
      diagnostics: zoneDiagnostics,
    };
  });

  return { resources, zones, diagnostics: sortReportDiagnostics(diagnostics) };
}
