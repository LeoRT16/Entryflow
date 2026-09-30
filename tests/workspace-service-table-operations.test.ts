import assert from "node:assert/strict";
import test from "node:test";
import { runAssignReservationTable, runReleaseReservationTable, runCloseTable } from "@/features/tables/application/atomic-table-operations";

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }

test("assign commits only after RPC and reports once", async () => {
  const rpc = deferred<{ changed: boolean }>(); let state = "old"; let reports = 0;
  const operation = runAssignReservationTable({ reservationId: "r", resourceId: "x", persist: () => rpc.promise, commit: () => { state = "new"; }, report: async () => { reports += 1; } });
  assert.equal(state, "old"); assert.equal(reports, 0); rpc.resolve({ changed: false }); await operation; assert.equal(state, "new"); assert.equal(reports, 1);
});

test("assign business failure leaves state and reporting untouched", async () => {
  let state = "old"; let reports = 0;
  await assert.rejects(() => runAssignReservationTable({ reservationId: "r", resourceId: "x", persist: async () => { throw new Error("business"); }, commit: () => { state = "new"; }, report: async () => { reports += 1; } }));
  assert.equal(state, "old"); assert.equal(reports, 0);
});

test("release and close preserve commit-before-report ordering", async () => {
  for (const run of [runReleaseReservationTable, runCloseTable]) {
    const rpc = deferred<{ changed: boolean }>(); let state = "old"; let reports = 0;
    const operation = run({ persist: () => rpc.promise, commit: () => { state = "new"; }, report: async () => { reports += 1; } });
    assert.equal(state, "old"); assert.equal(reports, 0); rpc.resolve({ changed: true }); await operation; assert.equal(state, "new"); assert.equal(reports, 1);
  }
});

test("reporting failure does not rollback committed state", async () => {
  let state = "old"; let reports = 0;
  await assert.rejects(() => runCloseTable({ persist: async () => ({ changed: true }), commit: () => { state = "closed"; }, report: async () => { reports += 1; throw new Error("reporting"); } }));
  assert.equal(state, "closed"); assert.equal(reports, 1);
});
