import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccreditationEventProfile,
  isAccreditationPhase2EventType,
} from "@/features/accreditation/events";

test("concert, corporate, conference, seminar, workshop, theatre, and festival are recognized as accreditation event types", () => {
  assert.equal(isAccreditationPhase2EventType("concert"), true);
  assert.equal(isAccreditationPhase2EventType("corporate"), true);
  assert.equal(isAccreditationPhase2EventType("theatre"), true);
  assert.equal(isAccreditationPhase2EventType("festival"), true);
  assert.equal(isAccreditationPhase2EventType("conference"), true);
  assert.equal(isAccreditationPhase2EventType("seminar"), true);
  assert.equal(isAccreditationPhase2EventType("workshop"), true);
});

test("corporate event profiles use the canonical corporate label", () => {
  const profile = buildAccreditationEventProfile(
    {
      id: "event-corporate",
      name: "Encuentro Corporativo",
      eventType: "corporate",
      operationalModel: "reserved",
      startAt: "2026-09-10T15:00:00.000Z",
      endAt: "2026-09-10T22:00:00.000Z",
      timezone: "America/La_Paz",
      venue: "Centro de convenciones",
    },
    {
      participantCount: 120,
      activeParticipantCount: 118,
      cancelledParticipantCount: 2,
    },
  );

  assert.ok(profile);
  assert.equal(profile?.eventTypeLabel, "Corporativo");
  assert.equal(profile?.operationalModelLabel, "Reservado");
});

test("concert event profiles use the canonical concert label", () => {
  const profile = buildAccreditationEventProfile(
    {
      id: "event-concert",
      name: "Concierto Horizonte",
      eventType: "concert",
      operationalModel: "general-admission",
      startAt: "2026-09-05T15:00:00.000Z",
      endAt: "2026-09-05T23:00:00.000Z",
      timezone: "America/La_Paz",
      venue: "Estadio principal",
    },
    {
      participantCount: 250,
      activeParticipantCount: 245,
      cancelledParticipantCount: 5,
    },
  );

  assert.ok(profile);
  assert.equal(profile?.eventTypeLabel, "Concierto");
  assert.equal(profile?.participantCount, 250);
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
