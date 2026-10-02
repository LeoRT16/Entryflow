import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Phase 5D revokes a cancelled non-admitted Guest access grant server-side", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261007000000_phase5d_guest_access_revocation.sql", import.meta.url), "utf8");
  assert.match(sql, /new\.admission_status = 'Anulada'/);
  assert.match(sql, /new\.reservation_status = 'Cancelled'/);
  assert.match(sql, /new\.admission_status <> 'Ingresó'/);
  assert.match(sql, /set status = 'revoked'/);
  assert.match(sql, /e\.reservation_guest_id = new\.id/);
  assert.match(sql, /ag\.status = 'active'/);
});


test("consumed authoritative and legacy check-ins prevent cancellation revocation", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261007000000_phase5d_guest_access_revocation.sql", import.meta.url), "utf8");
  assert.match(sql, /not exists \(\s*select 1\s*from public\.accreditation_checkins/);
  assert.match(sql, /ac\.access_grant_id = ag\.id/);
  assert.match(sql, /not exists \(\s*select 1\s*from public\.checkins/);
  assert.match(sql, /ci\.access_grant_id = ag\.id/);
  assert.match(sql, /ci\.status in \('Checked In', 'Checked Out', 'Completed'\)/);
  assert.match(sql, /ci\.deleted_at is null/);
});
