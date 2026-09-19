import type { Auth, sheets_v4 } from "googleapis";
import { google } from "googleapis";
import { GOOGLE_SHEETS_TAB_NAMES, type SheetCellValue, type SheetColumn, type SheetProjection, type WorkbookProjection } from "./workbook-projection";
import { createGoogleOAuthClient, setGoogleOAuthCredentials } from "@/features/reporting/google-drive/oauth/google-oauth-client";

export const GOOGLE_SHEETS_OAUTH_SCHEMA_VERSION = 2 as const;
const OWNERSHIP_KEY = "entryflow_managed_sheet_v2";
const SUMMARY_SYNC_KEY = "last_sync";
const GOOGLE_DEFAULT_TAB_TITLES = ["Sheet1", "Hoja 1"] as const;

export type AtomicSheetMetadata = {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
  ownershipMarker?: string;
  ownershipMarkerCount?: number;
  hasMeaningfulContent?: boolean;
  hasUnsupportedObjects?: boolean;
};
export type AtomicWorkbookMetadata = { spreadsheetId: string; title: string; sheets: AtomicSheetMetadata[] };
export type AtomicGoogleSheetsTransport = {
  getWorkbookMetadata(spreadsheetId: string): Promise<AtomicWorkbookMetadata>;
  batchUpdate(spreadsheetId: string, request: sheets_v4.Schema$BatchUpdateSpreadsheetRequest): Promise<void>;
};
export type AtomicWriterFailureCode = "google_invalid_grant" | "google_auth_failed" | "google_scope_insufficient" | "google_permission_denied" | "google_rate_limited" | "google_temporarily_unavailable" | "spreadsheet_not_found" | "managed_sheet_needs_action" | "google_write_failed";
export class AtomicWorkbookWriterError extends Error {
  constructor(public readonly code: AtomicWriterFailureCode, message: string, public readonly recoverable: boolean) { super(message); this.name = "AtomicWorkbookWriterError"; }
}

export function classifyAtomicGoogleSheetsError(error: unknown): AtomicWorkbookWriterError {
  const root = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const response = root.response && typeof root.response === "object" ? root.response as Record<string, unknown> : {};
  const data = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};
  const provider = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
  const errors = Array.isArray(data.errors) ? data.errors : Array.isArray(provider.errors) ? provider.errors : [];
  const first = errors[0] && typeof errors[0] === "object" ? errors[0] as Record<string, unknown> : {};
  const statusValue = response.status ?? root.status ?? root.statusCode ?? root.code;
  const status = typeof statusValue === "number" ? statusValue : typeof statusValue === "string" && /^\d{3}$/.test(statusValue) ? Number(statusValue) : null;
  const oauthError = typeof data.error === "string" ? data.error : typeof provider.status === "string" ? provider.status : "";
  const reason = typeof first.reason === "string" ? first.reason : "";
  const message = `${typeof root.message === "string" ? root.message : ""} ${typeof provider.message === "string" ? provider.message : ""} ${typeof data.error_description === "string" ? data.error_description : ""}`.toLowerCase();
  if (oauthError === "invalid_grant" || message.includes("invalid_grant")) return new AtomicWorkbookWriterError("google_invalid_grant", "Google authorization must be renewed.", false);
  if (status === 401) return new AtomicWorkbookWriterError("google_auth_failed", "Google authorization was rejected.", false);
  if (status === 403 && /access_token_scope_insufficient|insufficient_scope|insufficient.*scope|scope.*insufficient|insufficient authentication scopes/i.test(reason + " " + message)) return new AtomicWorkbookWriterError("google_scope_insufficient", "Google Sheets permission scope is insufficient.", false);
  if (status === 403) return new AtomicWorkbookWriterError("google_permission_denied", "Google denied access to the spreadsheet.", false);
  if (status === 404) return new AtomicWorkbookWriterError("spreadsheet_not_found", "The spreadsheet is unavailable.", false);
  if (status === 429) return new AtomicWorkbookWriterError("google_rate_limited", "Google rate limit reached.", true);
  if (status === null || status >= 500) return new AtomicWorkbookWriterError("google_temporarily_unavailable", "Google Sheets is temporarily unavailable.", true);
  return new AtomicWorkbookWriterError("google_write_failed", "Google Sheets operation failed.", false);
}

export function createAtomicGoogleSheetsTransportFromAuth(auth: Auth.OAuth2Client, apiFactory: (auth: Auth.OAuth2Client) => sheets_v4.Sheets = (value) => google.sheets({ version: "v4", auth: value })): AtomicGoogleSheetsTransport {
  const api = apiFactory(auth);
  return {
    async getWorkbookMetadata(spreadsheetId) {
      try {
        const response = await api.spreadsheets.get({ spreadsheetId, includeGridData: true, fields: "spreadsheetId,properties(title),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),developerMetadata(metadataKey,metadataValue,location(sheetId)),charts,bandedRanges,data(rowData(values(userEnteredValue,effectiveValue,note))))" });
        return { spreadsheetId: response.data.spreadsheetId ?? spreadsheetId, title: response.data.properties?.title ?? "", sheets: (response.data.sheets ?? []).flatMap((sheet) => {
          const properties = sheet.properties;
          if (typeof properties?.sheetId !== "number" || typeof properties.title !== "string") return [];
          const markers = (sheet.developerMetadata ?? []).filter((metadata) => metadata.metadataKey === OWNERSHIP_KEY && typeof metadata.metadataValue === "string");
          const marker = markers[0]?.metadataValue;
          const hasMeaningfulContent = (sheet.data ?? []).some((data) => (data.rowData ?? []).some((row) => (row.values ?? []).some((cell) => Boolean(cell.userEnteredValue || cell.effectiveValue || cell.note))));
          const hasUnsupportedObjects = Boolean((sheet.charts ?? []).length || (sheet.bandedRanges ?? []).length);
          return [{ sheetId: properties.sheetId, title: properties.title, rowCount: properties.gridProperties?.rowCount ?? 1000, columnCount: properties.gridProperties?.columnCount ?? 26, ...(marker ? { ownershipMarker: marker } : {}), ownershipMarkerCount: markers.length, hasMeaningfulContent, hasUnsupportedObjects }];
        }) };
      } catch (error) { throw classifyAtomicGoogleSheetsError(error); }
    },
    async batchUpdate(spreadsheetId, request) { try { await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: request }); } catch (error) { throw classifyAtomicGoogleSheetsError(error); } },
  };
}

export function createAtomicGoogleSheetsTransport(refreshToken: string) {
  // OAuth configuration and token refresh are shared with the Drive/Sheets provisioning transport.
  return createAtomicGoogleSheetsTransportFromAuth(setGoogleOAuthCredentials(createGoogleOAuthClient(), refreshToken));
}

function isManagedTitle(title: string): title is typeof GOOGLE_SHEETS_TAB_NAMES[number] { return (GOOGLE_SHEETS_TAB_NAMES as readonly string[]).includes(title); }
function makeRequest(value: unknown): sheets_v4.Schema$Request { return value as sheets_v4.Schema$Request; }

function resolveOwnership(metadata: AtomicWorkbookMetadata) {
  const owned = new Map<string, AtomicSheetMetadata>();
  for (const sheet of metadata.sheets) {
    if (!sheet.ownershipMarker) continue;
    if (sheet.ownershipMarkerCount !== undefined && sheet.ownershipMarkerCount > 1 || !isManagedTitle(sheet.ownershipMarker) || owned.has(sheet.ownershipMarker) || sheet.title !== sheet.ownershipMarker) {
      throw new AtomicWorkbookWriterError("managed_sheet_needs_action", "A managed sheet was renamed or has ambiguous ownership.", false);
    }
    owned.set(sheet.ownershipMarker, sheet);
  }
  for (const title of GOOGLE_SHEETS_TAB_NAMES) {
    if (owned.has(title)) continue;
    const sameTitle = metadata.sheets.find((sheet) => sheet.title === title);
    if (sameTitle?.ownershipMarker) throw new AtomicWorkbookWriterError("managed_sheet_needs_action", "A managed sheet identity conflicts with the canonical tab.", false);
  }
  const hasMissingCanonicalTab = GOOGLE_SHEETS_TAB_NAMES.some((title) => !owned.has(title) && !metadata.sheets.some((sheet) => sheet.title === title));
  const unrecognizedUnmarkedTabs = metadata.sheets.filter((sheet) => !sheet.ownershipMarker && !isManagedTitle(sheet.title) && !(GOOGLE_DEFAULT_TAB_TITLES as readonly string[]).includes(sheet.title));
  if (hasMissingCanonicalTab && !metadata.sheets.some((sheet) => sheet.ownershipMarker) && unrecognizedUnmarkedTabs.length) {
    throw new AtomicWorkbookWriterError("managed_sheet_needs_action", "Unmarked spreadsheet tabs make managed tab identity ambiguous.", false);
  }
  return owned;
}

function canConsumePristineDefault(metadata: AtomicWorkbookMetadata) {
  if (metadata.sheets.length !== 1) return false;
  const only = metadata.sheets[0]!;
  return !only.ownershipMarker && !only.hasMeaningfulContent && !only.hasUnsupportedObjects;
}

async function ensureManagedSheets(transport: AtomicGoogleSheetsTransport, spreadsheetId: string): Promise<{ sheets: Map<string, AtomicSheetMetadata>; created: boolean }> {
  let metadata = await transport.getWorkbookMetadata(spreadsheetId);
  let owned = resolveOwnership(metadata);
  const additions: sheets_v4.Schema$Request[] = [];
  if (canConsumePristineDefault(metadata)) {
    const only = metadata.sheets[0]!;
    await transport.batchUpdate(spreadsheetId, { requests: [makeRequest({ updateSheetProperties: { properties: { sheetId: only.sheetId, title: "Resumen" }, fields: "title" } })] });
    metadata = await transport.getWorkbookMetadata(spreadsheetId);
    owned = resolveOwnership(metadata);
    const summary = metadata.sheets.find((sheet) => sheet.title === "Resumen");
    if (summary) owned.set("Resumen", summary);
  }
  for (const title of GOOGLE_SHEETS_TAB_NAMES) {
    if (owned.has(title)) continue;
    const existing = metadata.sheets.find((sheet) => sheet.title === title);
    if (existing) owned.set(title, existing); // Adopt an exact canonical tab; never delete or rename it.
    else additions.push(makeRequest({ addSheet: { properties: { title, gridProperties: { rowCount: 1000, columnCount: 26 } } } }));
  }
  const created = additions.length > 0;
  if (additions.length) {
    await transport.batchUpdate(spreadsheetId, { requests: additions });
    metadata = await transport.getWorkbookMetadata(spreadsheetId);
    owned = resolveOwnership(metadata);
    for (const title of GOOGLE_SHEETS_TAB_NAMES) if (!owned.has(title)) {
      const sheet = metadata.sheets.find((item) => item.title === title);
      if (sheet) owned.set(title, sheet);
    }
  }
  const markerRequests = GOOGLE_SHEETS_TAB_NAMES.flatMap((title) => {
    const sheet = owned.get(title);
    return sheet && !sheet.ownershipMarker ? [makeRequest({ createDeveloperMetadata: { developerMetadata: { metadataKey: OWNERSHIP_KEY, metadataValue: title, visibility: "DOCUMENT", location: { sheetId: sheet.sheetId } } } })] : [];
  });
  if (markerRequests.length) {
    await transport.batchUpdate(spreadsheetId, { requests: markerRequests });
    metadata = await transport.getWorkbookMetadata(spreadsheetId);
    owned = resolveOwnership(metadata);
  }
  if (GOOGLE_SHEETS_TAB_NAMES.some((title) => !owned.has(title))) throw new AtomicWorkbookWriterError("managed_sheet_needs_action", "Managed workbook tabs could not be identified safely.", false);
  return { sheets: owned, created };
}

function cellData(value: SheetCellValue): sheets_v4.Schema$CellData {
  if (typeof value === "string") return { userEnteredValue: { stringValue: /^[=+\-@]/.test(value) ? `'${value}` : value } };
  if (typeof value === "number") return { userEnteredValue: { numberValue: value } };
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  return {};
}
function projectionRows(sheet: SheetProjection): sheets_v4.Schema$RowData[] {
  return [{ values: sheet.columns.map((column) => cellData(column.header)) }, ...sheet.rows.map((row) => ({ values: sheet.columns.map((column) => cellData(row[column.key] ?? null)) }))];
}
function groupHiddenColumns(columns: readonly SheetColumn[]) {
  const groups: Array<{ start: number; end: number }> = [];
  columns.forEach((column, index) => {
    if (column.visibility !== "hidden") return;
    const last = groups.at(-1);
    if (last && last.end === index) last.end += 1;
    else groups.push({ start: index, end: index + 1 });
  });
  return groups;
}
function summaryTimestampCell(projection: WorkbookProjection, timestamp: string) {
  const sheet = projection.sheets.summary;
  const rowIndex = sheet.rows.findIndex((row) => row.summary_key === SUMMARY_SYNC_KEY);
  const columnIndex = sheet.columns.findIndex((column) => column.key === "value");
  if (rowIndex < 0 || columnIndex < 0) throw new AtomicWorkbookWriterError("google_write_failed", "Workbook sync timestamp cell is missing.", false);
  const displayValue = sheet.rows[rowIndex]?.value;
  return { sheet, rowIndex: rowIndex + 1, columnIndex, value: displayValue ?? timestamp };
}

function fullSnapshotRequests(projection: WorkbookProjection, sheets: Map<string, AtomicSheetMetadata>): sheets_v4.Schema$Request[] {
  const requests: sheets_v4.Schema$Request[] = [];
  for (const sheet of [projection.sheets.summary, projection.sheets.reservations, projection.sheets.attendees]) {
    const meta = sheets.get(sheet.title)!;
    const requiredRows = sheet.rows.length + 1;
    const clearRows = Math.max(meta.rowCount, requiredRows);
    const columnCount = sheet.columns.length;
    if (clearRows > meta.rowCount || columnCount > meta.columnCount) {
      const gridProperties = { ...(clearRows > meta.rowCount ? { rowCount: clearRows } : {}), ...(columnCount > meta.columnCount ? { columnCount } : {}) };
      const fields = [clearRows > meta.rowCount ? "gridProperties.rowCount" : "", columnCount > meta.columnCount ? "gridProperties.columnCount" : ""].filter(Boolean).join(",");
      requests.push(makeRequest({ updateSheetProperties: { properties: { sheetId: meta.sheetId, gridProperties }, fields } }));
    }
    // The whole column span is EntryFlow-owned on each managed tab; unrelated tabs and columns remain untouched.
    requests.push(makeRequest({ repeatCell: { range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: clearRows, startColumnIndex: 0, endColumnIndex: columnCount }, cell: {}, fields: "userEnteredValue,userEnteredFormat" } }));
    requests.push(makeRequest({ updateCells: { start: { sheetId: meta.sheetId, rowIndex: 0, columnIndex: 0 }, rows: projectionRows(sheet), fields: "userEnteredValue" } }));
    requests.push(makeRequest({ repeatCell: { range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount }, cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(textFormat.bold,wrapStrategy)" } }));
    if (sheet.title === "Resumen") {
      sheet.rows.forEach((row, index) => {
        if (row.metric === null) requests.push(makeRequest({ repeatCell: { range: { sheetId: meta.sheetId, startRowIndex: index + 1, endRowIndex: index + 2, startColumnIndex: 0, endColumnIndex: columnCount }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.94, green: 0.96, blue: 0.98 } } }, fields: "userEnteredFormat(textFormat.bold,backgroundColor)" } }));
        if (row.summary_key === "total") requests.push(makeRequest({ repeatCell: { range: { sheetId: meta.sheetId, startRowIndex: index + 1, endRowIndex: index + 2, startColumnIndex: 0, endColumnIndex: columnCount }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat(textFormat.bold)" } }));
      });
    }
    sheet.columns.forEach((column, index) => {
      if (column.visibility === "hidden") return;
      requests.push(makeRequest({ updateDimensionProperties: { range: { sheetId: meta.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 }, properties: { pixelSize: column.widthPx, hiddenByUser: false }, fields: "pixelSize,hiddenByUser" } }));
      if (column.numberFormat) requests.push(makeRequest({ repeatCell: { range: { sheetId: meta.sheetId, startRowIndex: 1, endRowIndex: clearRows, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: column.numberFormat } } }, fields: "userEnteredFormat.numberFormat" } }));
    });
    if (sheet.rowNumberFormats) {
      const valueColumnIndex = sheet.columns.findIndex((column) => column.key === "value");
      if (valueColumnIndex >= 0) for (const [summaryKey, pattern] of Object.entries(sheet.rowNumberFormats)) {
        const rowIndex = sheet.rows.findIndex((row) => row.summary_key === summaryKey);
        if (rowIndex >= 0) requests.push(makeRequest({ repeatCell: { range: { sheetId: meta.sheetId, startRowIndex: rowIndex + 1, endRowIndex: rowIndex + 2, startColumnIndex: valueColumnIndex, endColumnIndex: valueColumnIndex + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern } } }, fields: "userEnteredFormat.numberFormat" } }));
      }
    }
    for (const group of groupHiddenColumns(sheet.columns)) requests.push(makeRequest({ updateDimensionProperties: { range: { sheetId: meta.sheetId, dimension: "COLUMNS", startIndex: group.start, endIndex: group.end }, properties: { hiddenByUser: true, pixelSize: 1 }, fields: "hiddenByUser,pixelSize" } }));
    requests.push(makeRequest({ updateSheetProperties: { properties: { sheetId: meta.sheetId, gridProperties: { frozenRowCount: sheet.frozenRows || 1, ...(sheet.frozenColumns ? { frozenColumnCount: sheet.frozenColumns } : {}) } }, fields: `gridProperties.frozenRowCount${sheet.frozenColumns ? ",gridProperties.frozenColumnCount" : ""}` } }));
    const endColumn = columnCount;
    requests.push(makeRequest({ setBasicFilter: { filter: sheet.filterRange ? { range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: requiredRows, startColumnIndex: 0, endColumnIndex: endColumn } } : null } }));
  }
  return requests;
}

export type AtomicWorkbookWriteResult = { spreadsheetId: string; schemaVersion: 2; sheetsUpdated: readonly string[]; snapshotTimestamp: string };
export async function writeAtomicWorkbookSnapshot(transport: AtomicGoogleSheetsTransport, spreadsheetId: string, projection: WorkbookProjection, snapshotTimestamp: string): Promise<AtomicWorkbookWriteResult> {
  if (projection.schemaVersion !== GOOGLE_SHEETS_OAUTH_SCHEMA_VERSION) throw new AtomicWorkbookWriterError("google_write_failed", "OAuth workbook schema version is unsupported.", false);
  const { sheets } = await ensureManagedSheets(transport, spreadsheetId);
  await transport.batchUpdate(spreadsheetId, { requests: fullSnapshotRequests(projection, sheets) });
  return { spreadsheetId, schemaVersion: 2, sheetsUpdated: GOOGLE_SHEETS_TAB_NAMES, snapshotTimestamp };
}

export async function updateAtomicWorkbookSyncTimestamp(transport: AtomicGoogleSheetsTransport, spreadsheetId: string, projection: WorkbookProjection, snapshotTimestamp: string) {
  if (projection.schemaVersion !== GOOGLE_SHEETS_OAUTH_SCHEMA_VERSION) throw new AtomicWorkbookWriterError("google_write_failed", "OAuth workbook schema version is unsupported.", false);
  const { sheets, created } = await ensureManagedSheets(transport, spreadsheetId);
  if (created) {
    await transport.batchUpdate(spreadsheetId, { requests: fullSnapshotRequests(projection, sheets) });
    return { snapshotWritten: true };
  }
  const cell = summaryTimestampCell(projection, snapshotTimestamp);
  const meta = sheets.get(cell.sheet.title)!;
  await transport.batchUpdate(spreadsheetId, { requests: [makeRequest({ updateCells: { start: { sheetId: meta.sheetId, rowIndex: cell.rowIndex, columnIndex: cell.columnIndex }, rows: [{ values: [cellData(cell.value)] }], fields: "userEnteredValue" } })] });
  return { snapshotWritten: false };
}
