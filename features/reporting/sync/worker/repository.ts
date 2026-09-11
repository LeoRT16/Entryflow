import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ClaimedReportingWork = { outboxId: string; syncRunId: string; destinationId: string; eventId: string; requestedSequence: number; attempts: number; provider: string; spreadsheetId: string | null; sheetSchemaVersion: number };
export type LastSuccessfulSync = { datasetHash: string | null; spreadsheetId: string | null; sheetSchemaVersion: number | null } | null;
type QueryBuilder = { select(columns: string): QueryBuilder; eq(column: string, value: string): QueryBuilder; not(column: string, operator: string, value: string | null): QueryBuilder; order(column: string, options: { ascending: boolean }): QueryBuilder; limit(value: number): QueryBuilder; maybeSingle(): Promise<{ data: unknown; error: Error | null }> };
export function createReportingWorkerRepository(client: SupabaseClient<Database>) {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await (client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> }).rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  };
  return {
    async claim(workerId: string, limit: number): Promise<ClaimedReportingWork[]> {
      const data = await rpc("claim_reporting_sync_work", { p_worker_id: workerId, p_limit: limit });
      return (Array.isArray(data) ? data : []).map((row) => { const item = row as Record<string, unknown>; return { outboxId: String(item.outbox_id), syncRunId: String(item.sync_run_id), destinationId: String(item.destination_id), eventId: String(item.event_id), requestedSequence: Number(item.requested_sequence), attempts: Number(item.attempts), provider: String(item.provider), spreadsheetId: item.spreadsheet_id ? String(item.spreadsheet_id) : null, sheetSchemaVersion: Number(item.sheet_schema_version) }; });
    },
    async completeSuccess(work: ClaimedReportingWork, hash: string) { await rpc("complete_reporting_sync_success", { p_outbox_id: work.outboxId, p_sync_run_id: work.syncRunId, p_processed_sequence: work.requestedSequence, p_dataset_hash: hash }); },
    async completeFailure(work: ClaimedReportingWork, errorCode: string, message: string, recoverable: boolean, nextAvailableAt: string) { await rpc("complete_reporting_sync_failure", { p_outbox_id: work.outboxId, p_sync_run_id: work.syncRunId, p_error_code: errorCode, p_error_message: message, p_recoverable: recoverable, p_next_available_at: nextAvailableAt }); },
    async lastSuccessfulHash(destinationId: string): Promise<LastSuccessfulSync> { const { data, error } = await (client as unknown as { from: (table: string) => QueryBuilder }).from("reporting_destinations").select("last_success_dataset_hash,last_success_spreadsheet_id,last_success_sheet_schema_version").eq("id", destinationId).maybeSingle(); if (error) throw error; const row = data as { last_success_dataset_hash?: string | null; last_success_spreadsheet_id?: string | null; last_success_sheet_schema_version?: number | null } | null; return row?.last_success_dataset_hash ? { datasetHash: row.last_success_dataset_hash, spreadsheetId: row.last_success_spreadsheet_id ?? null, sheetSchemaVersion: row.last_success_sheet_schema_version ?? null } : null; },
  };
}
