import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { softDeleteResource } from "../repositories/supabase-workspace-repositories";
import type { Database } from "../lib/supabase/types";

function buildClient(error: unknown = null) {
  const calls: Array<{ name: string; value: unknown }> = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ name: "rpc", value: { name, args } });
      return { data: error ? null : true, error };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

test("Resource delete delegates enforcement to the canonical RPC", async () => {
  const { client, calls } = buildClient();

  assert.equal(await softDeleteResource(client, "resource-1"), true);
  assert.deepEqual(calls, [
    {
      name: "rpc",
      value: { name: "soft_delete_resource", args: { p_resource_id: "resource-1" } },
    },
  ]);
});

test("Resource RPC delete propagates structured PostgREST errors", async () => {
  const persistenceError = { code: "P0001", message: "resource_has_history" };
  const { client } = buildClient(persistenceError);

  await assert.rejects(() => softDeleteResource(client, "resource-1"), (error) => error === persistenceError);
});
