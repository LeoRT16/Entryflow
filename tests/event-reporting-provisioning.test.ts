import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../supabase/migrations/20261027000000_event_reporting_provisioning_intent.sql", import.meta.url);

test("Event creation migration preserves layout behavior and records eligible Reporting intent", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /if p_venue_id is not null then v_layout:=public\.materialize_event_layout_atomic\(p_id\); end if;/);
  assert.match(sql, /reporting_drive_integrations i where i\.organization_id=p_organization_id and i\.enabled and i\.status='connected' and i\.oauth_secret_id is not null/);
  assert.match(sql, /request_drive_event_provisioning_internal\(p_id,'provision_event'\)/);
  assert.match(sql, /request_reporting_spreadsheet_provisioning\(new\.event_id\)/);
  assert.match(sql, /create trigger event_drive_location_reporting_ready/);
  assert.doesNotMatch(sql, /insert into public\.reporting_destinations/);
});

test("Event creation migration keeps the same authenticated RPC signature", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.create_event_with_layout_atomic\(/);
  assert.match(sql, /grant execute on function public\.create_event_with_layout_atomic\(/);
  assert.match(sql, /to authenticated;/);
});
