import test from "node:test";
import assert from "node:assert/strict";
import { buildReportingRecoveryStatus } from "../features/reporting/sync/recovery-status";

test("healthy connected reporting is healthy", () => assert.equal(buildReportingRecoveryStatus({ integrationStatus: "connected", enabled: true, lastRequestedSequence: 1, lastProcessedSequence: 1 }).state, "HEALTHY"));
test("authorization failures require reconnection", () => {
  const status = buildReportingRecoveryStatus({ integrationStatus: "needs_reauth", integrationErrorCode: "google_invalid_grant" });
  assert.equal(status.state, "NEEDS_REAUTH"); assert.equal(status.canReconnect, true); assert.match(status.label, /reconexión/);
});
test("pending durable work is recovering without a manual sync action", () => assert.equal(buildReportingRecoveryStatus({ integrationStatus: "connected", enabled: true, lastRequestedSequence: 2, lastProcessedSequence: 1 }).state, "RECOVERING"));
test("persistent drift is needs action without reconnect or retry", () => {
  const status = buildReportingRecoveryStatus({ integrationStatus: "connected", enabled: true, lastError: "spreadsheet_moved" });
  assert.equal(status.state, "NEEDS_ACTION"); assert.equal(status.canReconnect, false); assert.match(status.reason ?? "", /recurso de Google/);
});
test("manual disabled remains healthy presentation rather than an error", () => assert.equal(buildReportingRecoveryStatus({ integrationStatus: "connected", enabled: false }).state, "HEALTHY"));
test("transient retry conditions do not become needs action", () => assert.equal(buildReportingRecoveryStatus({ integrationStatus: "connected", enabled: true, lastError: "google_rate_limited" }).state, "HEALTHY"));
