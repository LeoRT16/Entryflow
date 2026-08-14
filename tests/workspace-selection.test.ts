import assert from "node:assert/strict";
import test from "node:test";

import { getEventSelection } from "../services/workspace-service";
import type { Event as PlatformEvent } from "../features/domain/types";

function buildEvent(overrides: Partial<PlatformEvent>): PlatformEvent {
  return {
    id: overrides.id ?? "event-1",
    organizationId: overrides.organizationId ?? "org-1",
    name: overrides.name ?? "Evento",
    description: overrides.description ?? undefined,
    eventType: overrides.eventType ?? "custom",
    status: overrides.status ?? "draft",
    startAt: overrides.startAt ?? "2026-08-14 20:00",
    endAt: overrides.endAt ?? undefined,
    timezone: overrides.timezone ?? "America/La_Paz",
    venueId: overrides.venueId ?? undefined,
    venue: overrides.venue ?? "Venue",
    capacity: overrides.capacity ?? 120,
    enabledModules: overrides.enabledModules ?? [],
    operationalModel: overrides.operationalModel ?? "mixed",
    admissionMethods: overrides.admissionMethods ?? [],
    resourceTypes: overrides.resourceTypes ?? [],
    icon: overrides.icon ?? undefined,
    metadata: overrides.metadata ?? undefined,
  };
}

test("hydrated event selection preserves the current event instead of reselecting a different live one", () => {
  const selected = getEventSelection(
    [
      buildEvent({
        id: "event-finished",
        organizationId: "org-1",
        status: "finished",
        startAt: "2026-08-14 18:00",
      }),
      buildEvent({
        id: "event-live",
        organizationId: "org-1",
        status: "live",
        startAt: "2026-08-14 21:00",
      }),
    ],
    "org-1",
    "event-finished",
  );

  assert.equal(selected.id, "event-finished");
});

test("hydrated event selection still falls back when the current event is missing", () => {
  const selected = getEventSelection(
    [
      buildEvent({
        id: "event-live",
        organizationId: "org-1",
        status: "live",
        startAt: "2026-08-14 21:00",
      }),
      buildEvent({
        id: "event-published",
        organizationId: "org-1",
        status: "published",
        startAt: "2026-08-14 22:00",
      }),
    ],
    "org-1",
    "missing-event",
  );

  assert.equal(selected.id, "event-live");
});
