import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const callback = readFileSync("app/api/integrations/google-drive/callback/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261028000000_reporting_oauth_reauthorization_recovery.sql", "utf8");

test("reauthorization guards an existing provider account before token persistence", () => {
  assert.match(callback, /provider_account_id/);
  assert.match(callback, /google_oauth_account_mismatch/);
  assert.match(callback, /replaceDriveRefreshTokenSecret/);
});

test("recovery is invoked only after integration persistence", () => {
  assert.ok(callback.indexOf("update(payload)") < callback.indexOf("recover_reporting_google_authorization"));
  assert.ok(callback.indexOf("createDriveRefreshTokenSecret") < callback.indexOf("recover_reporting_google_authorization"));
});

test("recovery requeues only authorization-blocked durable work", () => {
  assert.match(migration, /status='needs_action'/);
  assert.match(migration, /google_invalid_grant/);
  assert.match(migration, /status in \('needs_action','needs_reauth'\)/);
  assert.match(migration, /status in \('failed','dead'\)/);
});

test("recovery preserves attempts and sequences and clears leases", () => {
  assert.doesNotMatch(migration, /attempts\s*=/);
  assert.doesNotMatch(migration, /requested_sequence\s*=/);
  assert.match(migration, /claim_token=null/);
  assert.match(migration, /locked_at=null/);
});

test("recovery is organization scoped and idempotent by status transition", () => {
  assert.match(migration, /organization_id=p_organization_id/);
  assert.match(migration, /status='pending'/);
  assert.match(migration, /grant execute on function public\.recover_reporting_google_authorization\(uuid\) to service_role/);
});
