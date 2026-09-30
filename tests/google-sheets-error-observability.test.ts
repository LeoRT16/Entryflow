import assert from "node:assert/strict";
import test from "node:test";
import { classifyAtomicGoogleSheetsError, safeGoogleSheetsDiagnostic } from "../features/reporting/google-sheets/atomic-writer";

test("Google writer diagnostics retain safe status and reason without credentials", () => {
  const diagnostic = safeGoogleSheetsDiagnostic({ response: { status: 403, data: { error: { message: "permission denied" }, errors: [{ reason: "forbidden" }] } }, config: { headers: { Authorization: "Bearer secret" } } }, "sheets.batchUpdate");
  assert.deepEqual(diagnostic, { operation: "sheets.batchUpdate", status: 403, reason: "forbidden", message: "permission denied" });
  assert.equal("Authorization" in diagnostic, false);
});

test("Google writer classification keeps the concrete safe diagnostic", () => {
  const error = classifyAtomicGoogleSheetsError({ response: { status: 404, data: { error: { message: "not found" } } } });
  assert.equal(error.code, "spreadsheet_not_found");
  assert.equal(error.diagnostic?.status, 404);
  assert.equal(error.diagnostic?.operation, "google_sheets");
});
