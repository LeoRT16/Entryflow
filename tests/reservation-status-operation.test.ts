import assert from "node:assert/strict";
import test from "node:test";
import { setReservationStatusOperation } from "@/features/reservations/application/set-reservation-status";

const reservation = { id: "reservation-1", eventId: "event-1", status: "Pending" as const };

test("ordinary reservation status persists before exactly one reporting request", async () => {
  const order: string[] = [];
  const result = await setReservationStatusOperation(reservation, "Confirmed", {
    persistOrdinary: async () => { order.push("persist"); return { reservationId: reservation.id, previousStatus: "Pending", status: "Confirmed", changed: true }; },
    cancel: async () => { throw new Error("cancel should not run"); },
    requestReporting: async () => { order.push("report"); },
  });
  assert.deepEqual(order, ["persist", "report"]);
  assert.equal(result.status, "Confirmed");
});

test("business persistence failure does not request reporting", async () => {
  let reportCalls = 0;
  await assert.rejects(() => setReservationStatusOperation(reservation, "Confirmed", {
    persistOrdinary: async () => { throw new Error("business failure"); },
    cancel: async () => undefined,
    requestReporting: async () => { reportCalls += 1; },
  }));
  assert.equal(reportCalls, 0);
});

test("unsupported reservation statuses are rejected before persistence", async () => {
  let persistCalls = 0;
  await assert.rejects(() => setReservationStatusOperation(reservation, "No Show", {
    persistOrdinary: async () => { persistCalls += 1; return { reservationId: reservation.id, previousStatus: "Pending", status: "No Show", changed: true }; },
    cancel: async () => undefined,
    requestReporting: async () => undefined,
  }));
  assert.equal(persistCalls, 0);
});

test("cancellation uses the existing atomic path and one reporting request", async () => {
  const order: string[] = [];
  const result = await setReservationStatusOperation({ ...reservation, status: "Confirmed" }, "Cancelled", {
    persistOrdinary: async () => { throw new Error("ordinary RPC should not run"); },
    cancel: async () => { order.push("cancel"); },
    requestReporting: async () => { order.push("report"); },
  });
  assert.deepEqual(order, ["cancel", "report"]);
  assert.equal(result.status, "Cancelled");
});
