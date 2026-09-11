export type LastSuccessfulReportingSync = { datasetHash: string | null; spreadsheetId: string | null; sheetSchemaVersion: number | null } | null;
export function canSkipReportingWrite(input: { datasetHash: string; spreadsheetId: string; sheetSchemaVersion: number; lastSuccessfulSync: LastSuccessfulReportingSync }) {
  const last = input.lastSuccessfulSync;
  return Boolean(last?.datasetHash === input.datasetHash && last.spreadsheetId === input.spreadsheetId && last.sheetSchemaVersion === input.sheetSchemaVersion);
}
