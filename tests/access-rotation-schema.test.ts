import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("atomic access rotation preserves entitlement identity and blocks consumed or cancelled access", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261008000000_phase5d_atomic_access_rotation.sql", import.meta.url), "utf8");
  assert.match(sql, /rotate_guest_access_credential_atomic/);
  assert.match(sql, /for update/);
  assert.match(sql, /g\.admission_status = 'Ingresó'/);
  assert.match(sql, /g\.reservation_status = 'Cancelled'/);
  assert.match(sql, /g\.admission_status = 'Anulada'/);
  assert.match(sql, /accreditation_checkins where access_grant_id=a\.id/);
  assert.match(sql, /set access_code=v_code, qr_token=v_token/);
  assert.match(sql, /a\.id,v_code,v_token/);
  assert.match(sql, /accessGrantId',a\.id/);
  assert.doesNotMatch(sql, /old.*qr_token|previous.*qr_token/i);
});

test("rotation rejects valid legacy check-in consumption", () => {
  const sql = readFileSync("supabase/migrations/20261008000000_phase5d_atomic_access_rotation.sql", "utf8");
  assert.match(sql, /from public\.checkins as ci/);
  assert.match(sql, /ci\.guest_id = g\.id/);
  assert.match(sql, /ci\.access_grant_id = a\.id/);
  assert.match(sql, /ci\.deleted_at is null/);
  assert.match(sql, /ci\.status in \('Checked In', 'Checked Out', 'Completed'\)/);
});

test("Supabase legacy register cannot create an independent successful admission", () => {
  const source = readFileSync("repositories/supabase-workspace-repositories.ts", "utf8");
  assert.match(source, /Direct legacy admission is disabled; use the authoritative atomic check-in flow/);
  assert.match(source, /persistCompletedAtomic/);
});

test("credential rotation is wired through the repository, service permission, and Guest UI", () => {
  const repository = readFileSync("repositories/supabase-workspace-repositories.ts", "utf8");
  const service = readFileSync("services/workspace-service.tsx", "utf8");
  const ui = readFileSync("features/customers/components/guest-directory.tsx", "utf8");
  const modal = readFileSync("features/customers/components/guest-edit-modal.tsx", "utf8");
  const reservations = readFileSync("features/reservations/components/reservation-flow.tsx", "utf8");
  assert.match(repository, /rotate_guest_access_credential_atomic/);
  assert.match(service, /requirePermission\("access\.regenerate"\)/);
  assert.match(ui, /Regenerar QR/);
  assert.match(ui, /El QR actual dejará de funcionar/);
  assert.match(ui, /admissionStatus !== "Ingresó"/);
  assert.match(ui, /reservationStatus !== "Cancelled"/);
  assert.doesNotMatch(ui, /rotate_guest_access_credential_atomic/);
  assert.match(modal, /onRegenerate/);
  assert.match(modal, /Regenerar QR/);
  assert.match(reservations, /rotateGuestAccessCredential/);
  assert.match(reservations, /access\.regenerate/);
  assert.doesNotMatch(modal, /getSupabaseBrowserClient|\.rpc\(/);
});
