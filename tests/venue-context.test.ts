import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Resource, Sector, Venue } from "../features/domain/types";
import {
  getVenueContextStorageKey,
  readVenueContextPreference,
  resolveTablesVenueContext,
  writeVenueContextPreference,
} from "../features/tables/domain/venue-context";
import {
  buildCreatedVenueDraft,
  buildUpdatedVenueDraft,
} from "../features/tables/components/venue-management-section";

function buildVenue(overrides: Partial<Venue>): Venue {
  return {
    id: overrides.id ?? "venue-a",
    organizationId: overrides.organizationId ?? "org-1",
    name: overrides.name ?? "Venue",
    description: overrides.description ?? undefined,
    address: overrides.address ?? undefined,
    city: overrides.city ?? undefined,
    country: overrides.country ?? undefined,
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? "2026-08-20T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-20T00:00:00.000Z",
    metadata: overrides.metadata ?? {},
  };
}

function buildSector(overrides: Partial<Sector>): Sector {
  return {
    id: overrides.id ?? "sector-a",
    venueId: overrides.venueId ?? "venue-a",
    name: overrides.name ?? "Zona",
    description: overrides.description ?? undefined,
    capacity: overrides.capacity ?? undefined,
    order: overrides.order ?? 1,
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? "2026-08-20T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-20T00:00:00.000Z",
    metadata: overrides.metadata ?? {},
  };
}

function buildResource(overrides: Partial<Resource>): Resource {
  return {
    id: overrides.id ?? "resource-a",
    venueId: overrides.venueId ?? "venue-a",
    sectorId: overrides.sectorId ?? undefined,
    type: overrides.type ?? "table",
    name: overrides.name ?? "Mesa",
    capacity: overrides.capacity ?? 6,
    status: overrides.status ?? "Available",
    order: overrides.order ?? 1,
    notes: overrides.notes ?? undefined,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? "2026-08-20T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-20T00:00:00.000Z",
  };
}

function buildMemoryStorage() {
  const state = new Map<string, string>();

  return {
    getItem(key: string) {
      return state.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
    removeItem(key: string) {
      state.delete(key);
    },
  };
}

test("venue context selects the requested venue and scopes datasets to it", () => {
  const venues = [buildVenue({ id: "venue-a", name: "Venue A" }), buildVenue({ id: "venue-b", name: "Venue B" })];
  const sectors = [buildSector({ id: "sector-a", venueId: "venue-a" }), buildSector({ id: "sector-b", venueId: "venue-b" })];
  const resources = [buildResource({ id: "resource-a", venueId: "venue-a" }), buildResource({ id: "resource-b", venueId: "venue-b" })];

  const context = resolveTablesVenueContext({
    venues,
    sectors,
    resources,
    preferredVenueId: "venue-b",
  });

  assert.equal(context.venueOptions.length, 2);
  assert.equal(context.currentVenue?.id, "venue-b");
  assert.deepEqual(context.currentVenueSectors.map((sector) => sector.id), ["sector-b"]);
  assert.deepEqual(context.currentVenueResources.map((resource) => resource.id), ["resource-b"]);
});

test("venue context falls back to the active venue and then the first venue", () => {
  const venues = [buildVenue({ id: "venue-a", status: "inactive" }), buildVenue({ id: "venue-b", status: "active" })];
  const sectors = [buildSector({ id: "sector-a", venueId: "venue-a" }), buildSector({ id: "sector-b", venueId: "venue-b" })];
  const resources = [buildResource({ id: "resource-a", venueId: "venue-a" }), buildResource({ id: "resource-b", venueId: "venue-b" })];

  const activeContext = resolveTablesVenueContext({
    venues,
    sectors,
    resources,
    preferredVenueId: "missing",
  });
  const firstFallbackContext = resolveTablesVenueContext({
    venues: [buildVenue({ id: "venue-c", status: "inactive" }), buildVenue({ id: "venue-d", status: "inactive" })],
    sectors,
    resources,
    preferredVenueId: "missing",
  });

  assert.equal(activeContext.currentVenue?.id, "venue-b");
  assert.equal(firstFallbackContext.currentVenue?.id, "venue-c");
});

test("venue context preference is persisted per organization", () => {
  const storage = buildMemoryStorage();

  writeVenueContextPreference(storage, "org-1", "venue-b");

  assert.equal(getVenueContextStorageKey("org-1"), "entryflow.currentVenueId.org-1");
  assert.equal(readVenueContextPreference(storage, "org-1"), "venue-b");

  writeVenueContextPreference(storage, "org-1", "");

  assert.equal(readVenueContextPreference(storage, "org-1"), "");
});

test("venue editor helpers keep create and edit ids separate", () => {
  const existingVenue = buildVenue({ id: "venue-a", name: "Venue A" });
  const createdVenue = buildCreatedVenueDraft({
    currentOrganizationId: "org-1",
    draftId: "venue-b",
    initialVenue: existingVenue,
    draft: {
      name: "Venue B",
      description: "",
      address: "",
      city: "",
      country: "",
      status: "active",
    },
    timestamp: "2026-08-20T00:00:00.000Z",
  });
  const updatedVenue = buildUpdatedVenueDraft({
    initialVenue: existingVenue,
    draft: {
      name: "Venue A+",
      description: "Updated description",
      address: "",
      city: "",
      country: "",
      status: "inactive",
    },
    timestamp: "2026-08-20T01:00:00.000Z",
  });

  assert.equal(createdVenue.id, "venue-b");
  assert.notEqual(createdVenue.id, existingVenue.id);
  assert.equal(createdVenue.organizationId, "org-1");
  assert.equal(createdVenue.name, "Venue B");
  assert.equal(updatedVenue.id, "venue-a");
  assert.equal(updatedVenue.name, "Venue A+");
  assert.equal(updatedVenue.status, "inactive");
});

test("venue context keeps both venues selectable after creation without mixing datasets", () => {
  const venues = [buildVenue({ id: "venue-a", name: "Venue A" }), buildVenue({ id: "venue-b", name: "Venue B" })];
  const sectors = [buildSector({ id: "sector-a", venueId: "venue-a" }), buildSector({ id: "sector-b", venueId: "venue-b" })];
  const resources = [buildResource({ id: "resource-a", venueId: "venue-a" }), buildResource({ id: "resource-b", venueId: "venue-b" })];

  const context = resolveTablesVenueContext({
    venues,
    sectors,
    resources,
    preferredVenueId: "venue-b",
  });

  assert.deepEqual(
    context.venueOptions.map((venue) => venue.id),
    ["venue-a", "venue-b"],
  );
  assert.equal(context.currentVenue?.id, "venue-b");
  assert.deepEqual(context.currentVenueSectors.map((sector) => sector.id), ["sector-b"]);
  assert.deepEqual(context.currentVenueResources.map((resource) => resource.id), ["resource-b"]);
});

test("tables flow exposes the venue context bar and the create-venue empty state", () => {
  const source = readFileSync(new URL("../features/tables/components/tables-flow.tsx", import.meta.url), "utf8");

  assert.match(source, /VENUE/);
  assert.match(source, /Crear Venue/);
  assert.match(source, /<select/);
  assert.match(source, /VenueManagementSection/);
  assert.match(source, /getVenuesForOrganization\(currentOrganization\.id, venues\)/);
  assert.match(source, /const \[selectedVenueId, setSelectedVenueId\] = useState\(currentEvent\.venueId \?\? ""\);/);
  assert.match(source, /hasHydratedVenuePreference/);
  assert.match(source, /const currentVenueId = venue\?\.id \?\? "";/);
  assert.match(source, /venues:\s*organizationVenues,/);
  assert.doesNotMatch(source, /readVenueContextPreference\(window\.localStorage, currentOrganization\.id\) \|\| currentEvent\.venueId \|\| ""/);
  assert.match(source, /resolveCurrentVenueSectors/);
  assert.match(source, /resolveCurrentVenueResources/);
  assert.match(source, /resolveCurrentEventLayout/);
  assert.match(source, /resolveCurrentVenueLayout/);
  assert.doesNotMatch(source, /inline-flex h-11 items-center rounded-2xl border border-white\/10 bg-white\/\[0\.04\] px-4 text-sm font-medium text-white/);
});

test("venue management section reuses the old editable venue fields and keeps map support absent", () => {
  const source = readFileSync(new URL("../features/tables/components/venue-management-section.tsx", import.meta.url), "utf8");

  assert.match(source, /venueName/);
  assert.match(source, /venueDescription/);
  assert.match(source, /venueAddress/);
  assert.match(source, /venueCity/);
  assert.match(source, /venueCountry/);
  assert.match(source, /venueStatus/);
  assert.match(source, /createVenue/);
  assert.match(source, /updateVenue/);
  assert.match(source, /createUuid/);
  assert.match(source, /buildCreatedVenueDraft/);
  assert.match(source, /buildUpdatedVenueDraft/);
  assert.match(source, /Guardar venue/);
  assert.match(source, /Editar/);
  assert.match(source, /\+ Nuevo Venue/);
  assert.match(source, /Solo lectura/);
  assert.match(source, /mode === "create"/);
  assert.match(source, /mode === "edit"/);
  assert.doesNotMatch(source, /coordinates|latitude|longitude|map link|map preview/i);
});
