import test from "node:test";
import assert from "node:assert/strict";
import { classifyReportingFailure, isOperatorRetryEligible } from "../features/reporting/recovery";

test("canonical reporting policy keeps transient failures retryable", () => {
  assert.equal(classifyReportingFailure("google_rate_limited"), "AUTO_RETRY");
  assert.equal(classifyReportingFailure("google_temporarily_unavailable"), "AUTO_RETRY");
  assert.equal(classifyReportingFailure("google_network_unavailable"), "AUTO_RETRY");
  assert.equal(classifyReportingFailure("google_rate_limited", true), "OPERATOR_RETRY");
  assert.equal(isOperatorRetryEligible("google_rate_limited"), true);
});

test("canonical policy fails closed for auth, drift, invariants and unknowns", () => {
  assert.equal(classifyReportingFailure("google_invalid_grant"), "REAUTH_REQUIRED");
  assert.equal(classifyReportingFailure("google_permission_denied"), "NEEDS_ACTION");
  assert.equal(classifyReportingFailure("spreadsheet_not_found"), "NEEDS_ACTION");
  assert.equal(classifyReportingFailure("drive_folder_drift"), "NEEDS_ACTION");
  assert.equal(classifyReportingFailure("reporting_spreadsheet_identity_conflict"), "NON_RETRYABLE");
  assert.equal(classifyReportingFailure("never_seen_before"), "NON_RETRYABLE");
  assert.equal(isOperatorRetryEligible("google_invalid_grant"), false);
});
