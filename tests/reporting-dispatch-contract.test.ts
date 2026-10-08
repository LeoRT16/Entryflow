import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/reporting/worker/route.ts", import.meta.url), "utf8");

test("unified reporting route authenticates before running bounded stages", () => {
  assert.ok(route.includes("authorizeReportingCronRequest(request)"));
  assert.ok(route.includes("processDriveProvisioningBatch(client as never, workerId, 1)"));
  assert.ok(route.includes("processReportingSpreadsheetProvisioningBatch"));
  assert.ok(route.includes("processOAuthReportingSyncBatch"));
  assert.ok(route.includes("processReportingSyncBatch"));
  assert.ok(route.indexOf("stages.drive") < route.indexOf("stages.spreadsheet"));
  assert.ok(route.indexOf("stages.spreadsheet") < route.indexOf("stages.sync"));
});

test("unified reporting route isolates stage failures", () => {
  assert.ok(route.includes('stages.drive = { error: "drive_worker_failed" }'));
  assert.ok(route.includes('stages.spreadsheet = { error: "spreadsheet_worker_failed" }'));
  assert.ok(route.includes('stages.sync = { error: "sync_worker_failed" }'));
});
