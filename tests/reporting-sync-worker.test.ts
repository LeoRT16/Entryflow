import assert from "node:assert/strict";
import test from "node:test";
import { computeReportingRetryAt, processReportingSyncBatch, type ClaimedReportingWork } from "../features/reporting/sync/worker";
import type { GoogleSheetsTransport } from "../features/reporting/google-sheets/client";
import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildGoogleSheetsProjection, buildWorkbookDatasetHashInput, hashWorkbookDataset } from "../features/reporting/google-sheets/workbook-projection";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

const work: ClaimedReportingWork = { outboxId: "o1", syncRunId: "r1", destinationId: "d1", eventId: "e1", requestedSequence: 2, attempts: 1, provider: "google_sheets", spreadsheetId: "s1", sheetSchemaVersion: 1 };
const transport: GoogleSheetsTransport = { getSpreadsheetMetadata: async () => ({ spreadsheetId: "s1", title: "test", sheetTitles: ["Resumen", "Reservas", "Preventa", "Invitados", "Cortesías", "Reportes finales"] }), batchUpdate: async () => undefined, clear: async () => undefined, updateValues: async () => undefined };
const report = buildEventReport(buildEventReportFixtureInput());

function makeDeps(overrides: Partial<Parameters<typeof processReportingSyncBatch>[0]> = {}) {
  const calls: string[] = [];
  return { calls, deps: { transport, loadReport: async () => report, repository: { claim: async () => [work], completeSuccess: async () => { calls.push("success"); }, completeFailure: async () => { calls.push("failure"); }, lastSuccessfulHash: async () => null }, now: () => new Date("2026-01-01T00:00:00.000Z"), ...overrides } as Parameters<typeof processReportingSyncBatch>[0] };
}

test("retry schedule is deterministic and has no sleep", () => { assert.equal(computeReportingRetryAt(1, new Date("2026-01-01T00:00:00Z")), "2026-01-01T00:00:05.000Z"); assert.equal(computeReportingRetryAt(4, new Date("2026-01-01T00:00:00Z")), "2026-01-01T00:10:00.000Z"); });
test("worker processes a successful claim", async () => { const { calls, deps } = makeDeps(); assert.deepEqual(await processReportingSyncBatch(deps, "worker-1"), { claimed: 1, synced: 1, skipped: 0, failed: 0 }); assert.deepEqual(calls, ["success"]); });
test("same hash skips write only for same destination identity", async () => { let wrote = false; const expectedHash = hashWorkbookDataset(buildWorkbookDatasetHashInput(buildGoogleSheetsProjection(report))); const { calls, deps } = makeDeps({ transport: { ...transport, clear: async () => { wrote = true; } }, repository: { claim: async () => [work], completeSuccess: async () => { calls.push("success"); }, completeFailure: async () => { calls.push("failure"); }, lastSuccessfulHash: async () => ({ datasetHash: expectedHash, spreadsheetId: "s1", sheetSchemaVersion: 1 }) } }); const result = await processReportingSyncBatch(deps, "worker-1"); assert.equal(result.skipped, 1); assert.equal(wrote, false); assert.deepEqual(calls, ["success"]); });
test("one failure does not prevent later jobs", async () => { const second = { ...work, outboxId: "o2", syncRunId: "r2" }; let count = 0; const { calls, deps } = makeDeps({ repository: { claim: async () => [work, second], completeSuccess: async () => { calls.push("success"); }, completeFailure: async () => { calls.push("failure"); }, lastSuccessfulHash: async () => null }, loadReport: async () => { count += 1; if (count === 1) throw new Error("internal detail"); return report; } }); const result = await processReportingSyncBatch(deps, "worker-1", 2); assert.equal(result.failed, 1); assert.equal(result.synced, 1); assert.deepEqual(calls, ["failure", "success"]); });
test("missing spreadsheet is a permanent sanitized failure", async () => { const { calls, deps } = makeDeps({ repository: { claim: async () => [{ ...work, spreadsheetId: null }], completeSuccess: async () => { calls.push("success"); }, completeFailure: async (_work, code, message, recoverable) => { calls.push(`${code}:${message}:${recoverable}`); }, lastSuccessfulHash: async () => null } }); await processReportingSyncBatch(deps, "worker-1"); assert.deepEqual(calls, ["google_schema_mismatch:Reporting destination has no spreadsheet configured.:false"]); });
