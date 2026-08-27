import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccreditationEventProfile,
  isAccreditationPhase2EventType,
} from "@/features/accreditation/events";

test("conference, seminar, and workshop are recognized as Phase 2 event types", () => {
  assert.equal(isAccreditationPhase2EventType("conference"), true);
  assert.equal(isAccreditationPhase2EventType("seminar"), true);
  assert.equal(isAccreditationPhase2EventType("workshop"), true);
});

test("unrelated event types are rejected by the Phase 2 event profile", () => {
  assert.equal(isAccreditationPhase2EventType("nightlife"), false);
  assert.equal(
    buildAccreditationEventProfile(
      {
        id: "event-1",
        name: "Boliche",
        eventType: "nightlife",
        operationalModel: "mixed",
        startAt: "2026-08-27T19:00:00.000Z",
        endAt: undefined,
        timezone: "America/La_Paz",
        venue: "Main room",
      },
      {
        participantCount: 0,
        activeParticipantCount: 0,
        cancelledParticipantCount: 0,
      },
    ),
    null,
  );
});

test("conference event profile exposes the canonical operational labels", () => {
  const profile = buildAccreditationEventProfile(
    {
      id: "event-2",
      name: "Conferencia 2026",
      eventType: "conference",
      operationalModel: "accreditation",
      startAt: "2026-09-01T15:00:00.000Z",
      endAt: "2026-09-01T19:00:00.000Z",
      timezone: "America/La_Paz",
      venue: "Auditorio principal",
    },
    {
      participantCount: 42,
      activeParticipantCount: 39,
      cancelledParticipantCount: 3,
    },
  );

  assert.ok(profile);
  assert.equal(profile?.eventTypeLabel, "Conferencia");
  assert.equal(profile?.operationalModelLabel, "Acreditación");
  assert.equal(profile?.participantCount, 42);
  assert.equal(profile?.activeParticipantCount, 39);
  assert.equal(profile?.cancelledParticipantCount, 3);
});
