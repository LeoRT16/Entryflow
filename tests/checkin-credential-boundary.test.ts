import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20261007000001_checkin_credential_boundary.sql", "utf8");
const service = readFileSync("services/workspace-service.tsx", "utf8");

test("atomic check-in validates credential after locking the grant", () => {
  assert.match(sql, /for update/);
  assert.match(sql, /p_credential_kind not in \('qr_token','access_code','manual'\)/);
  assert.match(sql, /p_credential_kind = 'qr_token' and p_presented_credential <> a\.qr_token/);
  assert.match(sql, /p_credential_kind = 'access_code' and p_presented_credential <> a\.access_code/);
  assert.match(sql, /checkin_credential_invalid/);
});

test("non-credential lookup cannot silently become QR or code admission", () => {
  assert.match(service, /credentialKind/);
  assert.match(service, /: "invalid"/);
});

test("credential modes reject null or empty presented values", () => {
  assert.match(sql, /p_credential_kind in \('qr_token','access_code'\).*nullif\(trim\(coalesce\(p_presented_credential,''\)\)/);
});
