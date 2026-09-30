import assert from "node:assert/strict";
import test from "node:test";
import { persistReservationThenGuests } from "@/features/reservations/application/preventa-ordering";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

test("Preventa reports only after every guest write", async () => {
  const a = deferred<void>(); const b = deferred<void>(); let reports = 0; let reservationDone = false;
  const operation = persistReservationThenGuests({ persistReservation: async () => { reservationDone = true; }, guests: ["a", "b"], persistGuest: (guest) => guest === "a" ? a.promise : b.promise, report: async () => { reports += 1; } });
  assert.equal(reservationDone, true); assert.equal(reports, 0); a.resolve(); await Promise.resolve(); assert.equal(reports, 0); b.resolve(); await operation; assert.equal(reports, 1);
});

test("Preventa guest failure prevents reporting", async () => {
  let reports = 0;
  await assert.rejects(() => persistReservationThenGuests({ persistReservation: async () => undefined, guests: ["a"], persistGuest: async () => { throw new Error("guest"); }, report: async () => { reports += 1; } }));
  assert.equal(reports, 0);
});
