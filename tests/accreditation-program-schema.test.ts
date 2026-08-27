import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("accreditation program migration adds an additive sessions table with strict program-only constraints", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260827000000_accreditation_phase_2c.sql", import.meta.url), "utf8");

  assert.match(sql, /create table if not exists public\.accreditation_program_sessions/);
  assert.match(sql, /organization_id uuid not null references public\.organizations\(id\) on delete cascade/);
  assert.match(sql, /event_id uuid not null references public\.events\(id\) on delete cascade/);
  assert.match(sql, /title text not null/);
  assert.match(sql, /session_type text not null default 'other'/);
  assert.match(sql, /starts_at timestamptz not null/);
  assert.match(sql, /ends_at timestamptz not null/);
  assert.match(sql, /status text not null default 'active'/);
  assert.match(sql, /constraint accreditation_program_sessions_title_check check \(btrim\(title\) <> ''\)/i);
  assert.match(sql, /constraint accreditation_program_sessions_session_type_check check \(session_type in \('keynote', 'talk', 'panel', 'workshop', 'break', 'networking', 'other'\)\)/i);
  assert.match(sql, /constraint accreditation_program_sessions_status_check check \(status in \('active', 'cancelled'\)\)/i);
  assert.match(sql, /constraint accreditation_program_sessions_capacity_check check \(capacity is null or capacity >= 0\)/i);
  assert.match(sql, /constraint accreditation_program_sessions_scope_check check \(public\.accreditation_program_session_belongs_to_scope\(organization_id, event_id\)\)/i);
  assert.match(sql, /constraint accreditation_program_sessions_time_window_check check \(public\.accreditation_program_session_has_valid_time_window\(starts_at, ends_at\)\)/i);
  assert.match(sql, /alter table public\.accreditation_program_sessions enable row level security;/);
  assert.match(sql, /create policy "Tenant-scoped accreditation program session select"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation program session insert"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation program session update"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation program session delete"/);
  assert.match(sql, /create index if not exists accreditation_program_sessions_organization_event_idx/);
  assert.match(sql, /create index if not exists accreditation_program_sessions_event_starts_idx/);
  assert.match(sql, /comment on function public\.accreditation_program_session_belongs_to_scope\(uuid, uuid\)/);
  assert.match(sql, /comment on function public\.accreditation_program_session_has_valid_time_window\(timestamptz, timestamptz\)/);
  assert.match(sql, /active/);
  assert.match(sql, /cancelled/);
  assert.doesNotMatch(sql, /sector access|gate|vip|backstage|access entitlement|session checkin|concert|wristband/i);
  assert.doesNotMatch(sql, /public\.reservations/);
  assert.doesNotMatch(sql, /public\.guests/);
  assert.doesNotMatch(sql, /public\.checkins/);
});
