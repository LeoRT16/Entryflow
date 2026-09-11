import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requestReportingSync } from "../repositories/reporting-sync-repositories";

test("reporting sync persistence contract keeps one coalesced intent per destination", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260910000002_reporting_sync_persistence.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.reporting_destinations/);
  assert.match(sql, /create table if not exists public\.reporting_outbox/);
  assert.match(sql, /create table if not exists public\.reporting_sync_runs/);
  assert.match(sql, /unique\(destination_id\)/);
  assert.match(sql, /on conflict on constraint reporting_outbox_destination_id_key/);
  assert.match(sql, /for update of ob skip locked/);
});

test("reporting sync worker authority is not exposed to browser roles", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260910000002_reporting_sync_persistence.sql", import.meta.url), "utf8");
  for (const fn of ["claim_reporting_sync_work", "complete_reporting_sync_success", "complete_reporting_sync_failure"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}.*service_role`));
  }
});

test("repository exposes only the authenticated request primitive", () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: [{ outbox_id: "o1", destination_id: "d1", requested_sequence: 4 }], error: null };
    },
  };
  return requestReportingSync(client as never, "event-1").then((result) => {
    assert.deepEqual(result, { outboxId: "o1", destinationId: "d1", requestedSequence: 4 });
    assert.deepEqual(calls, [{ name: "request_reporting_sync", args: { p_event_id: "event-1" } }]);
  });
});
