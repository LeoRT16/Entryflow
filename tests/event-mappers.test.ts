import assert from "node:assert/strict";
import test from "node:test";

import { mapEventRowToDomain, mapEventToRow } from "../lib/supabase/mappers";
import type { Event as PlatformEvent } from "../features/domain/types";
import type { EventRow } from "../lib/supabase/types";

const baseEvent = (metadata?: PlatformEvent["metadata"]): PlatformEvent => ({
  id: "event-1",
  organizationId: "org-1",
  name: "Event",
  description: undefined,
  eventType: "custom",
  status: "draft",
  startAt: "2026-10-15",
  endAt: undefined,
  timezone: "America/La_Paz",
  venueId: "venue-1",
  venue: "Venue",
  capacity: 10,
  enabledModules: ["resources"],
  operationalModel: "custom",
  admissionMethods: ["qr"],
  resourceTypes: ["table"],
  icon: undefined,
  metadata,
});

test("event mapper keeps metadata null when only canonical venue_id is present", () => {
  const row = mapEventToRow(baseEvent());
  assert.equal(row.venue_id, "venue-1");
  assert.equal(row.metadata, null);
});

test("event mapper preserves unrelated metadata", () => {
  const row = mapEventToRow(baseEvent({ commercial: { mode: "table" } }));
  assert.deepEqual(row.metadata, { commercial: { mode: "table" } });
});

test("event mapper preserves legacy metadata venueId when supplied", () => {
  const row = mapEventToRow(baseEvent({ venueId: "legacy-venue", artwork: "cover" }));
  assert.deepEqual(row.metadata, { venueId: "legacy-venue", artwork: "cover" });
});

test("event row mapper prefers canonical venue_id and retains legacy fallback", () => {
  const row = {
    id: "event-1",
    organization_id: "org-1",
    name: "Event",
    description: null,
    event_type: "custom",
    status: "draft",
    start_at: "2026-10-15",
    end_at: null,
    timezone: "America/La_Paz",
    venue_id: "venue-1",
    venue: "Venue",
    capacity: 10,
    enabled_modules: ["reservations", "resources"],
    operational_model: "table_based",
    admission_methods: ["qr"],
    resource_types: ["table"],
    icon: null,
    metadata: { venueId: "legacy-venue" },
  } as unknown as EventRow;
  assert.equal(mapEventRowToDomain(row).venueId, "venue-1");
  assert.equal(mapEventRowToDomain({ ...row, venue_id: null }).venueId, "legacy-venue");
});
