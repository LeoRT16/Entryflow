import { google, type sheets_v4 } from "googleapis";
import { GOOGLE_SHEETS_TAB_NAMES, type WorkbookProjection, type SheetProjection, type SheetCellValue } from "@/features/reporting/google-sheets/workbook-projection";

export const GOOGLE_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"] as const;
const CANONICAL_TABS = GOOGLE_SHEETS_TAB_NAMES;

export type GoogleSheetsErrorCode = "google_auth_failed" | "google_permission_denied" | "google_spreadsheet_not_found" | "google_rate_limited" | "google_schema_mismatch" | "google_write_failed";
export class GoogleSheetsClientError extends Error {
  constructor(public readonly code: GoogleSheetsErrorCode, message: string, public readonly status?: number) { super(message); this.name = "GoogleSheetsClientError"; }
}

export type ServiceAccountConfig = { clientEmail: string; privateKey: string };
export function readServiceAccountConfig(env: NodeJS.ProcessEnv = process.env): ServiceAccountConfig {
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new GoogleSheetsClientError("google_auth_failed", "Google Service Account configuration is missing.");
  return { clientEmail, privateKey };
}

export function createGoogleSheetsApi(config = readServiceAccountConfig()): sheets_v4.Sheets {
  try {
    const auth = new google.auth.JWT({ email: config.clientEmail, key: config.privateKey, scopes: [...GOOGLE_SHEETS_SCOPES] });
    return google.sheets({ version: "v4", auth });
  } catch { throw new GoogleSheetsClientError("google_auth_failed", "Google authentication could not be initialized."); }
}

export type SpreadsheetMetadata = { spreadsheetId: string; title: string; sheetTitles: string[] };
export type GoogleSheetsTransport = {
  getSpreadsheetMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata>;
  batchUpdate(request: sheets_v4.Schema$BatchUpdateSpreadsheetRequest, spreadsheetId: string): Promise<void>;
  clear(spreadsheetId: string, ranges: string[]): Promise<void>;
  updateValues(spreadsheetId: string, data: sheets_v4.Schema$ValueRange[]): Promise<void>;
};

function safeGoogleError(error: unknown): GoogleSheetsClientError {
  const status = error && typeof error === "object" && "code" in error && typeof error.code === "number" ? error.code : undefined;
  if (status === 401 || status === 403) return new GoogleSheetsClientError("google_permission_denied", "Google denied access to the spreadsheet.", status);
  if (status === 404) return new GoogleSheetsClientError("google_spreadsheet_not_found", "The requested spreadsheet was not found.", status);
  if (status === 429) return new GoogleSheetsClientError("google_rate_limited", "Google rate limit reached.", status);
  return new GoogleSheetsClientError("google_write_failed", "Google Sheets operation failed.", status);
}

export function createGoogleSheetsTransport(api = createGoogleSheetsApi()): GoogleSheetsTransport {
  return {
    async getSpreadsheetMetadata(spreadsheetId) {
      try { const response = await api.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId,properties(title),sheets(properties(sheetId,title))" }); return { spreadsheetId: response.data.spreadsheetId ?? spreadsheetId, title: response.data.properties?.title ?? "", sheetTitles: (response.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter((title): title is string => Boolean(title)) }; } catch (error) { throw safeGoogleError(error); }
    },
    async batchUpdate(request, spreadsheetId) { try { await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: request }); } catch (error) { throw safeGoogleError(error); } },
    async clear(spreadsheetId, ranges) { try { await api.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges } }); } catch (error) { throw safeGoogleError(error); } },
    async updateValues(spreadsheetId, data) { try { await api.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } }); } catch (error) { throw safeGoogleError(error); } },
  };
}

export function sanitizeTextCell(value: string): string { return /^[=+\-@]/.test(value) ? `'${value}` : value; }
export function serializeCell(value: SheetCellValue, type: string): SheetCellValue {
  if (value === null) return null;
  if ((type === "text" || type === "date" || type === "datetime" || type === "mixed") && typeof value === "string") return sanitizeTextCell(value);
  return value;
}
export function serializeSheet(sheet: SheetProjection): sheets_v4.Schema$ValueRange {
  return { range: `'${sheet.title}'!A1`, values: [sheet.columns.map((column) => column.header), ...sheet.rows.map((row) => sheet.columns.map((column) => serializeCell(row[column.key] ?? null, column.type)))] };
}

export async function getSpreadsheetMetadata(transport: GoogleSheetsTransport, spreadsheetId: string) { return transport.getSpreadsheetMetadata(spreadsheetId); }

export async function ensureWorkbookSchema(transport: GoogleSheetsTransport, spreadsheetId: string): Promise<SpreadsheetMetadata> {
  const metadata = await transport.getSpreadsheetMetadata(spreadsheetId);
  const missing = CANONICAL_TABS.filter((title) => !metadata.sheetTitles.includes(title));
  if (missing.length) await transport.batchUpdate({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }, spreadsheetId);
  return missing.length ? { ...metadata, sheetTitles: [...metadata.sheetTitles, ...missing] } : metadata;
}

export type WorkbookWriteResult = { success: true; spreadsheetId: string; sheetsUpdated: string[]; datasetHash: string };
export async function writeWorkbookProjection(transport: GoogleSheetsTransport, spreadsheetId: string, projection: WorkbookProjection, datasetHash: string): Promise<WorkbookWriteResult> {
  const metadata = await ensureWorkbookSchema(transport, spreadsheetId);
  const liveSheets = [projection.sheets.summary, projection.sheets.reservations, projection.sheets.attendees];
  try {
    await transport.clear(spreadsheetId, liveSheets.map((sheet) => `'${sheet.title}'!A:ZZ`));
    await transport.updateValues(spreadsheetId, liveSheets.map(serializeSheet));
    return { success: true, spreadsheetId: metadata.spreadsheetId, sheetsUpdated: liveSheets.map((sheet) => sheet.title), datasetHash };
  } catch (error) { if (error instanceof GoogleSheetsClientError) throw error; throw new GoogleSheetsClientError("google_write_failed", "Google Sheets write failed safely."); }
}
