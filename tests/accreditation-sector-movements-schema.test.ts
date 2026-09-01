import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20260831000001_accreditation_phase_3c.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/accreditation/events/[eventId]/sector-access/movements/route.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../repositories/supabase-accreditation-sector-access-repositories.ts", import.meta.url), "utf8");

test("Phase 3C is append-only, scoped, and concurrency-safe", () => {
  assert.match(sql, /create table if not exists public\.accreditation_sector_movements/);
  assert.match(sql, /movement text not null check \(movement in \('entry', 'exit'\)\)/i);
  assert.match(sql, /before update or delete on public\.accreditation_sector_movements/i);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended/i);
  assert.match(sql, /alter table public\.accreditation_sector_movements enable row level security/i);
  assert.match(sql, /organization_id = any\(public\.current_organization_ids\(\)\)/i);
  assert.match(sql, /event_id = any\(public\.current_event_ids\(\)\)/i);
  assert.doesNotMatch(sql, /unique.*access_grant_id.*sector_id/i);
  assert.doesNotMatch(sql, /accreditation_checkins/i);
  assert.doesNotMatch(sql, /capacity.*enforce/i);
});

test("movement route keeps authorization server-side and uses the RPC", () => {
  assert.match(route, /checkin\.perform/);
  assert.match(route, /movements\.record/);
  assert.match(repository, /accreditation_sector_record_movement/);
  assert.doesNotMatch(route, /accreditation_checkins/);
});
