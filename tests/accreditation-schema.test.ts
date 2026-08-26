import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("accreditation migration adds only additive enrollment and category structures", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826000000_accreditation_phase_1a.sql", import.meta.url), "utf8");

  assert.match(sql, /create table if not exists public\.accreditation_categories/);
  assert.match(sql, /create table if not exists public\.accreditation_enrollments/);
  assert.match(sql, /organization_id uuid not null references public\.organizations\(id\) on delete cascade/);
  assert.match(sql, /event_id uuid not null references public\.events\(id\) on delete cascade/);
  assert.match(sql, /category_id uuid references public\.accreditation_categories\(id\) on delete set null/);
  assert.match(sql, /sector_id uuid references public\.sectors\(id\) on delete set null/);
  assert.match(sql, /status text not null default 'active'/);
  assert.match(sql, /constraint accreditation_enrollments_status_check check \(status in \('active', 'cancelled'\)\)/i);
  assert.match(sql, /create unique index if not exists accreditation_categories_event_slug_unique/);
  assert.match(sql, /where deleted_at is null/);
  assert.match(sql, /create index if not exists accreditation_enrollments_organization_event_idx/);
  assert.match(sql, /create index if not exists accreditation_enrollments_event_status_idx/);
  assert.match(sql, /create index if not exists accreditation_enrollments_event_category_idx/);
  assert.match(sql, /create index if not exists accreditation_enrollments_event_sector_idx/);
  assert.match(sql, /create or replace function public\.current_sector_ids\(\)/);
  assert.match(sql, /create or replace function public\.accreditation_enrollment_belongs_to_scope\(/);
  assert.match(sql, /alter table public\.accreditation_categories enable row level security;/);
  assert.match(sql, /alter table public\.accreditation_enrollments enable row level security;/);
  assert.match(sql, /create policy "Tenant-scoped accreditation enrollment insert"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation enrollment update"/);
  assert.match(sql, /active/);
  assert.match(sql, /cancelled/);
  assert.doesNotMatch(sql, /pending|inactive|checked_in|invited/i);
  assert.doesNotMatch(sql, /public\.reservations/);
  assert.doesNotMatch(sql, /public\.guests/);
  assert.doesNotMatch(sql, /public\.checkins/);
});
