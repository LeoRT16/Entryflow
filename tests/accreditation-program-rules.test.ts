import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccreditationProgramReadModel,
  buildAccreditationProgramSessionDisplay,
  compareAccreditationProgramSessions,
  getAccreditationProgramSessionLifecycleState,
  groupAccreditationProgramSessions,
  normalizeAccreditationProgramSessionType,
  validateAccreditationProgramSessionInput,
} from "@/features/accreditation/program";

test("session validation normalizes optional fields and rejects invalid time windows", () => {
  const session = validateAccreditationProgramSessionInput({
    organizationId: "org-1",
    eventId: "event-1",
    title: " Keynote ",
    description: " Opening ",
    sessionType: "keynote",
    startsAt: "2026-09-01T10:00:00.000Z",
    endsAt: "2026-09-01T11:00:00.000Z",
    room: " Main hall ",
    capacity: 120,
    metadata: { speaker: "Ada" },
  });

  assert.equal(session.title, "Keynote");
  assert.equal(session.room, "Main hall");
  assert.equal(session.capacity, 120);
  assert.equal(session.sessionType, "keynote");
  assert.equal(session.startsAt, "2026-09-01T10:00:00.000Z");
  assert.equal(session.endsAt, "2026-09-01T11:00:00.000Z");

  assert.throws(
    () =>
      validateAccreditationProgramSessionInput({
        organizationId: "org-1",
        eventId: "event-1",
        title: " ",
        startsAt: "2026-09-01T10:00:00.000Z",
        endsAt: "2026-09-01T11:00:00.000Z",
      }),
    /título/i,
  );

  assert.throws(
    () =>
      validateAccreditationProgramSessionInput({
        organizationId: "org-1",
        eventId: "event-1",
        title: "Keynote",
        startsAt: "invalid",
        endsAt: "2026-09-01T11:00:00.000Z",
      }),
    /startsAt/i,
  );

  assert.throws(
    () =>
      validateAccreditationProgramSessionInput({
        organizationId: "org-1",
        eventId: "event-1",
        title: "Keynote",
        startsAt: "2026-09-01T10:00:00.000Z",
        endsAt: "invalid",
      }),
    /endsAt/i,
  );

  assert.throws(
    () =>
      validateAccreditationProgramSessionInput({
        organizationId: "org-1",
        eventId: "event-1",
        title: "Keynote",
        startsAt: "2026-09-01T11:00:00.000Z",
        endsAt: "2026-09-01T11:00:00.000Z",
      }),
    /terminar después de comenzar/i,
  );
});

test("session ordering, lifecycle, and program grouping are deterministic", () => {
  const sessions = [
    {
      id: "session-b",
      organizationId: "org-1",
      eventId: "event-1",
      title: "Panel",
      sessionType: "panel" as const,
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-01T13:00:00.000Z",
      status: "active" as const,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    {
      id: "session-a",
      organizationId: "org-1",
      eventId: "event-1",
      title: "Keynote",
      sessionType: "keynote" as const,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T11:00:00.000Z",
      status: "active" as const,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    },
    {
      id: "session-c",
      organizationId: "org-1",
      eventId: "event-1",
      title: "Break",
      sessionType: "break" as const,
      startsAt: "2026-09-02T10:00:00.000Z",
      endsAt: "2026-09-02T10:30:00.000Z",
      status: "cancelled" as const,
      cancelledAt: "2026-08-27T12:00:00.000Z",
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T12:00:00.000Z",
    },
  ];

  const ordered = [...sessions].sort(compareAccreditationProgramSessions);

  assert.equal(ordered[0]?.id, "session-a");
  assert.equal(ordered[1]?.id, "session-b");
  assert.equal(getAccreditationProgramSessionLifecycleState(sessions[0] as never, () => "2026-09-01T12:30:00.000Z"), "in_progress");
  assert.equal(getAccreditationProgramSessionLifecycleState(sessions[2] as never, () => "2026-09-01T12:30:00.000Z"), "cancelled");

  const display = buildAccreditationProgramSessionDisplay(sessions[0] as never, "America/La_Paz", () => "2026-09-01T12:30:00.000Z");
  assert.match(display.timeRangeLabel, /8:00/);
  assert.match(display.timeRangeLabel, /9:00/);

  const groups = groupAccreditationProgramSessions(sessions as never, "America/La_Paz", () => "2026-09-01T12:30:00.000Z");
  assert.equal(groups.length >= 2, true);

  const model = buildAccreditationProgramReadModel({
    event: {
      id: "event-1",
      name: "Conferencia",
      eventType: "conference",
      operationalModel: "accreditation",
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-02T18:00:00.000Z",
      timezone: "America/La_Paz",
      venue: "Auditorio",
    },
    sessions: sessions as never,
    clock: () => "2026-09-01T12:30:00.000Z",
  });

  assert.equal(model?.summary.total, 3);
  assert.equal(model?.summary.cancelled, 1);
});

test("session type normalization falls back to other for unknown labels", () => {
  assert.equal(normalizeAccreditationProgramSessionType(" keynote "), "keynote");
  assert.equal(normalizeAccreditationProgramSessionType("anything-else"), "other");
});
