import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260910000000_resource_soft_delete_rpc.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("Resource soft delete RPC is hardened and exposes only a boolean", () => {
  assert.match(migration, /create or replace function public\.soft_delete_resource\(p_resource_id uuid\)/);
  assert.match(migration, /returns boolean/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /alter function public\.soft_delete_resource\(uuid\) owner to postgres/);
  assert.match(migration, /revoke all on function public\.soft_delete_resource\(uuid\) from public/);
  assert.match(migration, /revoke all on function public\.soft_delete_resource\(uuid\) from anon/);
  assert.match(migration, /grant execute on function public\.soft_delete_resource\(uuid\) to authenticated/);
  assert.doesNotMatch(migration, /returns public\.resources/);
});

test("Resource soft delete RPC owns authorization and every canonical history guard", () => {
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /v_resource\.venue_id = any\(public\.current_venue_ids\(\)\)/);
  assert.match(migration, /'resource\.manage' = any\(r\.permissions\)/);
  assert.match(migration, /reservation\.resource_id = p_resource_id/);
  assert.match(migration, /reservation\.table_id = p_resource_id::text/);
  assert.match(migration, /guest\.table_id = p_resource_id::text/);
  assert.match(migration, /venue_layout_resource\.source_resource_id = p_resource_id/);
  assert.match(migration, /event_layout_resource\.source_venue_layout_resource_id/);
  assert.match(migration, /legacy_table\.id = p_resource_id/);
  assert.match(migration, /timeline_event\.table_id = p_resource_id::text/);
  assert.doesNotMatch(migration, /metadata\s*(?:->|@>|\?)/);
});

test("Resource soft delete RPC remains a soft delete with stable domain errors", () => {
  assert.match(migration, /resource_unauthenticated/);
  assert.match(migration, /resource_forbidden/);
  assert.match(migration, /resource_not_found/);
  assert.match(migration, /resource_already_deleted/);
  assert.match(migration, /resource_has_history/);
  assert.match(migration, /set deleted_at = now\(\),\s*updated_at = now\(\)/);
  assert.doesNotMatch(migration, /delete from public\.resources/);
});
