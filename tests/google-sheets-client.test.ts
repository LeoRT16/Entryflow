import assert from "node:assert/strict";
import test from "node:test";

import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildGoogleSheetsProjection, buildWorkbookDatasetHashInput, hashWorkbookDataset } from "../features/reporting/google-sheets/workbook-projection";
import { ensureWorkbookSchema, GoogleSheetsClientError, readServiceAccountConfig, sanitizeTextCell, serializeSheet, writeWorkbookProjection, type GoogleSheetsTransport } from "../features/reporting/google-sheets/client";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

function fakeTransport(overrides: Partial<GoogleSheetsTransport> = {}): GoogleSheetsTransport {
  return { getSpreadsheetMetadata: async () => ({ spreadsheetId: "sheet-1", title: "Test", sheetTitles: ["Resumen"] }), batchUpdate: async () => undefined, clear: async () => undefined, updateValues: async () => undefined, ...overrides };
}

test("service account config normalizes escaped newlines and never uses NEXT_PUBLIC names", () => {
  assert.deepEqual(readServiceAccountConfig({ GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@test", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "line1\\nline2" } as unknown as NodeJS.ProcessEnv), { clientEmail: "sa@test", privateKey: "line1\nline2" });
  assert.throws(() => readServiceAccountConfig({ GOOGLE_SERVICE_ACCOUNT_EMAIL: "", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key" } as unknown as NodeJS.ProcessEnv), (error) => error instanceof GoogleSheetsClientError && error.code === "google_auth_failed");
});

test("schema creates only missing canonical tabs and preserves extras", async () => {
  const calls: unknown[] = [];
  const metadata = await ensureWorkbookSchema(fakeTransport({ getSpreadsheetMetadata: async () => ({ spreadsheetId: "s", title: "t", sheetTitles: ["Resumen", "Extra"] }), batchUpdate: async (request) => { calls.push(request); } }), "s");
  assert.deepEqual(metadata.sheetTitles, ["Resumen", "Extra", "Reservas", "Invitados"]);
  assert.equal(calls.length, 1);
});

test("serialization preserves text, numeric values and formula safety", () => {
  assert.equal(sanitizeTextCell("=1+1"), "'=1+1");
  assert.equal(sanitizeTextCell("+59170000000"), "'+59170000000");
  const sheet = buildGoogleSheetsProjection(buildEventReport(buildEventReportFixtureInput())).sheets.attendees;
  const serialized = serializeSheet(sheet);
  assert.equal(typeof serialized.values?.[1]?.[4], "string");
  assert.equal(typeof serialized.values?.[1]?.[12], "string");
  assert.equal(serialized.values?.[1]?.[12], "No");
  const summaryValues = serializeSheet(buildGoogleSheetsProjection(buildEventReport(buildEventReportFixtureInput())).sheets.summary).values ?? [];
  const summaryRows = new Map(summaryValues.slice(1).map((row) => [row?.[1], row?.[2]]));
  assert.equal(summaryRows.get("Mesas"), 800);
  assert.equal(summaryRows.get("Preventa"), 200);
  assert.equal(summaryRows.get("Manillas extra"), 120);
  assert.equal(summaryRows.get("Total"), 1120);
});

test("first write clears and batches exactly three live sheets", async () => {
  const projection = buildGoogleSheetsProjection(buildEventReport(buildEventReportFixtureInput()));
  const calls = { clear: 0, update: 0 };
  const result = await writeWorkbookProjection(fakeTransport({ clear: async (_id, ranges) => { calls.clear += ranges.length; }, updateValues: async (_id, data) => { calls.update = data.length; } }), "sheet-1", projection, hashWorkbookDataset(buildWorkbookDatasetHashInput(projection)));
  assert.deepEqual(result.sheetsUpdated, ["Resumen", "Reservas", "Invitados"]);
  assert.equal(calls.clear, 3);
  assert.equal(calls.update, 3);
});

test("projection data is never included in client error text", async () => {
  await assert.rejects(() => writeWorkbookProjection(fakeTransport({ clear: async () => { throw new GoogleSheetsClientError("google_write_failed", "safe"); } }), "sheet-1", buildGoogleSheetsProjection(buildEventReport(buildEventReportFixtureInput())), "hash"), (error) => error instanceof GoogleSheetsClientError && !error.message.includes("guest") && !error.message.includes("carnet"));
});
