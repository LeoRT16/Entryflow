import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("accreditation access migration adds a standalone QR and code grant table", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826000001_accreditation_phase_1b.sql", import.meta.url), "utf8");

  assert.match(sql, /create table if not exists public\.accreditation_access_grants/);
  assert.match(sql, /organization_id uuid not null references public\.organizations\(id\) on delete cascade/);
  assert.match(sql, /event_id uuid not null references public\.events\(id\) on delete cascade/);
  assert.match(sql, /enrollment_id uuid not null references public\.accreditation_enrollments\(id\) on delete cascade/);
  assert.match(sql, /access_code text not null/);
  assert.match(sql, /qr_token text not null/);
  assert.match(sql, /status text not null default 'active'/);
  assert.match(sql, /constraint accreditation_access_grants_status_check check \(status in \('active', 'revoked'\)\)/i);
  assert.match(sql, /constraint accreditation_access_grants_organization_event_enrollment_unique unique \(organization_id, event_id, enrollment_id\)/i);
  assert.match(sql, /constraint accreditation_access_grants_organization_event_access_code_unique unique \(organization_id, event_id, access_code\)/i);
  assert.match(sql, /constraint accreditation_access_grants_qr_token_unique unique \(qr_token\)/i);
  assert.match(sql, /create index if not exists accreditation_access_grants_organization_event_idx/);
  assert.match(sql, /create index if not exists accreditation_access_grants_organization_event_status_idx/);
  assert.match(sql, /create or replace function public\.accreditation_access_grant_identity_immutable\(\)/);
  assert.match(sql, /old\.organization_id is distinct from new\.organization_id/);
  assert.match(sql, /old\.event_id is distinct from new\.event_id/);
  assert.match(sql, /old\.enrollment_id is distinct from new\.enrollment_id/);
  assert.match(sql, /raise exception 'accreditation_access_grants identity columns are immutable'/);
  assert.match(sql, /create or replace function public\.accreditation_access_grant_belongs_to_scope\(/);
  assert.match(sql, /create or replace function public\.accreditation_access_grant_can_be_issued\(/);
  assert.match(sql, /alter table public\.accreditation_access_grants enable row level security;/);
  assert.match(sql, /create trigger enforce_accreditation_access_grant_identity_immutable before update on public\.accreditation_access_grants/);
  assert.match(sql, /create trigger set_updated_at_accreditation_access_grants before update on public\.accreditation_access_grants/);
  assert.match(sql, /create policy "Tenant-scoped accreditation access grant insert"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation access grant update"/);
  assert.match(sql, /status in \('active', 'revoked'\)/i);
  assert.doesNotMatch(sql, /public\.reservations/);
  assert.doesNotMatch(sql, /public\.guests/);
  assert.doesNotMatch(sql, /public\.checkins/);
  assert.doesNotMatch(sql, /pending|inactive|checked_in|invited/i);
});
