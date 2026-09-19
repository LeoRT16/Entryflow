import type { EventReport } from "@/features/reporting/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { readDriveRefreshTokenSecret } from "@/features/reporting/google-drive/oauth/token-store";
import { buildGoogleSheetsProjection, buildWorkbookDatasetHashInput, hashWorkbookDataset } from "./workbook-projection";
import { AtomicWorkbookWriterError, createAtomicGoogleSheetsTransport, updateAtomicWorkbookSyncTimestamp, writeAtomicWorkbookSnapshot, type AtomicGoogleSheetsTransport } from "./atomic-writer";
import { canSkipReportingWrite } from "@/features/reporting/sync/skip";
import { computeReportingRetryAt } from "@/features/reporting/sync/worker/retry";

export type ClaimedOAuthReportingWork = { outboxId: string; syncRunId: string; destinationId: string; organizationId: string; eventId: string; requestedSequence: number; attempts: number; provider: string; spreadsheetId: string | null; sheetSchemaVersion: number; writerMode: string };
export type OAuthReportingRepository = {
  claim(workerId: string, limit: number): Promise<ClaimedOAuthReportingWork[]>;
  lastSuccessfulHash(destinationId: string): Promise<{ datasetHash: string | null; spreadsheetId: string | null; sheetSchemaVersion: number | null } | null>;
  completeSuccess(work: ClaimedOAuthReportingWork, hash: string, snapshotTimestamp: string): Promise<void>;
  completeFailure(work: ClaimedOAuthReportingWork, code: string, failureStatus: OAuthFailureStatus, recoverable: boolean, nextAvailableAt: string): Promise<void>;
};
export type OAuthFailureStatus = "retry" | "needs_reauth" | "needs_action" | "needs_scope_upgrade" | "failed";
export type OAuthReportingWorkerDependencies = { repository: OAuthReportingRepository; loadReport(eventId: string): Promise<EventReport>; readRefreshToken(organizationId: string): Promise<string>; createTransport(refreshToken: string): AtomicGoogleSheetsTransport; now?: () => Date };
export type OAuthReportingBatchResult = { claimed: number; synced: number; skipped: number; failed: number };

function classify(error: unknown): { code: string; status: OAuthFailureStatus; recoverable: boolean } {
  if (error instanceof AtomicWorkbookWriterError) {
    if (error.code === "google_invalid_grant" || error.code === "google_auth_failed") return { code: error.code, status: "needs_reauth", recoverable: false };
    if (error.code === "google_scope_insufficient") return { code: error.code, status: "needs_scope_upgrade", recoverable: false };
    if (error.code === "google_permission_denied" || error.code === "spreadsheet_not_found" || error.code === "managed_sheet_needs_action") return { code: error.code, status: "needs_action", recoverable: false };
    if (error.recoverable) return { code: error.code, status: "retry", recoverable: true };
    return { code: error.code, status: "failed", recoverable: false };
  }
  return { code: "reporting_sync_failed", status: "retry", recoverable: true };
}

export async function processOAuthReportingSyncBatch(deps: OAuthReportingWorkerDependencies, workerId: string, limit = 5): Promise<OAuthReportingBatchResult> {
  const now = deps.now ?? (() => new Date());
  const works = await deps.repository.claim(workerId, limit);
  const result: OAuthReportingBatchResult = { claimed: works.length, synced: 0, skipped: 0, failed: 0 };
  for (const work of works) {
    const snapshotTimestamp = now().toISOString();
    try {
      if (work.writerMode !== "oauth_user" || work.sheetSchemaVersion !== 2) throw new AtomicWorkbookWriterError("google_write_failed", "OAuth workbook schema is unsupported.", false);
      if (!work.spreadsheetId) throw new AtomicWorkbookWriterError("spreadsheet_not_found", "The spreadsheet is unavailable.", false);
      const report = await deps.loadReport(work.eventId);
      const projection = buildGoogleSheetsProjection(report, { snapshotTimestamp });
      const hash = hashWorkbookDataset(buildWorkbookDatasetHashInput(projection));
      const transport = deps.createTransport(await deps.readRefreshToken(work.organizationId));
      const prior = await deps.repository.lastSuccessfulHash(work.destinationId);
      if (canSkipReportingWrite({ datasetHash: hash, spreadsheetId: work.spreadsheetId, sheetSchemaVersion: 2, lastSuccessfulSync: prior })) {
        await updateAtomicWorkbookSyncTimestamp(transport, work.spreadsheetId, projection, snapshotTimestamp);
        await deps.repository.completeSuccess(work, hash, snapshotTimestamp);
        result.skipped += 1;
      } else {
        await writeAtomicWorkbookSnapshot(transport, work.spreadsheetId, projection, snapshotTimestamp);
        await deps.repository.completeSuccess(work, hash, snapshotTimestamp);
        result.synced += 1;
      }
    } catch (error) {
      const failure = classify(error);
      await deps.repository.completeFailure(work, failure.code, failure.status, failure.recoverable, computeReportingRetryAt(work.attempts, now()));
      result.failed += 1;
    }
  }
  return result;
}

type RpcResponse = { data: unknown; error: Error | null };
type QueryBuilder = { select(columns: string): QueryBuilder; eq(column: string, value: string): QueryBuilder; is(column: string, value: null): QueryBuilder; maybeSingle(): Promise<{ data: unknown; error: Error | null }> };
export function createOAuthReportingRepository(client: SupabaseClient<Database>): OAuthReportingRepository {
  const db = client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<RpcResponse>; from(table: string): { select(columns: string): QueryBuilder } };
  async function rpc(name: string, args: Record<string, unknown>) { const response = await db.rpc(name, args); if (response.error) throw new Error("oauth_reporting_repository_failed"); return response.data; }
  return {
    async claim(workerId, limit) {
      const data = await rpc("claim_reporting_oauth_sync_work", { p_worker_id: workerId, p_limit: limit });
      return (Array.isArray(data) ? data : []).map((row) => { const item = row as Record<string, unknown>; return { outboxId: String(item.outbox_id), syncRunId: String(item.sync_run_id), destinationId: String(item.destination_id), organizationId: String(item.organization_id), eventId: String(item.event_id), requestedSequence: Number(item.requested_sequence), attempts: Number(item.attempts), provider: String(item.provider), spreadsheetId: item.spreadsheet_id ? String(item.spreadsheet_id) : null, sheetSchemaVersion: Number(item.sheet_schema_version), writerMode: String(item.writer_mode) }; });
    },
    async lastSuccessfulHash(destinationId) {
      const response = await db.from("reporting_destinations").select("last_success_dataset_hash,last_success_spreadsheet_id,last_success_sheet_schema_version").eq("id", destinationId).maybeSingle();
      if (response.error) throw new Error("oauth_reporting_hash_unavailable");
      const row = response.data as Record<string, unknown> | null;
      return row?.last_success_dataset_hash ? { datasetHash: String(row.last_success_dataset_hash), spreadsheetId: typeof row.last_success_spreadsheet_id === "string" ? row.last_success_spreadsheet_id : null, sheetSchemaVersion: typeof row.last_success_sheet_schema_version === "number" ? row.last_success_sheet_schema_version : null } : null;
    },
    async completeSuccess(work, hash, snapshotTimestamp) { await rpc("complete_reporting_oauth_sync_success", { p_outbox_id: work.outboxId, p_sync_run_id: work.syncRunId, p_processed_sequence: work.requestedSequence, p_dataset_hash: hash, p_success_at: snapshotTimestamp }); },
    async completeFailure(work, code, failureStatus, recoverable, nextAvailableAt) { await rpc("complete_reporting_oauth_sync_failure", { p_outbox_id: work.outboxId, p_sync_run_id: work.syncRunId, p_error_code: code, p_failure_status: failureStatus, p_recoverable: recoverable, p_next_available_at: nextAvailableAt }); },
  };
}

export async function readOAuthReportingRefreshToken(client: SupabaseClient<Database>, organizationId: string) {
  const typed = client as unknown as { from(table: string): { select(columns: string): QueryBuilder } };
  const response = await typed.from("reporting_drive_integrations").select("oauth_secret_id,enabled,status,deleted_at").eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  if (response.error || !response.data) throw new AtomicWorkbookWriterError("google_auth_failed", "Google authorization is unavailable.", false);
  const integration = response.data as { oauth_secret_id?: unknown; enabled?: unknown; status?: unknown; deleted_at?: unknown };
  if (integration.deleted_at || integration.enabled !== true || integration.status !== "connected" || typeof integration.oauth_secret_id !== "string") throw new AtomicWorkbookWriterError("google_auth_failed", "Google authorization is unavailable.", false);
  return readDriveRefreshTokenSecret(integration.oauth_secret_id);
}

export function createOAuthReportingWorkerDependencies(
  client: SupabaseClient<Database>,
  loadReport: (eventId: string) => Promise<EventReport>,
  options: { now?: () => Date } = {},
): OAuthReportingWorkerDependencies {
  return {
    repository: createOAuthReportingRepository(client),
    loadReport,
    readRefreshToken: (organizationId) => readOAuthReportingRefreshToken(client, organizationId),
    createTransport: createAtomicGoogleSheetsTransport,
    ...options,
  };
}
