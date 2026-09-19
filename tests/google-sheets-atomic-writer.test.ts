import assert from "node:assert/strict";
import test from "node:test";
import type { sheets_v4 } from "googleapis";
import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildGoogleSheetsProjection, GOOGLE_SHEETS_TAB_NAMES, type WorkbookProjection } from "../features/reporting/google-sheets/workbook-projection";
import { AtomicWorkbookWriterError, writeAtomicWorkbookSnapshot, updateAtomicWorkbookSyncTimestamp, type AtomicGoogleSheetsTransport, type AtomicSheetMetadata } from "../features/reporting/google-sheets/atomic-writer";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

type FakeSheet = AtomicSheetMetadata & { cells: Map<string, unknown>; filter?: unknown; frozenRowCount: number; frozenColumnCount: number; hidden: Set<number>; widths: Map<number, number> };
type FakeValue = Record<string, unknown>;
function object(value: unknown): FakeValue { return value && typeof value === "object" ? value as FakeValue : {}; }
function sheet(title: string, sheetId: number, marker?: string): FakeSheet { return { title, sheetId, rowCount: 1000, columnCount: 26, ownershipMarker: marker, hasMeaningfulContent: false, hasUnsupportedObjects: false, cells: new Map(), frozenRowCount: 0, frozenColumnCount: 0, hidden: new Set(), widths: new Map() }; }
class StatefulSheetsFake implements AtomicGoogleSheetsTransport {
  sheets = new Map<number, FakeSheet>();
  batches: sheets_v4.Schema$BatchUpdateSpreadsheetRequest[] = [];
  failNextBatch = false;
  constructor(initial: FakeSheet[]) { initial.forEach((item) => this.sheets.set(item.sheetId, item)); }
  async getWorkbookMetadata(spreadsheetId: string) { return { spreadsheetId, title: "Test workbook", sheets: [...this.sheets.values()].map((item) => ({ sheetId: item.sheetId, title: item.title, rowCount: item.rowCount, columnCount: item.columnCount, hasMeaningfulContent: item.hasMeaningfulContent, hasUnsupportedObjects: item.hasUnsupportedObjects, ownershipMarkerCount: item.ownershipMarkerCount ?? (item.ownershipMarker ? 1 : 0), ...(item.ownershipMarker ? { ownershipMarker: item.ownershipMarker } : {}) })) }; }
  async batchUpdate(_spreadsheetId: string, request: sheets_v4.Schema$BatchUpdateSpreadsheetRequest) {
    this.batches.push(structuredClone(request));
    if (this.failNextBatch) { this.failNextBatch = false; throw new AtomicWorkbookWriterError("google_temporarily_unavailable", "safe", true); }
    const staged = new Map([...this.sheets].map(([id, current]) => [id, structuredClone(current)]));
    let nextId = Math.max(0, ...staged.keys()) + 1;
    for (const raw of request.requests ?? []) {
      const req = raw as unknown as FakeValue;
      if (req.addSheet) { const p = object(object(req.addSheet).properties); const grid = object(p.gridProperties); const created = sheet(String(p.title), typeof p.sheetId === "number" ? p.sheetId : nextId++); created.rowCount = typeof grid.rowCount === "number" ? grid.rowCount : 1000; created.columnCount = typeof grid.columnCount === "number" ? grid.columnCount : 26; staged.set(created.sheetId, created); }
      if (req.createDeveloperMetadata) { const md = object(object(req.createDeveloperMetadata).developerMetadata); const location = object(md.location); const target = staged.get(Number(location.sheetId)); if (!target) throw new Error("missing target sheet"); target.ownershipMarker = String(md.metadataValue); }
      if (req.updateSheetProperties) { const p = object(object(req.updateSheetProperties).properties); const grid = object(p.gridProperties); const target = staged.get(Number(p.sheetId)); if (!target) throw new Error("missing sheet properties target"); if (typeof p.title === "string") target.title = p.title; if (typeof grid.rowCount === "number") target.rowCount = grid.rowCount; if (typeof grid.columnCount === "number") target.columnCount = grid.columnCount; if (typeof grid.frozenRowCount === "number") target.frozenRowCount = grid.frozenRowCount; if (typeof grid.frozenColumnCount === "number") target.frozenColumnCount = grid.frozenColumnCount; }
      if (req.repeatCell) {
        const { range, cell, fields } = object(req.repeatCell); const target = staged.get(Number(object(range).sheetId)); if (!target) throw new Error("missing repeat target"); const dimensions = object(range); const cellData = object(cell); const format = object(cellData.userEnteredFormat);
        if (String(fields).includes("userEnteredValue")) for (let row = Number(dimensions.startRowIndex ?? 0); row < Number(dimensions.endRowIndex ?? target.rowCount); row++) for (let col = Number(dimensions.startColumnIndex ?? 0); col < Number(dimensions.endColumnIndex ?? target.columnCount); col++) target.cells.delete(`${row}:${col}`);
        if (format.numberFormat) target.cells.set(`format:${dimensions.startRowIndex}:${dimensions.startColumnIndex}`, format.numberFormat);
      }
      if (req.updateCells) {
        const update = object(req.updateCells); const start = object(update.start); const target = staged.get(Number(start.sheetId)); if (!target) throw new Error("missing update target");
        const rows = Array.isArray(update.rows) ? update.rows : [];
        rows.forEach((row, ri) => { const cells = Array.isArray(object(row).values) ? object(row).values as unknown[] : []; cells.forEach((cell, ci) => { const entered = object(cell).userEnteredValue; if (entered) target.cells.set(`${Number(start.rowIndex) + ri}:${Number(start.columnIndex) + ci}`, entered); }); });
      }
      if (req.updateDimensionProperties) {
        const update = object(req.updateDimensionProperties); const range = object(update.range); const properties = object(update.properties); const target = staged.get(Number(range.sheetId)); if (!target) throw new Error("missing dimension target");
        if (range.dimension === "COLUMNS") for (let index = Number(range.startIndex); index < Number(range.endIndex); index++) { if (properties.hiddenByUser) target.hidden.add(index); else target.hidden.delete(index); if (typeof properties.pixelSize === "number") target.widths.set(index, properties.pixelSize); }
      }
      if (req.setBasicFilter) { const filter = object(req.setBasicFilter).filter; if (!filter) continue; const target = staged.get(Number(object(object(filter).range).sheetId)); if (!target) throw new Error("missing filter target"); target.filter = filter; }
    }
    this.sheets = staged;
  }
}
const eventReport = buildEventReport(buildEventReportFixtureInput());
const at = "2026-09-18T17:45:00.000Z";
function projection(overrides: Parameters<typeof buildGoogleSheetsProjection>[1] = {}) { return buildGoogleSheetsProjection(eventReport, { snapshotTimestamp: at, ...overrides }); }
function initializedFake(extra = true) { return new StatefulSheetsFake([...(extra ? [sheet("Sheet1", 1), sheet("Preventa", 2), sheet("Cortesías", 3), sheet("Reportes finales", 4)] : []), ...GOOGLE_SHEETS_TAB_NAMES.map((title, index) => sheet(title, index + 10, title))]); }
function reqNames(request: sheets_v4.Schema$BatchUpdateSpreadsheetRequest) { return (request.requests ?? []).map((item) => Object.keys(item as object)[0]); }

const reservationHeaders = ["Código", "Tipo", "Estado", "Titular", "Zona", "Mesa/Recurso", "Accesos incluidos/comprados", "Personas registradas", "Ingresados", "Pendientes", "Manillas extra", "Beneficios", "Carnet titular", "WhatsApp titular", "Moneda", "Precio", "Unidad de precio", "Valor base", "Valor extras", "Total"];
const attendeeHeaders = ["Código de acceso", "Nombre", "Tipo", "Estado de la invitación", "Estado ingreso", "Reserva", "Titular", "Zona", "Mesa/Recurso", "Carnet", "WhatsApp", "Hora ingreso", "Manilla extra"];
test("V2 projection owns exactly Resumen, Reservas, Invitados and human headers", () => {
  const p = projection(); assert.deepEqual(Object.values(p.sheets).map((item) => item.title), [...GOOGLE_SHEETS_TAB_NAMES]);
  assert.deepEqual(p.sheets.reservations.columns.filter((col) => col.visibility !== "hidden").map((col) => col.header), reservationHeaders);
  assert.deepEqual(p.sheets.attendees.columns.filter((col) => col.visibility !== "hidden").map((col) => col.header), attendeeHeaders);
  assert.equal(p.sheets.summary.rows.find((row) => row.summary_key === "last_sync")?.metric, "Última sincronización");
});

test("pristine initialization reuses the single empty default sheet as Resumen", async () => {
  const fake = new StatefulSheetsFake([sheet("Sheet1", 1)]);
  await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  assert.deepEqual([...fake.sheets.values()].map((item) => item.title), [...GOOGLE_SHEETS_TAB_NAMES]);
  assert.equal(fake.batches.filter((batch) => batch.requests?.some((req) => "addSheet" in req)).length, 1);
  assert.equal(fake.batches.flatMap((batch) => batch.requests ?? []).filter((req) => "addSheet" in req).length, 2);
  assert.equal(fake.sheets.get(1)?.title, "Resumen");
  assert.ok(GOOGLE_SHEETS_TAB_NAMES.every((title) => [...fake.sheets.values()].some((item) => item.ownershipMarker === title)));
});


test("localized empty default is consumed, while content is protected", async () => {
  const fake = new StatefulSheetsFake([sheet("Hoja 1", 7)]);
  await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  assert.equal(fake.sheets.get(7)?.title, "Resumen");
  const withContent = new StatefulSheetsFake([sheet("Feuille 1", 8)]); withContent.sheets.get(8)!.hasMeaningfulContent = true;
  await assert.rejects(() => writeAtomicWorkbookSnapshot(withContent, "s1", projection(), at), (error) => error instanceof AtomicWorkbookWriterError && error.code === "managed_sheet_needs_action");
  assert.equal(withContent.sheets.get(8)?.title, "Feuille 1"); assert.equal(withContent.batches.length, 0);
});
test("unmarked non-default tabs with missing canonical names stop for review", async () => {
  const fake = new StatefulSheetsFake([sheet("Sheet1", 1), sheet("Invitados copia", 2)]);
  await assert.rejects(() => writeAtomicWorkbookSnapshot(fake, "s1", projection(), at), (error) => error instanceof AtomicWorkbookWriterError && error.code === "managed_sheet_needs_action");
  assert.equal(fake.batches.length, 0);
  assert.equal(fake.sheets.size, 2);
});

test("an initialized normal snapshot is exactly one atomic batch with write, stale cleanup and formatting", async () => {
  const fake = initializedFake(); const result = await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  assert.deepEqual(result.sheetsUpdated, [...GOOGLE_SHEETS_TAB_NAMES]); assert.equal(fake.batches.length, 1);
  const names = reqNames(fake.batches[0]!);
  assert.equal(names.includes("repeatCell"), true); assert.equal(names.includes("updateCells"), true); assert.equal(names.includes("setBasicFilter"), true); assert.equal(names.includes("updateDimensionProperties"), true);
  assert.equal(names.includes("addSheet"), false); assert.equal(names.includes("deleteSheet"), false);
  assert.equal(names.includes("batchClear"), false); assert.equal(names.includes("updateValues"), false);
  assert.ok(["Sheet1", "Preventa", "Cortesías", "Reportes finales"].every((title) => [...fake.sheets.values()].some((item) => item.title === title)));
});

test("managed technical columns are hidden and headers are frozen with filters and useful formatting", async () => {
  const fake = initializedFake(); await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  const reservations = [...fake.sheets.values()].find((item) => item.title === "Reservas")!;
  const guests = [...fake.sheets.values()].find((item) => item.title === "Invitados")!;
  const summary = [...fake.sheets.values()].find((item) => item.title === "Resumen")!;
  assert.deepEqual([...reservations.hidden].sort((a, b) => a - b), [20, 21, 22]);
  assert.deepEqual([...guests.hidden].sort((a, b) => a - b), [13, 14]);
  assert.deepEqual([summary.frozenRowCount, reservations.frozenRowCount, guests.frozenRowCount], [1, 1, 1]);
  assert.deepEqual([summary.frozenColumnCount, reservations.frozenColumnCount, guests.frozenColumnCount], [2, 3, 2]);
  assert.equal(summary.filter, undefined); assert.ok(reservations.filter && guests.filter);
  assert.ok(reservations.widths.get(0)! > 0);
  assert.equal(reservations.cells.has("format:1:15"), true);
  const utilizationRow = projection().sheets.summary.rows.findIndex((row) => row.summary_key === "capacity_utilization");
  assert.equal((summary.cells.get(`format:${utilizationRow + 1}:2`) as { pattern?: string } | undefined)?.pattern, "0%");
});

test("missing managed tab is repaired without removing extra tabs", async () => {
  const fake = initializedFake(); fake.sheets.delete(12); // remove Invitados
  await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  assert.ok([...fake.sheets.values()].some((item) => item.title === "Invitados" && item.ownershipMarker === "Invitados"));
  assert.ok([...fake.sheets.values()].some((item) => item.title === "Preventa"));
});

test("managed grid expands to schema width when old tab columns are too narrow", async () => {
  const fake = initializedFake();
  for (const title of GOOGLE_SHEETS_TAB_NAMES) [...fake.sheets.values()].find((item) => item.title === title)!.columnCount = 8;
  await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  assert.equal([...fake.sheets.values()].find((item) => item.title === "Reservas")?.columnCount, projection().sheets.reservations.columns.length);
});

test("renamed or ambiguous managed sheet identity returns needs_action without creating duplicates", async () => {
  const renamed = initializedFake(); const guestSheet = [...renamed.sheets.values()].find((item) => item.title === "Invitados")!; guestSheet.title = "Invitados (manual)";
  await assert.rejects(() => writeAtomicWorkbookSnapshot(renamed, "s1", projection(), at), (error) => error instanceof AtomicWorkbookWriterError && error.code === "managed_sheet_needs_action");
  assert.equal([...renamed.sheets.values()].filter((item) => item.title.startsWith("Invitados")).length, 1);
  const ambiguous = initializedFake(); const duplicate = sheet("Invitados copia", 99, "Invitados"); ambiguous.sheets.set(99, duplicate);
  await assert.rejects(() => writeAtomicWorkbookSnapshot(ambiguous, "s1", projection(), at), (error) => error instanceof AtomicWorkbookWriterError && error.code === "managed_sheet_needs_action");
  const duplicateMarkers = initializedFake(); duplicateMarkers.sheets.get(12)!.ownershipMarkerCount = 2;
  await assert.rejects(() => writeAtomicWorkbookSnapshot(duplicateMarkers, "s1", projection(), at), (error) => error instanceof AtomicWorkbookWriterError && error.code === "managed_sheet_needs_action");
});

test("snapshot failure leaves the prior workbook unchanged and retry is idempotent", async () => {
  const fake = initializedFake(); await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  const before = structuredClone(fake.sheets.get(12)?.cells); fake.failNextBatch = true;
  await assert.rejects(() => writeAtomicWorkbookSnapshot(fake, "s1", projection(), at));
  assert.deepEqual(fake.sheets.get(12)?.cells, before);
  await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  assert.equal(fake.sheets.get(12)?.cells.size, before?.size);
});

test("unchanged content can update only the sync timestamp cell", async () => {
  const fake = initializedFake(); await updateAtomicWorkbookSyncTimestamp(fake, "s1", projection(), at);
  assert.equal(fake.batches.length, 1); assert.deepEqual(reqNames(fake.batches[0]!), ["updateCells"]);
  const summary = [...fake.sheets.values()].find((item) => item.title === "Resumen")!;
  const timestampRow = projection().sheets.summary.rows.findIndex((row) => row.summary_key === "last_sync") + 1;
  assert.equal((summary.cells.get(`${timestampRow}:2`) as { stringValue?: string })?.stringValue, projection().sheets.summary.rows[timestampRow - 1]?.value);
});

test("hash-skip performs a full snapshot when it had to recreate a missing managed tab", async () => {
  const fake = initializedFake(); fake.sheets.delete(12);
  const result = await updateAtomicWorkbookSyncTimestamp(fake, "s1", projection(), at);
  assert.equal(result.snapshotWritten, true);
  assert.equal(fake.batches.at(-1)?.requests?.some((request) => "updateCells" in request), true);
  assert.ok(fake.batches.at(-1)?.requests?.some((request) => "repeatCell" in request));
});

test("large snapshot is batched and shrinking 520 to 420 removes stale attendee and reservation rows", async () => {
  const first = eventReport.attendees[0]!; const largeReport = { ...eventReport, attendees: Array.from({ length: 520 }, (_, i) => ({ ...first, guestId: `guest-${i}`, accessCode: `CODE-${i}`, name: `Guest ${i}` })) };
  const firstReservation = eventReport.reservations[0]!;
  const manyReport = { ...largeReport, reservations: Array.from({ length: 520 }, (_, i) => ({ ...firstReservation, id: `reservation-${i}`, code: `R-${i}`, holder: `Holder ${i}` })) };
  const many: WorkbookProjection = buildGoogleSheetsProjection(manyReport, { snapshotTimestamp: at }); const fake = initializedFake();
  await writeAtomicWorkbookSnapshot(fake, "s1", many, at);
  assert.equal(fake.batches.length, 1); assert.equal((many.sheets.attendees.rows as unknown[]).length, 520);
  assert.ok((fake.batches[0]?.requests?.length ?? 9999) < 200);
  const smallerReport = { ...manyReport, attendees: manyReport.attendees.slice(0, 420), reservations: manyReport.reservations.slice(0, 420) };
  const smaller = buildGoogleSheetsProjection(smallerReport, { snapshotTimestamp: at }); await writeAtomicWorkbookSnapshot(fake, "s1", smaller, at);
  const guestSheet = [...fake.sheets.values()].find((item) => item.title === "Invitados")!;
  const hiddenIdColumn = smaller.sheets.attendees.columns.findIndex((col) => col.key === "guest_id");
  assert.equal((guestSheet.cells.get(`${421}:${hiddenIdColumn}`) as { stringValue?: string } | undefined), undefined);
  const reservationSheet = [...fake.sheets.values()].find((item) => item.title === "Reservas")!;
  const reservationIdColumn = smaller.sheets.reservations.columns.findIndex((col) => col.key === "reservation_id");
  assert.equal((reservationSheet.cells.get(`${421}:${reservationIdColumn}`) as { stringValue?: string } | undefined), undefined);
  assert.equal(fake.batches.length, 2);
});

test("payload has approved contact fields but no tokens, QR secrets, diagnostics, activity or Vault data", async () => {
  const fake = initializedFake(); await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at);
  const payload = JSON.stringify(fake.batches.at(-1));
  assert.match(payload, /guest/); assert.match(payload, /WhatsApp/);
  for (const forbidden of ["refresh_token", "access_token", "ciphertext", "diagnostics", "activity_metadata", "qr_token", "vault_secret"]) assert.equal(payload.toLowerCase().includes(forbidden), false, forbidden);
});

test("OAuth writer records schema version 2 and does not require Service Account config", async () => {
  assert.equal(projection().schemaVersion, 2);
  const fake = initializedFake(); const result = await writeAtomicWorkbookSnapshot(fake, "s1", projection(), at); assert.equal(result.schemaVersion, 2);
});
