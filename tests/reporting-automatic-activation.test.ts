import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const migration = readFileSync("supabase/migrations/20261029000000_reporting_automatic_destination_activation.sql", "utf8");
test("automatic activation requires ready spreadsheet, Drive location, and connected OAuth", () => { assert.match(migration, /status='ready'/g); assert.match(migration, /status='connected'/); assert.match(migration, /oauth_secret_id is not null/); });
test("activation creates one initial durable sequence without resetting history", () => { assert.match(migration, /last_requested_sequence\+1/); assert.match(migration, /insert into public\.reporting_outbox/); assert.doesNotMatch(migration, /last_processed_sequence\s*=/); });
test("ready transition is the automatic activation boundary", () => { assert.match(migration, /after insert or update of status/); assert.match(migration, /new\.status='ready'/); });
test("manual disable is protected by an explicit lifecycle state", () => { assert.match(migration, /manual_disabled/); assert.match(migration, /activation_state='active'/); });
test("activation is organization scoped and service-only", () => { assert.match(migration, /grant execute on function public\.activate_reporting_destination_automatic\(uuid\) to service_role/); assert.match(migration, /d\.organization_id/); });
