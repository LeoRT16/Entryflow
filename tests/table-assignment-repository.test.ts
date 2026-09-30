import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";

test("atomic table repository methods route exact RPC arguments", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = { rpc: async (name: string, args: unknown) => {
    calls.push({ name, args });
    if (name === "assign_reservation_table_atomic") return { data: { reservation_id: "r", destination_table_id: "x", guest_ids: [], changed: false }, error: null };
    if (name === "release_reservation_table_atomic") return { data: { reservation_id: "r", released_table_id: "x", guest_ids: [], changed: true }, error: null };
    return { data: { table_id: "x", status: "Closed", closed: true, changed: false }, error: null };
  } } as never;
  const repositories = createSupabaseWorkspaceRepositories(client);
  const assigned = await repositories.reservations.assignReservationTableAtomic({ reservationId: "r", resourceId: "x" });
  const released = await repositories.reservations.releaseReservationTableAtomic({ reservationId: "r", expectedResourceId: "x" });
  const closed = await repositories.tables.closeTableAtomic({ resourceId: "x" });
  assert.equal(assigned.changed, false);
  assert.equal(released.changed, true);
  assert.equal(closed.changed, false);
  assert.deepEqual(calls, [
    { name: "assign_reservation_table_atomic", args: { p_reservation_id: "r", p_destination_table_id: "x" } },
    { name: "release_reservation_table_atomic", args: { p_reservation_id: "r", p_expected_table_id: "x" } },
    { name: "close_table_atomic", args: { p_table_id: "x" } },
  ]);
});

test("atomic repository errors propagate without fallback writes", async () => {
  const error = new Error("stale_release");
  const client = { rpc: async () => ({ data: null, error }) } as never;
  const repositories = createSupabaseWorkspaceRepositories(client);
  await assert.rejects(() => repositories.reservations.releaseReservationTableAtomic({ reservationId: "r", expectedResourceId: "x" }), error);
});

test("guest move routes to the atomic RPC with resource identity and no direct write", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: {
        changed: true,
        guest_id: "g",
        reservation_id: "r",
        source_resource_id: "a",
        destination_resource_id: "b",
        destination_resource_name: "Mesa B",
        table_id: "b",
        table_name: "Mesa B",
      }, error: null };
    },
  } as never;
  const repositories = createSupabaseWorkspaceRepositories(client);
  const moved = await repositories.guests.moveGuestToResourceAtomic({ guestId: "g", destinationResourceId: "b" });
  assert.equal(moved.destination_resource_id, "b");
  assert.deepEqual(calls, [{ name: "move_guest_to_resource_atomic", args: { p_guest_id: "g", p_destination_resource_id: "b" } }]);
});
