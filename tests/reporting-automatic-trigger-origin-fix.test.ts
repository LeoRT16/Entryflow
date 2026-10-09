import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261102000000_reporting_automatic_destination_trigger_origin_fix.sql", "utf8");
const activationMigration = readFileSync("supabase/migrations/20261029000000_reporting_automatic_destination_activation.sql", "utf8");

test("automatic Drive-ready trigger passes automatic provenance", () => {
  assert.match(migration, /request_reporting_spreadsheet_provisioning\(new\.event_id,'automatic'\)/);
  assert.match(migration, /event_drive_location_reporting_ready/);
});

test("manual RPC semantics remain unchanged", () => {
  assert.match(activationMigration, /p_origin text default 'manual'/);
  assert.match(activationMigration, /p_origin not in \('automatic','manual'\)/);
});

test("the targeted migration does not perform a broad or fixture-specific backfill", () => {
  assert.doesNotMatch(migration, /update public\.reporting_destinations/i);
  assert.doesNotMatch(migration, /a27fdb74|2c6b06a5|1VTZaXu/i);
});
