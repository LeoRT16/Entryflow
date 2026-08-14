import assert from "node:assert/strict";
import test from "node:test";

import { isOperationalEventStatus, pickCurrentEventId } from "../features/events/domain/event-rules";
import { isTerminalReservationStatus, isReservationOperational } from "../features/reservations/domain/reservation-domain";

test("terminal events are not operational", () => {
  assert.equal(isOperationalEventStatus("live"), true);
  assert.equal(isOperationalEventStatus("published"), true);
  assert.equal(isOperationalEventStatus("finished"), false);
  assert.equal(isOperationalEventStatus("cancelled"), false);
});

test("event selection preserves the current operational event", () => {
  const nextId = pickCurrentEventId(
    [
      {
        id: "event-live",
        organizationId: "org-1",
        status: "live",
        updatedAt: "2026-08-13T21:00:00.000Z",
        startAt: "2026-08-13 21:00",
      },
      {
        id: "event-finished",
        organizationId: "org-1",
        status: "finished",
        updatedAt: "2026-08-13T20:00:00.000Z",
        startAt: "2026-08-13 20:00",
      },
    ],
    "org-1",
    "event-live",
  );

  assert.equal(nextId, "event-live");
});

test("event selection prefers operational events over closed ones", () => {
  const nextId = pickCurrentEventId(
    [
      {
        id: "event-finished",
        organizationId: "org-1",
        status: "finished",
        updatedAt: "2026-08-13T20:00:00.000Z",
        startAt: "2026-08-13 20:00",
      },
      {
        id: "event-published",
        organizationId: "org-1",
        status: "published",
        updatedAt: "2026-08-13T21:00:00.000Z",
        startAt: "2026-08-13 21:00",
      },
    ],
    "org-1",
    "event-finished",
  );

  assert.equal(nextId, "event-published");
});

test("event selection keeps a historical event when no operational events exist", () => {
  const nextId = pickCurrentEventId(
    [
      {
        id: "event-finished",
        organizationId: "org-1",
        status: "finished",
        updatedAt: "2026-08-13T20:00:00.000Z",
        startAt: "2026-08-13 20:00",
      },
      {
        id: "event-cancelled",
        organizationId: "org-1",
        status: "cancelled",
        updatedAt: "2026-08-13T21:00:00.000Z",
        startAt: "2026-08-13 21:00",
      },
    ],
    "org-1",
    "event-finished",
  );

  assert.equal(nextId, "event-finished");
});

test("closed reservations are terminal", () => {
  assert.equal(isTerminalReservationStatus("Confirmed"), false);
  assert.equal(isReservationOperational("Confirmed"), true);
  assert.equal(isTerminalReservationStatus("Cancelled"), true);
  assert.equal(isTerminalReservationStatus("No Show"), true);
  assert.equal(isTerminalReservationStatus("Completed"), true);
  assert.equal(isReservationOperational("Cancelled"), false);
});
