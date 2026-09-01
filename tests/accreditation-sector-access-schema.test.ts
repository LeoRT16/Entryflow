import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("accreditation access migration adds standalone sectors and entitlements without mutating grants", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260827000001_accreditation_phase_3a.sql", import.meta.url), "utf8");

  assert.match(sql, /create table if not exists public\.accreditation_access_sectors/);
  assert.match(sql, /create table if not exists public\.accreditation_access_entitlements/);
  assert.match(sql, /constraint accreditation_access_sectors_status_check check \(status in \('active', 'inactive'\)\)/i);
  assert.match(sql, /constraint accreditation_access_entitlements_status_check check \(status in \('active', 'revoked'\)\)/i);
  assert.match(sql, /constraint accreditation_access_entitlements_revoked_at_check check \(/i);
  assert.match(sql, /create unique index if not exists accreditation_access_sectors_event_code_unique/);
  assert.match(sql, /create unique index if not exists accreditation_access_entitlements_grant_sector_active_unique/);
  assert.match(sql, /alter table public\.accreditation_access_sectors enable row level security;/);
  assert.match(sql, /alter table public\.accreditation_access_entitlements enable row level security;/);
  assert.match(sql, /create policy "Tenant-scoped accreditation access sector insert"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation access entitlement insert"/);
  assert.match(sql, /create trigger enforce_accreditation_access_sector_identity_immutable/);
  assert.match(sql, /create trigger enforce_accreditation_access_entitlement_identity_immutable/);
  assert.match(sql, /public\.accreditation_access_sector_operator_is_authorized\(/);
  assert.match(sql, /public\.accreditation_access_entitlement_can_be_assigned\(/);
  assert.doesNotMatch(sql, /alter table public\.accreditation_access_grants/i);
  assert.doesNotMatch(sql, /update public\.accreditation_access_grants/i);
});
