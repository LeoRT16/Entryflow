import assert from "node:assert/strict";
import test from "node:test";
import { runMoveGuestToResource } from "@/features/tables/application/guest-move-operations";
import type { GuestMoveAtomicResult } from "@/repositories/workspace-repositories";

function result(changed = true): GuestMoveAtomicResult {
  return {
    changed,
    guest_id: "g1",
    reservation_id: "r1",
    source_resource_id: "a",
    destination_resource_id: "b",
    destination_resource_name: "Mesa B (canónica)",
    table_id: "b",
    table_name: "Mesa B (canónica)",
  };
}

test("guest move stays unchanged while RPC is pending and commits authoritative fields on success", async () => {
  let resolve!: (value: GuestMoveAtomicResult) => void;
  const pending = new Promise<GuestMoveAtomicResult>((r) => { resolve = r; });
  let guest = { tableId: "a", tableName: "Mesa A" };
  let reports = 0;
  const operation = runMoveGuestToResource({
    persist: () => pending,
    commit: (value) => { guest = { tableId: value.table_id!, tableName: value.table_name! }; },
    report: async () => { reports += 1; },
  });
  assert.deepEqual(guest, { tableId: "a", tableName: "Mesa A" });
  assert.equal(reports, 0);
  resolve(result());
  await operation;
  assert.deepEqual(guest, { tableId: "b", tableName: "Mesa B (canónica)" });
  assert.equal(reports, 1);
});

test("same destination is successful without reporting", async () => {
  let committed = false;
  let reports = 0;
  await runMoveGuestToResource({
    persist: async () => result(false),
    commit: () => { committed = true; },
    report: async () => { reports += 1; },
  });
  assert.equal(committed, true);
  assert.equal(reports, 0);
});

test("business failure preserves local state and does not report", async () => {
  let guest = "a";
  let reports = 0;
  await assert.rejects(() => runMoveGuestToResource({
    persist: async () => { throw Object.assign(new Error("destination_closed"), { code: "destination_closed" }); },
    commit: () => { guest = "b"; },
    report: async () => { reports += 1; },
  }));
  assert.equal(guest, "a");
  assert.equal(reports, 0);
});

test("reporting failure does not roll back the committed guest move", async () => {
  let guest = "a";
  await assert.rejects(() => runMoveGuestToResource({
    persist: async () => result(),
    commit: (value) => { guest = value.destination_resource_id; },
    report: async () => { throw new Error("reporting"); },
  }));
  assert.equal(guest, "b");
});
