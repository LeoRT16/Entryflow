import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const migration = readFileSync("supabase/migrations/20261029000000_reporting_automatic_destination_activation.sql", "utf8");
test("automatic and manual creation persist distinct provenance", () => { assert.match(migration, /provisioning_origin/); assert.match(migration, /p_origin text default 'manual'/); assert.match(migration, /'automatic','manual'/); });
test("legacy rows stay unknown and cannot auto-activate", () => { assert.match(migration, /default 'legacy_unknown'/); assert.match(migration, /d\.provisioning_origin<>'automatic'/); });
test("R1 transition is assertion scoped without runtime UUID logic", () => { assert.match(migration, /reporting_r1_fixture_state_mismatch/); assert.match(migration, /d\.organization_id='02cf45fb-25fe-4287-be1f-71154bb102b3'/); assert.match(migration, /d\.event_id='eb2a26ec-3b07-48d5-b407-616d7224f483'/); });
