import assert from "node:assert/strict";
import test from "node:test";

import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";
import {
  buildGoogleSheetsProjection,
  buildWorkbookDatasetHashInput,
  GOOGLE_SHEETS_SCHEMA_VERSION,
  GOOGLE_SHEETS_TAB_NAMES,
  hashWorkbookDataset,
} from "../features/reporting/google-sheets/workbook-projection";

function projection() {
  return buildGoogleSheetsProjection(buildEventReport(buildEventReportFixtureInput()));
}

test("projection exposes the six canonical tabs, identities, and Spanish headers", () => {
  const value = projection();
  assert.deepEqual(Object.values(value.sheets).map((sheet) => sheet.title), GOOGLE_SHEETS_TAB_NAMES);
  assert.deepEqual(Object.values(value.sheets).map((sheet) => sheet.rowIdentity), ["key", "reservation_id", "reservation_id", "guest_id", "guest_id", "report_run_id"]);
  assert.equal(value.schemaVersion, GOOGLE_SHEETS_SCHEMA_VERSION);
  assert.equal(value.sheets.reservations.columns[0].header, "ID reserva");
  assert.equal(value.sheets.attendees.columns[4].header, "Código de acceso");
});

test("fixture projection preserves canonical operational, capacity, and commercial facts", () => {
  const value = projection();
  const summary = new Map(value.sheets.summary.rows.map((row) => [row.key, row.value]));
  assert.equal(summary.get("operational_people"), 17);
  assert.equal(summary.get("checked_in"), 6);
  assert.equal(summary.get("pending"), 11);
  assert.equal(summary.get("physical_capacity"), 10);
  assert.equal(summary.get("assigned_capacity"), 7);
  assert.equal(summary.get("remaining_capacity"), 3);
  assert.equal(summary.get("total_commercial"), 1120);
  assert.equal(value.sheets.attendees.rows.length, 18);
  assert.equal(value.sheets.finalReports.rows.length, 0);
});

test("projection preserves historical rows and presale quantities without recalculation", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const presale = report.presales[0];
  presale.quantityPurchased = (presale.quantityPurchased ?? 0) + 2;
  const value = buildGoogleSheetsProjection(report);
  assert.equal(value.sheets.presales.rows.some((row) => row.quantity_purchased !== row.loaded_people), true);
  assert.equal(value.sheets.attendees.rows.some((row) => row.operational === false), true);
  assert.equal(value.sheets.courtesies.rows.some((row) => row.cancelled_historical === true), true);
});

test("unknown money remains null and diagnostics only expose safe aggregate status", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const target = report.reservations.find((reservation) => reservation.soldValue.amount === null);
  if (target) {
    const row = buildGoogleSheetsProjection(report).sheets.reservations.rows.find((item) => item.reservation_id === target.id);
    assert.equal(row?.sold_value, null);
  }
  const summary = new Map(projection().sheets.summary.rows.map((row) => [row.key, row.value]));
  assert.equal(typeof summary.get("integrity_status"), "string");
  assert.equal(typeof summary.get("diagnostics_count"), "number");
  assert.equal(String(summary.get("integrity_status")).includes("guest"), false);
});

test("canonical dataset hash ignores generatedAt and changes for functional data", () => {
  const first = projection();
  const second = { ...first, generatedAt: "2099-01-01T00:00:00.000Z" };
  assert.equal(hashWorkbookDataset(buildWorkbookDatasetHashInput(first)), hashWorkbookDataset(buildWorkbookDatasetHashInput(second)));
  const changed = { ...first, sheets: { ...first.sheets, attendees: { ...first.sheets.attendees, rows: first.sheets.attendees.rows.map((row, index) => index === 0 ? { ...row, name: "Changed" } : row) } } };
  assert.notEqual(hashWorkbookDataset(buildWorkbookDatasetHashInput(first)), hashWorkbookDataset(buildWorkbookDatasetHashInput(changed)));
});

test("projection is non-mutating and access codes stay only in attendee rows", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const before = JSON.stringify(report);
  const value = buildGoogleSheetsProjection(report);
  assert.equal(JSON.stringify(report), before);
  assert.equal(value.sheets.summary.rows.some((row) => row.key === "access_code"), false);
  assert.equal(value.sheets.reservations.rows.some((row) => row.access_code !== undefined), false);
});
