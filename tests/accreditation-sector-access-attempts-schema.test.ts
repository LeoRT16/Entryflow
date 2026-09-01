import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Phase 3B migration is additive, historical, scoped, and append-only", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260831000000_accreditation_phase_3b.sql", import.meta.url), "utf8");

  assert.match(sql, /create table if not exists public\.accreditation_sector_access_attempts/);
  assert.match(sql, /access_grant_id uuid references public\.accreditation_access_grants\(id\) on delete restrict/);
  assert.match(sql, /enrollment_id uuid references public\.accreditation_enrollments\(id\) on delete restrict/);
  assert.match(sql, /sector_id uuid references public\.accreditation_access_sectors\(id\) on delete restrict/);
  assert.match(sql, /operator_profile_id uuid not null references public\.profiles\(id\) on delete restrict/);
  assert.match(sql, /source in \('qr', 'manual_code', 'manual_operator'\)/i);
  assert.match(sql, /decision in \('allow', 'deny'\)/i);
  assert.match(sql, /evaluated_at timestamptz not null/);
  assert.match(sql, /create index if not exists accreditation_sector_access_attempts_event_evaluated_at_idx/);
  assert.match(sql, /before update or delete on public\.accreditation_sector_access_attempts/);
  assert.match(sql, /alter table public\.accreditation_sector_access_attempts enable row level security/);
  assert.match(sql, /create policy "Tenant-scoped accreditation sector access attempt select"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation sector access attempt insert"/);
  assert.doesNotMatch(sql, /create policy .*attempt.*delete/i);
  assert.doesNotMatch(sql, /unique.*access_grant_id/i);
  assert.doesNotMatch(sql, /accreditation_checkins/);
  assert.doesNotMatch(sql, /occupancy|checkpoint|gate|bulk/i);
});

test("Phase 3B evaluation is server-authoritative and separate from event admission", () => {
  const route = readFileSync(new URL("../app/api/accreditation/events/[eventId]/sector-access/attempts/route.ts", import.meta.url), "utf8");

  assert.match(route, /permissions\.includes\("checkin\.perform"\)/);
  assert.match(route, /evaluateAccreditationSectorAccess/);
  assert.match(route, /sectorRepositories\.attempts\.append/);
  assert.doesNotMatch(route, /accreditation_checkins/);
});
