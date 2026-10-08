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

test("recovery clears only stale authorization errors after connected recovery", () => {
  const fix = readFileSync("supabase/migrations/20261031000000_reporting_oauth_recovery_error_cleanup.sql", "utf8");
  assert.match(fix, /status='connected'/);
  assert.match(fix, /last_error_code in \('google_invalid_grant','google_auth_failed'\)/);
  assert.match(fix, /set last_error_code=null/);
  assert.doesNotMatch(fix, /02cf45fb-25fe-4287-be1f-71154bb102b3/);
});

test("terminal retry migration preserves work identity and rejects broad retry", () => {
  const fix = readFileSync("supabase/migrations/20261101000000_reporting_terminal_retry_policy.sql", "utf8");
  assert.match(fix, /retry_reporting_terminal_work/);
  assert.match(fix, /status='dead'/);
  assert.match(fix, /requested_sequence/);
  assert.match(fix, /reporting_retry_audit/);
  assert.match(fix, /reporting_retry_not_allowed/);
  assert.doesNotMatch(fix, /insert into public\.reporting_outbox/);
});
