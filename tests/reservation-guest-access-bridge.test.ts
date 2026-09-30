import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261001000000_reservation_guest_access_bridge.sql", "utf8");

test("reservation guest access bridge is scoped, idempotent, and authoritative", () => {
  assert.match(sql, /reservation_guest_id uuid references public\.guests\(id\)/);
  assert.match(sql, /accreditation_enrollments_reservation_guest_unique/);
  assert.match(sql, /create or replace function public\.prepare_guest_access_atomic/);
  assert.match(sql, /auth\.uid\(\) is null/);
  assert.match(sql, /current_organization_ids\(\)/);
  assert.match(sql, /current_event_ids\(\)/);
  assert.match(sql, /access_enrollment_not_active/);
  assert.match(sql, /access_grant_revoked/);
  assert.match(sql, /access_credential_identity_conflict/);
  assert.match(sql, /grant execute on function public\.prepare_guest_access_atomic\(uuid,text,text\) to authenticated,service_role/);
});
