import assert from "node:assert/strict";
import test from "node:test";
import type { sheets_v4 } from "googleapis";
import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildGoogleSheetsProjection, buildWorkbookDatasetHashInput, hashWorkbookDataset, GOOGLE_SHEETS_TAB_NAMES } from "../features/reporting/google-sheets/workbook-projection";
import { AtomicWorkbookWriterError, classifyAtomicGoogleSheetsError, type AtomicGoogleSheetsTransport, type AtomicWorkbookMetadata } from "../features/reporting/google-sheets/atomic-writer";
import { processOAuthReportingSyncBatch, type ClaimedOAuthReportingWork, type OAuthReportingWorkerDependencies } from "../features/reporting/google-sheets/oauth-worker";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

const work: ClaimedOAuthReportingWork = { outboxId: "o", syncRunId: "r", destinationId: "d", organizationId: "org", eventId: "event", requestedSequence: 4, attempts: 1, provider: "google_sheets", spreadsheetId: "sheet", sheetSchemaVersion: 2, writerMode: "oauth_user" };
const metadata: AtomicWorkbookMetadata = { spreadsheetId: "sheet", title: "EntryFlow test", sheets: GOOGLE_SHEETS_TAB_NAMES.map((title, index) => ({ title, sheetId: index + 1, rowCount: 1000, columnCount: 26, ownershipMarker: title })) };
const report = buildEventReport(buildEventReportFixtureInput());
function make(overrides: Partial<OAuthReportingWorkerDependencies> = {}) {
  const completions: unknown[][] = []; const calls: sheets_v4.Schema$BatchUpdateSpreadsheetRequest[] = [];
  const transport: AtomicGoogleSheetsTransport = { getWorkbookMetadata: async () => metadata, batchUpdate: async (_id, body) => { calls.push(structuredClone(body)); } };
  const deps: OAuthReportingWorkerDependencies = { repository: { claim: async () => [work], lastSuccessfulHash: async () => null, completeSuccess: async (...args) => { completions.push(["success", ...args]); }, completeFailure: async (...args) => { completions.push(["failure", ...args]); } }, loadReport: async () => report, readRefreshToken: async () => "synthetic-refresh-token", createTransport: () => transport, now: () => new Date("2026-09-18T17:45:00.000Z"), ...overrides };
  return { deps, completions, calls, transport };
}

test("OAuth V2 worker writes one snapshot and persists the identical logical success timestamp", async () => {
  const { deps, completions, calls } = make();
  const result = await processOAuthReportingSyncBatch(deps, "oauth-worker");
  assert.deepEqual(result, { claimed: 1, synced: 1, skipped: 0, failed: 0 }); assert.equal(calls.length, 1);
  const success = completions[0]!; assert.equal(success[0], "success"); assert.equal(success[3], "2026-09-18T17:45:00.000Z");
  assert.equal(calls[0]?.requests?.some((request) => "updateCells" in request), true);
});

test("unchanged business hash updates only the timestamp cell and still records success", async () => {
  const projection = buildGoogleSheetsProjection(report, { snapshotTimestamp: "2026-09-18T17:45:00.000Z" });
  const hash = hashWorkbookDataset(buildWorkbookDatasetHashInput(projection));
  const { deps, calls, completions } = make({ repository: { claim: async () => [work], lastSuccessfulHash: async () => ({ datasetHash: hash, spreadsheetId: "sheet", sheetSchemaVersion: 2 }), completeSuccess: async (...args) => { completions.push(["success", ...args]); }, completeFailure: async (...args) => { completions.push(["failure", ...args]); } } });
  const result = await processOAuthReportingSyncBatch(deps, "oauth-worker");
  assert.deepEqual(result, { claimed: 1, synced: 0, skipped: 1, failed: 0 }); assert.deepEqual(calls[0]?.requests?.map((request) => Object.keys(request as object)[0]), ["updateCells"]);
  assert.equal(completions[0]?.[3], "2026-09-18T17:45:00.000Z");
});

test("failed Google write never completes success", async () => {
  const { deps, completions } = make({ createTransport: () => ({ getWorkbookMetadata: async () => metadata, batchUpdate: async () => { throw new AtomicWorkbookWriterError("google_temporarily_unavailable", "safe", true); } }) });
  const result = await processOAuthReportingSyncBatch(deps, "oauth-worker");
  assert.equal(result.failed, 1); assert.equal(completions.filter((item) => item[0] === "success").length, 0); assert.equal(completions[0]?.[3], "retry");
});

test("ambiguous timeout retries the exact same full snapshot without append semantics", async () => {
  const { deps, calls, completions } = make(); let fail = true;
  const transport: AtomicGoogleSheetsTransport = { getWorkbookMetadata: async () => metadata, batchUpdate: async (_id, request) => { calls.push(structuredClone(request)); if (fail) { fail = false; throw new AtomicWorkbookWriterError("google_temporarily_unavailable", "safe", true); } } };
  const retried = { ...deps, createTransport: () => transport };
  const first = await processOAuthReportingSyncBatch(retried, "worker"); const second = await processOAuthReportingSyncBatch(retried, "worker");
  assert.equal(first.failed, 1); assert.equal(second.synced, 1); assert.deepEqual(calls[0], calls[1]);
  const requestKinds = calls[1]?.requests?.map((item) => Object.keys(item as object)[0]);
  assert.equal(requestKinds?.includes("appendCells"), false); assert.equal(requestKinds?.includes("appendDimension"), false);
  assert.equal(completions.filter((entry) => entry[0] === "success").length, 1);
});

test("OAuth status classification covers invalid_grant, permission, scope, 404, 429 and 5xx", async () => {
  const matrix: Array<[AtomicWorkbookWriterError, string]> = [
    [new AtomicWorkbookWriterError("google_invalid_grant", "safe", false), "needs_reauth"],
    [new AtomicWorkbookWriterError("google_permission_denied", "safe", false), "needs_action"],
    [new AtomicWorkbookWriterError("google_scope_insufficient", "safe", false), "needs_scope_upgrade"],
    [new AtomicWorkbookWriterError("spreadsheet_not_found", "safe", false), "needs_action"],
    [new AtomicWorkbookWriterError("google_rate_limited", "safe", true), "retry"],
    [new AtomicWorkbookWriterError("google_temporarily_unavailable", "safe", true), "retry"],
  ];
  for (const [error, expected] of matrix) {
    const { deps, completions } = make({ createTransport: () => ({ getWorkbookMetadata: async () => { throw error; }, batchUpdate: async () => undefined }) });
    const result = await processOAuthReportingSyncBatch(deps, "worker");
    assert.equal(result.failed, 1); assert.equal(completions[0]?.[3], expected);
  }
});

test("Google API and OAuth Gaxios response shapes classify without logging provider payloads", () => {
  const oauthError = classifyAtomicGoogleSheetsError({ response: { status: 400, data: { error: "invalid_grant", error_description: "expired credentials" } } });
  assert.equal(oauthError.code, "google_invalid_grant");
  const scopeError = classifyAtomicGoogleSheetsError({ message: "Forbidden", response: { status: 403, data: { error: { code: 403, message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] } } } });
  assert.equal(scopeError.code, "google_scope_insufficient");
  const permissionError = classifyAtomicGoogleSheetsError({ response: { status: 403, data: { error: { code: 403, message: "Access denied", errors: [{ reason: "forbidden" }] } } } });
  assert.equal(permissionError.code, "google_permission_denied");
});

test("OAuth worker refuses legacy writer and schema versions", async () => {
  for (const invalid of [{ ...work, writerMode: "service_account" }, { ...work, sheetSchemaVersion: 1 }]) {
    const { deps, completions } = make({ repository: { claim: async () => [invalid], lastSuccessfulHash: async () => null, completeSuccess: async (...args) => { completions.push(["success", ...args]); }, completeFailure: async (...args) => { completions.push(["failure", ...args]); } } });
    const result = await processOAuthReportingSyncBatch(deps, "worker"); assert.equal(result.failed, 1); assert.equal(completions[0]?.[0], "failure");
  }
});
