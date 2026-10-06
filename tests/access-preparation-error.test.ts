import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AccessPreparationError,
  toAccessPreparationError,
} from "../features/check-in/domain/access-preparation-error";

test("structured access preparation RPC errors retain safe database diagnostics", () => {
  const error = toAccessPreparationError({
    code: "42501",
    message: "access_guest_out_of_scope",
    details: "diagnostic detail",
    hint: "diagnostic hint",
  });

  assert.equal(error instanceof AccessPreparationError, true);
  assert.equal(error.operation, "prepare_guest_access_atomic");
  assert.equal(error.code, "42501");
  assert.equal(error.message, "access_guest_out_of_scope");
  assert.equal(error.details, "diagnostic detail");
  assert.equal(error.hint, "diagnostic hint");
});

test("successful authoritative access response remains mapped to the grant id", () => {
  const source = readFileSync("repositories/supabase-workspace-repositories.ts", "utf8");
  assert.match(source, /prepare_guest_access_atomic/);
  assert.match(source, /accessGrantId: row\.access_grant_id/);
  assert.match(source, /accreditation_access_grants\(id, access_code, qr_token, status, organization_id, event_id\)/);
  assert.match(source, /accessCode = canonicalGrant\.access_code/);
  assert.match(source, /qrToken = canonicalGrant\.qr_token/);
});
