import { createGoogleOAuthTransports, ENTRYFLOW_SPREADSHEET_MARKER, GOOGLE_SPREADSHEET_MIME_TYPE, type GoogleSpreadsheetDriveTransport, type ManagedSpreadsheetMetadata, type SpreadsheetMarkers } from "./transports";
import { classifySpreadsheetProvisioningError, type SpreadsheetProvisioningFailureStatus } from "./errors";
import { canonicalEventDateKey } from "@/features/reporting/google-drive/provisioning/worker";
import { readDriveRefreshTokenSecret } from "@/features/reporting/google-drive/oauth/token-store";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type RpcResult = { data: unknown; error: unknown };
type Db = SupabaseClient<Database>;
export type ClaimedSpreadsheetProvisioningJob = {
  outbox_id: string;
  destination_id: string;
  event_id: string;
  organization_id: string;
  target_revision: number;
  target_generation?: number;
  attempts: number;
  claim_token: string;
  reconcile_only: boolean;
};
export type SpreadsheetProvisioningContext = {
  event: { name: string; startAt?: string | null; start_at?: string | null; timezone?: string | null };
  location: { status: string; event_drive_folder_id: string | null; revision: number };
  integration: { enabled: boolean; status: string; oauth_secret_id: string | null };
  destination: { spreadsheet_id: string | null; last_applied_spreadsheet_title: string | null; writer_mode: string };
};
export type SpreadsheetProvisioningRepository = {
  claim(workerId: string, limit: number): Promise<ClaimedSpreadsheetProvisioningJob[]>;
  loadContext(job: ClaimedSpreadsheetProvisioningJob): Promise<SpreadsheetProvisioningContext>;
  beginCreate(job: ClaimedSpreadsheetProvisioningJob, eventDriveFolderId: string): Promise<boolean>;
  complete(job: ClaimedSpreadsheetProvisioningJob, eventDriveFolderId: string, spreadsheetId: string, lastAppliedTitle: string, updateLastAppliedTitle: boolean, targetGeneration?: number): Promise<"completed" | "stale" | "needs_action">;
  fail(job: ClaimedSpreadsheetProvisioningJob, status: SpreadsheetProvisioningFailureStatus, errorCode: string, nextAvailableAt?: string): Promise<boolean>;
};
export type SpreadsheetProvisioningDependencies = {
  repository: SpreadsheetProvisioningRepository;
  transportFactory?: (refreshToken: string) => GoogleSpreadsheetDriveTransport;
  readToken?: (secretId: string) => Promise<string>;
  now?: () => Date;
};
export type SpreadsheetProvisioningBatchResult = { claimed: number; ready: number; needsAction: number; failed: number };

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 3_600_000] as const;

export function reportingSpreadsheetTitle(event: SpreadsheetProvisioningContext["event"]) {
  const name = event.name.startsWith("EntryFlow — ") ? event.name : `EntryFlow — ${event.name}`;
  return `${name} — ${canonicalEventDateKey(event)}`;
}

export function reportingSpreadsheetMarkers(eventId: string, organizationId: string): SpreadsheetMarkers {
  return { ...ENTRYFLOW_SPREADSHEET_MARKER, eventId, organizationId };
}

export function reportingSpreadsheetRetryAt(attempt: number, now = new Date()) {
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MS.length - 1)];
  return new Date(now.getTime() + delay).toISOString();
}

function validEventFolder(file: ManagedSpreadsheetMetadata, folderId: string) {
  return file.id === folderId && !file.trashed && file.mimeType === FOLDER_MIME_TYPE;
}

function validSpreadsheet(file: ManagedSpreadsheetMetadata, folderId: string) {
  return Boolean(file.id) && !file.trashed && file.mimeType === GOOGLE_SPREADSHEET_MIME_TYPE && file.parents.includes(folderId);
}

function markerMatches(file: ManagedSpreadsheetMetadata, markers: SpreadsheetMarkers) {
  return Object.entries(markers).every(([key, value]) => file.appProperties[key] === value);
}

async function failSafely(
  repository: SpreadsheetProvisioningRepository,
  job: ClaimedSpreadsheetProvisioningJob,
  status: SpreadsheetProvisioningFailureStatus,
  code: string,
  attempts: number,
  now: () => Date,
) {
  const retryAt = status === "retry" || status === "uncertain" ? reportingSpreadsheetRetryAt(attempts, now()) : undefined;
  await repository.fail(job, status, code, retryAt);
}

export async function processReportingSpreadsheetProvisioningJob(
  deps: SpreadsheetProvisioningDependencies,
  job: ClaimedSpreadsheetProvisioningJob,
) {
  const now = deps.now ?? (() => new Date());
  let createResponseSucceeded = false;
  let stage: "folder_metadata" | "spreadsheet_search" | "spreadsheet_metadata" | "spreadsheet_create" | "spreadsheet_rename" = "folder_metadata";
  try {
    const context = await deps.repository.loadContext(job);
    const folderId = context.location.event_drive_folder_id;
    if (context.location.status !== "ready" || !folderId?.trim()) {
      await failSafely(deps.repository, job, "blocked", "drive_event_folder_required", job.attempts, now);
      return "blocked" as const;
    }
    if (context.location.revision !== job.target_revision) {
      await failSafely(deps.repository, job, "needs_action", "drive_event_folder_revision_changed", job.attempts, now);
      return "needs_action" as const;
    }
    if (!context.integration.enabled || context.integration.status !== "connected" || !context.integration.oauth_secret_id) {
      await failSafely(deps.repository, job, "needs_reauth", "google_drive_integration_required", job.attempts, now);
      return "needs_reauth" as const;
    }
    if (context.destination.writer_mode !== "oauth_user") {
      await failSafely(deps.repository, job, "needs_action", "reporting_writer_mode_conflict", job.attempts, now);
      return "needs_action" as const;
    }

    const refreshToken = await (deps.readToken ?? readDriveRefreshTokenSecret)(context.integration.oauth_secret_id);
    const transport = (deps.transportFactory ?? ((token: string) => createGoogleOAuthTransports(token).drive))(refreshToken);

    stage = "folder_metadata";
    let folder: ManagedSpreadsheetMetadata;
    try { folder = await transport.getFile(folderId); }
    catch (error) {
      const failure = classifySpreadsheetProvisioningError(error, stage);
      await failSafely(deps.repository, job, failure.status, failure.code, job.attempts, now);
      return failure.status === "needs_action" ? "needs_action" as const : failure.status === "needs_reauth" ? "needs_reauth" as const : "failed" as const;
    }
    if (!validEventFolder(folder, folderId)) {
      await failSafely(deps.repository, job, "needs_action", "drive_event_folder_invalid", job.attempts, now);
      return "needs_action" as const;
    }

    const desiredTitle = reportingSpreadsheetTitle(context.event);
    const markers = reportingSpreadsheetMarkers(job.event_id, job.organization_id);
    let file: ManagedSpreadsheetMetadata;
    let isNewlyCreated = false;

    if (context.destination.spreadsheet_id) {
      stage = "spreadsheet_metadata";
      file = await transport.getFile(context.destination.spreadsheet_id);
      if (!validSpreadsheet(file, folderId)) {
        await failSafely(deps.repository, job, "needs_action", file.parents.includes(folderId) ? "spreadsheet_not_found" : "spreadsheet_moved", job.attempts, now);
        return "needs_action";
      }
    } else {
      stage = "spreadsheet_search";
      const matches = await transport.findManagedSpreadsheets(folderId, markers);
      if (matches.length > 1) {
        await failSafely(deps.repository, job, "needs_action", "spreadsheet_marker_duplicates", job.attempts, now);
        return "needs_action";
      }
      if (matches.length === 1) {
        file = matches[0]!;
        if (!validSpreadsheet(file, folderId) || !markerMatches(file, markers)) {
          await failSafely(deps.repository, job, "needs_action", "spreadsheet_marker_conflict", job.attempts, now);
          return "needs_action";
        }
      } else {
        if (job.reconcile_only) {
          await failSafely(deps.repository, job, "uncertain", "spreadsheet_create_uncertain", job.attempts, now);
          return "failed";
        }
        if (!(await deps.repository.beginCreate(job, folderId))) return "stale";
        stage = "spreadsheet_create";
        try {
          file = await transport.createSpreadsheet(desiredTitle, folderId, markers);
          createResponseSucceeded = true;
        } catch (error) {
          const failure = classifySpreadsheetProvisioningError(error, "spreadsheet_create");
          await failSafely(deps.repository, job, failure.status, failure.code, job.attempts, now);
          return failure.status === "needs_action" ? "needs_action" as const : failure.status === "needs_reauth" ? "needs_reauth" as const : "failed" as const;
        }
        isNewlyCreated = true;
        if (!validSpreadsheet(file, folderId) || !markerMatches(file, markers)) {
          await failSafely(deps.repository, job, "uncertain", "spreadsheet_create_uncertain", job.attempts, now);
          return "failed";
        }
      }
    }

    let appliedTitle: string;
    let updateLastAppliedTitle = false;
    if (isNewlyCreated) {
      appliedTitle = desiredTitle;
      updateLastAppliedTitle = true;
    } else if (context.destination.last_applied_spreadsheet_title === null) {
      // First adoption records the current title as the baseline, preserving any pre-existing manual title.
      appliedTitle = file.name || desiredTitle;
    } else if (file.name === context.destination.last_applied_spreadsheet_title) {
      if (file.name !== desiredTitle) {
        stage = "spreadsheet_rename";
        file = await transport.renameFile(file.id, desiredTitle);
        if (!validSpreadsheet(file, folderId)) {
          await failSafely(deps.repository, job, "needs_action", "spreadsheet_moved", job.attempts, now);
          return "needs_action";
        }
        updateLastAppliedTitle = true;
      }
      appliedTitle = desiredTitle;
    } else {
      // A mismatch against our last applied title is a human rename; leave both title and baseline untouched.
      appliedTitle = file.name;
    }

    stage = "spreadsheet_metadata";
    const completion = await deps.repository.complete(job, folderId, file.id, appliedTitle, updateLastAppliedTitle);
    if (completion === "completed") return "ready";
    return completion;
  } catch (error) {
    const failure = createResponseSucceeded
      ? { status: "uncertain" as const, code: "spreadsheet_create_uncertain" as const }
      : classifySpreadsheetProvisioningError(error, stage);
    try { await failSafely(deps.repository, job, failure.status, failure.code, job.attempts, now); } catch { /* Expired ownership is recovered by a later marker reconciliation. */ }
    return failure.status === "needs_action" ? "needs_action" as const : failure.status === "needs_reauth" ? "needs_reauth" as const : "failed" as const;
  }
}

export async function processReportingSpreadsheetProvisioningBatch(
  deps: SpreadsheetProvisioningDependencies,
  workerId: string,
  limit = 5,
): Promise<SpreadsheetProvisioningBatchResult> {
  const jobs = await deps.repository.claim(workerId, limit);
  const result: SpreadsheetProvisioningBatchResult = { claimed: jobs.length, ready: 0, needsAction: 0, failed: 0 };
  for (const job of jobs) {
    const status = await processReportingSpreadsheetProvisioningJob(deps, job);
    if (status === "ready") result.ready += 1;
    else if (status === "needs_action") result.needsAction += 1;
    else result.failed += 1;
  }
  return result;
}

export function createReportingSpreadsheetProvisioningRepository(db: Db): SpreadsheetProvisioningRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const response = await (db.rpc as unknown as (rpcName: string, rpcArgs: Record<string, unknown>) => Promise<RpcResult>)(name, args);
    if (response.error) throw new Error("reporting_spreadsheet_repository_failed");
    return response.data;
  }
  async function query(table: string, columns: string, filters: Array<{ method: "eq" | "is"; column: string; value: unknown }>) {
    type QueryBuilder = {
      eq: (column: string, value: unknown) => QueryBuilder;
      is: (column: string, value: unknown) => QueryBuilder;
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    };
    const client = db as unknown as { from: (tableName: string) => { select: (select: string) => QueryBuilder } };
    let builder = client.from(table).select(columns);
    for (const { method, column, value } of filters) builder = builder[method](column, value);
    const response = await builder.maybeSingle();
    if (response.error || !response.data) throw new Error("reporting_spreadsheet_context_unavailable");
    return response.data as Record<string, unknown>;
  }
  return {
    async claim(workerId, limit) {
      const data = await rpc("claim_reporting_spreadsheet_provisioning_jobs", { p_worker_id: workerId, p_limit: limit });
      return Array.isArray(data) ? data as ClaimedSpreadsheetProvisioningJob[] : [];
    },
    async loadContext(job) {
      const [event, location, integration, destination] = await Promise.all([
        query("events", "name,start_at,timezone", [{ method: "eq", column: "id", value: job.event_id }, { method: "eq", column: "organization_id", value: job.organization_id }]),
        query("event_drive_locations", "status,event_drive_folder_id,revision", [{ method: "eq", column: "event_id", value: job.event_id }, { method: "eq", column: "organization_id", value: job.organization_id }, { method: "is", column: "deleted_at", value: null }]),
        query("reporting_drive_integrations", "enabled,status,oauth_secret_id", [{ method: "eq", column: "organization_id", value: job.organization_id }, { method: "is", column: "deleted_at", value: null }]),
        query("reporting_destinations", "spreadsheet_id,last_applied_spreadsheet_title,writer_mode", [{ method: "eq", column: "id", value: job.destination_id }, { method: "eq", column: "organization_id", value: job.organization_id }, { method: "eq", column: "event_id", value: job.event_id }, { method: "is", column: "deleted_at", value: null }]),
      ]);
      return {
        event: { name: String(event.name ?? ""), start_at: typeof event.start_at === "string" ? event.start_at : null, timezone: typeof event.timezone === "string" ? event.timezone : null },
        location: { status: String(location.status ?? ""), event_drive_folder_id: typeof location.event_drive_folder_id === "string" ? location.event_drive_folder_id : null, revision: Number(location.revision ?? 0) },
        integration: { enabled: integration.enabled === true, status: String(integration.status ?? ""), oauth_secret_id: typeof integration.oauth_secret_id === "string" ? integration.oauth_secret_id : null },
        destination: { spreadsheet_id: typeof destination.spreadsheet_id === "string" ? destination.spreadsheet_id : null, last_applied_spreadsheet_title: typeof destination.last_applied_spreadsheet_title === "string" ? destination.last_applied_spreadsheet_title : null, writer_mode: String(destination.writer_mode ?? "") },
      };
    },
    async beginCreate(job, folderId) {
      return await rpc("begin_reporting_spreadsheet_create", { p_outbox_id: job.outbox_id, p_claim_token: job.claim_token, p_target_revision: job.target_revision, p_event_drive_folder_id: folderId }) === true;
    },
    async complete(job, folderId, spreadsheetId, lastAppliedTitle, updateLastAppliedTitle, targetGeneration = job.target_generation ?? 1) {
      const data = await rpc("complete_reporting_spreadsheet_provisioning_job", { p_outbox_id: job.outbox_id, p_claim_token: job.claim_token, p_target_revision: job.target_revision, p_target_generation: targetGeneration, p_event_drive_folder_id: folderId, p_spreadsheet_id: spreadsheetId, p_last_applied_title: lastAppliedTitle, p_update_last_applied_title: updateLastAppliedTitle });
      if (data === "completed" || data === "stale" || data === "needs_action") return data;
      throw new Error("reporting_spreadsheet_completion_invalid");
    },
    async fail(job, status, errorCode, nextAvailableAt) {
      return await rpc("fail_reporting_spreadsheet_provisioning_job", { p_outbox_id: job.outbox_id, p_claim_token: job.claim_token, p_target_revision: job.target_revision, p_status: status, p_error_code: errorCode, p_next_available_at: nextAvailableAt ?? null }) === true;
    },
  };
}
