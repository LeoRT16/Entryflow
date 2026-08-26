import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getRolePresetBySlug } from "../features/accounts/domain/accounts-domain";

test("accreditation check-in migration adds an append-only table with operator identity and db duplicate protection", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826000002_accreditation_phase_1c.sql", import.meta.url), "utf8");

  assert.match(sql, /create or replace function public\.current_profile_ids\(\)/);
  assert.match(sql, /create or replace function public\.accreditation_checkin_operator_is_authorized\(/);
  assert.match(sql, /create table if not exists public\.accreditation_checkins/);
  assert.match(sql, /organization_id uuid not null references public\.organizations\(id\) on delete cascade/);
  assert.match(sql, /event_id uuid not null references public\.events\(id\) on delete cascade/);
  assert.match(sql, /enrollment_id uuid not null references public\.accreditation_enrollments\(id\) on delete cascade/);
  assert.match(sql, /access_grant_id uuid not null references public\.accreditation_access_grants\(id\) on delete cascade/);
  assert.match(sql, /operator_profile_id uuid not null references public\.profiles\(id\)/);
  assert.match(sql, /source text not null/);
  assert.match(sql, /checked_in_at timestamptz not null default now\(\)/);
  assert.match(sql, /constraint accreditation_checkins_source_check check \(source in \('qr', 'manual_code'\)\)/i);
  assert.match(sql, /constraint accreditation_checkins_access_grant_unique unique \(access_grant_id\)/i);
  assert.match(sql, /create index if not exists accreditation_checkins_organization_event_idx/);
  assert.match(sql, /create index if not exists accreditation_checkins_event_checked_in_at_idx/);
  assert.match(sql, /create index if not exists accreditation_checkins_enrollment_idx/);
  assert.match(sql, /create index if not exists accreditation_checkins_operator_profile_idx/);
  assert.match(sql, /create or replace function public\.accreditation_checkin_belongs_to_scope\(/);
  assert.match(sql, /create or replace function public\.accreditation_checkin_can_be_recorded\(/);
  assert.match(sql, /and public\.accreditation_checkin_operator_is_authorized\(/);
  assert.match(sql, /'checkin\.perform' = any\(r\.permissions\)/);
  assert.match(sql, /create or replace function public\.accreditation_checkin_is_immutable\(\)/);
  assert.match(sql, /alter table public\.accreditation_checkins enable row level security;/);
  assert.match(sql, /create trigger enforce_accreditation_checkins_immutable/);
  assert.match(sql, /create policy "Tenant-scoped accreditation checkin select"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation checkin insert"/);
  assert.doesNotMatch(sql, /create policy "Tenant-scoped accreditation checkin update"/);
  assert.doesNotMatch(sql, /create policy "Tenant-scoped accreditation checkin delete"/);
  assert.doesNotMatch(sql, /public\.checkins/);
  assert.doesNotMatch(sql, /reservation_id|guest_id|resource_id|voided_at|reentry_count/i);
  assert.doesNotMatch(sql, /whatsapp|invitation|manual override/i);
});

test("canonical EntryFlow check-in permission remains wired into the operational role presets", () => {
  const owner = new Set(getRolePresetBySlug("owner").permissions);
  const administrator = new Set(getRolePresetBySlug("administrator").permissions);
  const reception = new Set(getRolePresetBySlug("reception").permissions);
  const door = new Set(getRolePresetBySlug("door").permissions);

  assert.equal(owner.has("checkin.perform"), true);
  assert.equal(administrator.has("checkin.perform"), true);
  assert.equal(reception.has("checkin.perform"), true);
  assert.equal(door.has("checkin.perform"), true);
});
