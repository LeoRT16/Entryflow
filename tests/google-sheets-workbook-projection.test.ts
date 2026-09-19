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

function projection(snapshotTimestamp?: string) {
  return buildGoogleSheetsProjection(buildEventReport(buildEventReportFixtureInput()), { snapshotTimestamp });
}

function summaryValues(value = projection()) {
  return new Map(value.sheets.summary.rows.map((row) => [String(row.summary_key), row.value]));
}

const reservationHeaders = [
  "Código", "Tipo", "Estado", "Titular", "Zona", "Mesa/Recurso", "Accesos incluidos/comprados", "Personas registradas", "Ingresados", "Pendientes", "Manillas extra", "Beneficios", "Carnet titular", "WhatsApp titular",
  "Moneda", "Precio", "Unidad de precio", "Valor base", "Valor extras", "Total",
];
const attendeeHeaders = [
  "Código de acceso", "Nombre", "Tipo", "Estado de la invitación", "Estado ingreso", "Reserva", "Titular", "Zona", "Mesa/Recurso", "Carnet", "WhatsApp", "Hora ingreso", "Manilla extra",
];

test("projection exposes exactly three V2 tabs with exact human headers and hidden technical columns", () => {
  const value = projection();
  assert.deepEqual(Object.values(value.sheets).map((sheet) => sheet.title), ["Resumen", "Reservas", "Invitados"]);
  assert.deepEqual(GOOGLE_SHEETS_TAB_NAMES, ["Resumen", "Reservas", "Invitados"]);
  assert.equal(value.schemaVersion, GOOGLE_SHEETS_SCHEMA_VERSION);
  assert.equal(value.schemaVersion, 2);
  assert.deepEqual(value.sheets.reservations.columns.filter((column) => column.visibility !== "hidden").map((column) => column.header), reservationHeaders);
  assert.deepEqual(value.sheets.attendees.columns.filter((column) => column.visibility !== "hidden").map((column) => column.header), attendeeHeaders);
  assert.deepEqual(value.sheets.reservations.columns.filter((column) => column.visibility === "hidden").map((column) => column.key), ["reservation_id", "resource_id", "sector_id"]);
  assert.deepEqual(value.sheets.attendees.columns.filter((column) => column.visibility === "hidden").map((column) => column.key), ["guest_id", "reservation_id"]);
  assert.equal(value.sheets.summary.filterRange, null);
  assert.equal(value.sheets.reservations.frozenRows, 1);
  assert.equal(value.sheets.reservations.frozenColumns, 3);
  assert.equal(value.sheets.attendees.frozenRows, 1);
  assert.equal(value.sheets.attendees.frozenColumns, 2);
});

test("Resumen covers the complete three-tab data contract with historical aggregates", () => {
  const value = projection();
  const summary = summaryValues(value);
  assert.deepEqual(value.sheets.summary.rows.filter((row) => row.metric !== null).map((row) => row.metric), [
    "Evento", "Fecha y hora local", "Lugar", "Estado", "Última sincronización",
    "Registradas", "Ingresadas", "Pendientes",
    "Operativas", "Completadas", "No asistieron", "Canceladas",
    "Compras", "Accesos vendidos", "Personas cargadas", "Pendientes de cargar",
    "Personas operativas", "Ingresadas", "Pendientes", "Valor comercial",
    "Capacidad física", "Asignada", "Disponible", "Utilización",
    "Mesas", "Preventa", "Manillas extra", "Total",
  ]);
  assert.equal(summary.get("event"), "Boliche Reporting E2E");
  assert.equal(summary.get("event_local_datetime"), "02/09/2026 21:00");
  assert.equal(summary.get("event_status"), "Finalizado");
  assert.equal(summary.get("people_registered"), 17);
  assert.equal(summary.get("people_checked_in"), 6);
  assert.equal(summary.get("people_pending"), 11);
  assert.equal(summary.get("reservations_operational"), 5);
  assert.equal(summary.get("reservations_cancelled"), 1);
  assert.equal(summary.get("presale_purchases"), 2);
  assert.equal(summary.get("presale_accesses_sold"), 4);
  assert.equal(summary.get("presale_people_loaded"), 4);
  assert.equal(summary.get("presale_people_pending"), 0);
  assert.equal(summary.get("courtesy_people"), 4);
  assert.equal(summary.get("physical_capacity"), 10);
  assert.equal(summary.get("assigned_capacity"), 7);
  assert.equal(summary.get("available_capacity"), 3);
  assert.equal(summary.get("capacity_utilization"), 0.7);
  assert.equal(summary.get("tables"), 800);
  assert.equal(summary.get("presales"), 200);
  assert.equal(summary.get("extras"), 120);
  assert.equal(summary.get("total"), 1120);
});

test("reservation and attendee rows preserve historical facts, labels, and stable ordering", () => {
  const value = projection();
  const reservations = value.sheets.reservations.rows;
  const mesa = reservations.find((row) => row.code === "M-01");
  const presale = reservations.find((row) => row.code === "P-02");
  const courtesy = reservations.find((row) => row.code === "C-01");
  const cancelled = reservations.find((row) => row.code === "CART5");
  const legacy = reservations.find((row) => row.code === "LEGACY-01");
  assert.equal(mesa?.holder_carnet, "123456");
  assert.equal(mesa?.holder_whatsapp, "70000000");
  assert.equal(mesa?.type, "Mesa");
  assert.equal(mesa?.status, "Confirmada");
  assert.equal(mesa?.zone, "Patio");
  assert.equal(mesa?.resource_name, "Mesa 1");
  assert.equal(mesa?.access_quantity, 5);
  assert.equal(mesa?.extra_wristbands, 2);
  assert.equal(mesa?.benefits, "Acceso VIP ×1 · Bebida ×2");
  assert.equal(mesa?.price, 400);
  assert.equal(mesa?.price_unit, "Por reserva");
  assert.equal(mesa?.base_value, 400);
  assert.equal(mesa?.extra_value, 120);
  assert.equal(mesa?.total, 520);
  assert.equal(reservations.find((row) => row.code === "M-02")?.benefits, "—");
  assert.equal(presale?.type, "Preventa");
  assert.equal(presale?.access_quantity, 3);
  assert.equal(presale?.price, 50);
  assert.equal(presale?.price_unit, "Por acceso");
  assert.equal(courtesy?.type, "Cortesía");
  assert.equal(courtesy?.price, 0);
  assert.equal(courtesy?.price_unit, "Cortesía");
  assert.equal(cancelled?.status, "Cancelada");
  assert.equal(legacy?.price, "Sin dato");
  assert.equal(legacy?.price_unit, "Sin dato");
  assert.equal(legacy?.benefits, "Sin dato");
  assert.equal(legacy?.base_value, "Sin dato");
  assert.equal(legacy?.total, "Sin dato");
  assert.deepEqual(reservations.map((row) => row.code), ["M-01", "M-02", "C-01", "CART5", "LEGACY-01", "P-01", "P-02"]);
  assert.deepEqual(value.sheets.attendees.rows.slice(0, 3).map((row) => row.name), ["Persona 1", "Persona 2", "Persona 3"]);
  const checkedIn = value.sheets.attendees.rows.find((row) => row.access_code === "M-01-01");
  const pending = value.sheets.attendees.rows.find((row) => row.access_code === "M-01-03");
  const cancelledGuest = value.sheets.attendees.rows.find((row) => row.access_code === "C-01-18");
  assert.equal(checkedIn?.holder, "Titular M-01");
  assert.equal(checkedIn?.zone, "Patio");
  assert.equal(checkedIn?.resource_name, "Mesa 1");
  assert.equal(checkedIn?.admission_status, "Ingresó");
  assert.equal(typeof checkedIn?.check_in_at, "string");
  assert.equal(pending?.admission_status, "Pendiente");
  assert.equal(pending?.check_in_at, "—");
  assert.equal(cancelledGuest?.admission_status, "Anulada");
});

test("missing snapshots, unknown amounts, and mixed currencies never become zero", () => {
  const missing = structuredClone(buildEventReportFixtureInput());
  missing.reservations.find((item) => item.id === "mesa-active")!.commercialSnapshot = undefined;
  const missingProjection = buildGoogleSheetsProjection(buildEventReport(missing));
  const missingSummary = new Map(missingProjection.sheets.summary.rows.map((row) => [row.summary_key, row.value]));
  assert.equal(missingSummary.get("total"), "Sin dato");
  assert.equal(missingProjection.sheets.reservations.rows.find((row) => row.code === "M-01")?.price, "Sin dato");
  assert.equal(missingProjection.sheets.reservations.rows.find((row) => row.code === "M-01")?.benefits, "Sin dato");
  assert.equal(missingProjection.sheets.reservations.rows.find((row) => row.code === "M-01")?.base_value, "Sin dato");

  const mixed = structuredClone(buildEventReportFixtureInput());
  mixed.reservations.find((item) => item.id === "presale-individual")!.commercialSnapshot!.currency = "USD";
  const mixedProjection = buildGoogleSheetsProjection(buildEventReport(mixed));
  const mixedTotal = mixedProjection.sheets.summary.rows.find((row) => row.summary_key === "total");
  assert.equal(mixedTotal?.value, "Monedas mixtas");
  assert.equal(mixedTotal?.currency, "Monedas mixtas");
});

test("successful snapshot timestamp is explicit, deterministic, and excluded from content hash", () => {
  const snapshotTimestamp = "2026-09-17T15:00:00.000Z";
  const withTimestamp = projection(snapshotTimestamp);
  assert.equal(withTimestamp.snapshotTimestamp, snapshotTimestamp);
  assert.equal(withTimestamp.sheets.summary.rows.find((row) => row.summary_key === "last_sync")?.value, "17/09/2026 11:00");
  assert.equal(projection().sheets.summary.rows.find((row) => row.summary_key === "last_sync")?.value, "Sin sincronización");
  assert.equal(hashWorkbookDataset(buildWorkbookDatasetHashInput(withTimestamp)), hashWorkbookDataset(buildWorkbookDatasetHashInput(projection("2026-09-18T15:00:00.000Z"))));
});

test("metadata describes writer layout and numeric formats while IDs stay hidden", () => {
  const value = projection();
  assert.equal(value.sheets.reservations.filterRange, "A1:W8");
  assert.equal(value.sheets.attendees.filterRange, "A1:O19");
  assert.equal(value.sheets.reservations.columns.find((column) => column.key === "price")?.numberFormat, "#,##0.00");
  assert.equal(value.sheets.attendees.columns.find((column) => column.key === "check_in_at")?.numberFormat, "dd/mm/yyyy hh:mm");
  assert.equal(value.sheets.summary.rowNumberFormats?.total, "#,##0.00");
  assert.equal(value.sheets.summary.rowNumberFormats?.capacity_utilization, "0%");
  assert.equal(value.sheets.summary.rowNumberFormats?.people_registered, "0");
  for (const sheet of [value.sheets.reservations, value.sheets.attendees]) {
    const humanKeys = sheet.columns.filter((column) => column.visibility !== "hidden").map((column) => column.key);
    for (const row of sheet.rows) for (const key of humanKeys) {
      const cell = row[key];
      assert.equal(typeof cell === "string" && /[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(cell), false);
    }
  }
  const allHumanValues = [...value.sheets.reservations.rows, ...value.sheets.attendees.rows].flatMap((row) => Object.values(row).filter((cell) => typeof cell === "string"));
  assert.equal(allHumanValues.some((cell) => cell.includes("must-not-leak")), false);
  assert.equal(value.sheets.attendees.columns.some((column) => /QR|diagnostic|activity|secret|token/i.test(column.header)), false);
});

test("projection and ordering are deterministic, immutable, and hashed from functional rows", () => {
  const input = buildEventReportFixtureInput();
  const before = structuredClone(input);
  const report = buildEventReport(input);
  const first = buildGoogleSheetsProjection(report);
  const second = buildGoogleSheetsProjection(report);
  assert.deepEqual(first.sheets.reservations.rows, second.sheets.reservations.rows);
  assert.deepEqual(first.sheets.attendees.rows, second.sheets.attendees.rows);
  assert.deepEqual(input, before);
  assert.equal(hashWorkbookDataset(buildWorkbookDatasetHashInput(first)), hashWorkbookDataset(buildWorkbookDatasetHashInput(second)));
  const changed = { ...first, sheets: { ...first.sheets, attendees: { ...first.sheets.attendees, rows: first.sheets.attendees.rows.map((row, index) => index === 0 ? { ...row, name: "Cambio" } : row) } } };
  assert.notEqual(hashWorkbookDataset(buildWorkbookDatasetHashInput(first)), hashWorkbookDataset(buildWorkbookDatasetHashInput(changed)));
});
