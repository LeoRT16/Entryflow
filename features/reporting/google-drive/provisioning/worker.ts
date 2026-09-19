/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAuthenticatedGoogleDriveTransport } from "../client/google-drive-client";
import { type GoogleDriveTransport, FOLDER_MIME_TYPE } from "../client/transport";
import { ensureOrganizationDriveRoot } from "./root";
import { readDriveRefreshTokenSecret } from "../oauth/token-store";

type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>; from: (table: string) => any };
type Job = { outbox_id: string; event_location_id: string; organization_id: string; integration_id: string; target_revision: number; claim_token: string };
type Event = { name: string; startAt?: string | null; start_at?: string | null; timezone?: string | null };
export type DriveWorkerDependencies = { db: Db; transportFactory?: (refreshToken: string) => GoogleDriveTransport; readToken?: (secretId: string) => Promise<string> };
export type DriveErrorClass = "NOT_FOUND" | "AUTH_REAUTH" | "RETRYABLE" | "NEEDS_ACTION" | "UNKNOWN";
export function classifyDriveError(error: unknown): DriveErrorClass {
  const e = error as any; const status = e?.response?.status ?? e?.status ?? e?.code; const message = String(e?.response?.data?.error ?? e?.message ?? "").toLowerCase();
  if (status === 404 || /not found|file not found/.test(message)) return "NOT_FOUND";
  if (status === 401 || message.includes("invalid_grant")) return "AUTH_REAUTH";
  if (status === 429 || (typeof status === "number" && status >= 500) || /timeout|econnreset|network/.test(message)) return "RETRYABLE";
  if (status === 403) return "NEEDS_ACTION";
  return "UNKNOWN";
}

function isValidCalendarDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

export function canonicalEventDateKey(event: Event) {
  const raw = event.startAt ?? event.start_at;
  if (!raw) throw new Error("drive_event_start_at_invalid");
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const localDateTime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (dateOnly || localDateTime) {
    const parts = dateOnly ?? localDateTime!;
    const [, y, m, d] = parts;
    const year = Number(y); const month = Number(m); const day = Number(d);
    if (!isValidCalendarDate(year, month, day)) throw new Error("drive_event_start_at_invalid");
    if (localDateTime) {
      const hour = Number(localDateTime[4]); const minute = Number(localDateTime[5]); const second = Number(localDateTime[6] ?? 0);
      if (hour > 23 || minute > 59 || second > 59) throw new Error("drive_event_start_at_invalid");
    }
    return `${y}-${m}-${d}`;
  }
  const zonedIso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(raw);
  if (!zonedIso || !event.timezone) throw new Error("drive_event_start_at_invalid");
  const offsetHour = Number(zonedIso[8] ?? 0); const offsetMinute = Number(zonedIso[9] ?? 0);
  if (!isValidCalendarDate(Number(zonedIso[1]), Number(zonedIso[2]), Number(zonedIso[3])) || Number(zonedIso[4]) > 23 || Number(zonedIso[5]) > 59 || Number(zonedIso[6] ?? 0) > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) throw new Error("drive_event_start_at_invalid");
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) throw new Error("drive_event_start_at_invalid");
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error();
    return date;
  } catch { throw new Error("drive_event_start_at_invalid"); }
}

export function eventFolderName(event: Event) {
  return `${canonicalEventDateKey(event)} — ${event.name}`;
}

export async function ensureChild(transport: GoogleDriveTransport, parentId: string, id: string | null, name: string) {
  if (id) {
    const file = await transport.getFileMetadata(id);
    if (file.trashed || file.mimeType !== FOLDER_MIME_TYPE || parentId !== undefined && !file.parents.includes(parentId)) throw new Error("drive_folder_drift");
    return file;
  }
  return transport.createFolder(name, parentId, await transport.generateFolderId());
}
async function ensureReserved(transport: GoogleDriveTransport, parentId: string | undefined, definitive: string | null, reserved: string | null, name: string, reserve: (candidate: string) => Promise<string>, confirm: (id: string) => Promise<boolean>) {
  const candidate = reserved ?? (definitive ? null : await transport.generateFolderId());
  const authoritative = definitive ?? await reserve(candidate!);
  let file;
  try { file = await transport.getFileMetadata(authoritative); if (file.trashed || file.mimeType !== FOLDER_MIME_TYPE || parentId !== undefined && !file.parents.includes(parentId)) throw new Error("drive_folder_drift"); }
  catch (error) { if (classifyDriveError(error) !== "NOT_FOUND") throw error; file = await transport.createFolder(name, parentId, authoritative); }
  if (!definitive && !(await confirm(file.id))) throw new Error("drive_reservation_conflict");
  return file;
}

export async function processDriveProvisioningJob(db: Db, job: Job, transportFactory = createAuthenticatedGoogleDriveTransport, readToken = readDriveRefreshTokenSecret) {
  const integration = await db.from("reporting_drive_integrations").select("*").eq("id", job.integration_id).eq("organization_id", job.organization_id).single();
  const location = await db.from("event_drive_locations").select("*").eq("id", job.event_location_id).eq("organization_id", job.organization_id).single();
    const event = location.data ? await db.from("events").select("name,start_at,timezone").eq("id", location.data.event_id).eq("organization_id", job.organization_id).single() : { data: null, error: new Error("missing_location") };
  if (integration.error || location.error || event.error || !integration.data?.enabled || integration.data.status !== "connected" || location.data?.status === "disabled") {
    await db.rpc("fail_drive_provisioning_job", { p_outbox_id: job.outbox_id, p_claim_token: job.claim_token, p_status: "needs_action", p_error_code: "drive_context_invalid" });
    return false;
  }
  try {
    const refresh = await readToken(integration.data.oauth_secret_id);
    const transport = transportFactory(refresh);
    const root = integration.data.organization_drive_folder_id ? await ensureOrganizationDriveRoot(transport, integration.data.organization_drive_folder_id, "La Rota Carlota") : await ensureReserved(transport, undefined, null, integration.data.reserved_organization_drive_folder_id, integration.data.manage_root_name ? (integration.data.last_applied_root_name ?? "La Rota Carlota") : "La Rota Carlota", async (candidate) => (async () => { const result = await db.rpc("reserve_drive_organization_folder_id", { p_integration_id: job.integration_id, p_candidate_file_id: candidate }); if (result.error) throw result.error; return result.data as string; })(), async (id) => (async () => { const result = await db.rpc("confirm_drive_organization_folder", { p_integration_id: job.integration_id, p_file_id: id }); if (result.error) throw result.error; return result.data === true; })());
    const desiredEventDate = await canonicalEventDateKey(event.data);
    const desiredEventName = `${desiredEventDate} — ${event.data.name}`;
    const folder = await ensureReserved(transport, root.id, location.data.event_drive_folder_id, location.data.reserved_event_drive_folder_id, desiredEventName, async (candidate) => (async () => { const result = await db.rpc("reserve_drive_event_folder_id", { p_location_id: job.event_location_id, p_candidate_file_id: candidate, p_revision: job.target_revision }); if (result.error) throw result.error; return result.data as string; })(), async (id) => (async () => { const result = await db.rpc("confirm_drive_event_folder", { p_location_id: job.event_location_id, p_file_id: id }); if (result.error) throw result.error; return result.data === true; })());
    if (location.data.event_drive_folder_id && folder.name !== desiredEventName) {
      if (location.data.last_applied_event_name && folder.name !== location.data.last_applied_event_name) throw new Error("drive_manual_rename_detected");
      await transport.renameFile(folder.id, desiredEventName);
    }
    const reports = await ensureReserved(transport, folder.id, location.data.final_reports_folder_id, location.data.reserved_final_reports_folder_id, "Reportes finales", async (candidate) => (async () => { const result = await db.rpc("reserve_drive_reports_folder_id", { p_location_id: job.event_location_id, p_candidate_file_id: candidate, p_revision: job.target_revision }); if (result.error) throw result.error; return result.data as string; })(), async (id) => (async () => { const result = await db.rpc("confirm_drive_reports_folder", { p_location_id: job.event_location_id, p_file_id: id }); if (result.error) throw result.error; return result.data === true; })());
    await (async () => {
      const result = await db.from("event_drive_locations").update({ last_applied_event_name: desiredEventName, last_applied_event_date: desiredEventDate }).eq("id", job.event_location_id).eq("organization_id", job.organization_id);
      if (result.error) throw result.error;
      return result;
    })();
    const completed = await db.rpc("complete_drive_provisioning_job", { p_outbox_id: job.outbox_id, p_claim_token: job.claim_token, p_target_revision: job.target_revision, p_event_drive_folder_id: folder.id, p_final_reports_folder_id: reports.id });
    if (completed.error) throw completed.error;
    const ok = completed;
    if (ok.data !== true) return false;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const oauthError = String((error as any)?.response?.data?.error ?? "");
    const invalidGrant = message === "invalid_grant" || oauthError === "invalid_grant" || message.toLowerCase().includes("invalid_grant");
    if (invalidGrant) await db.from("reporting_drive_integrations").update({ status: "needs_reauth" }).eq("id", job.integration_id).eq("organization_id", job.organization_id);
    const invalidEventDate = message === "drive_event_start_at_invalid";
    const code = message === "drive_folder_drift" || message === "drive_manual_rename_detected" || invalidEventDate ? message : invalidGrant ? "google_invalid_grant" : "drive_provisioning_failed";
    await db.rpc("fail_drive_provisioning_job", { p_outbox_id: job.outbox_id, p_claim_token: job.claim_token, p_status: code === "google_invalid_grant" || code === "drive_folder_drift" || code === "drive_manual_rename_detected" || invalidEventDate ? "needs_action" : "retry", p_error_code: code });
    return false;
  }
}

export async function processDriveProvisioningBatch(db: Db, workerId: string, limit = 1, transportFactory = createAuthenticatedGoogleDriveTransport, readToken = readDriveRefreshTokenSecret) {
  const claimed = await db.rpc("claim_drive_provisioning_jobs", { p_worker_id: workerId, p_limit: limit });
  if (claimed.error) throw claimed.error;
  const jobs = Array.isArray(claimed.data) ? claimed.data as Job[] : [];
  let succeeded = 0;
  for (const job of jobs) if (await processDriveProvisioningJob(db, job, transportFactory, readToken)) succeeded += 1;
  return { claimed: jobs.length, succeeded, failed: jobs.length - succeeded };
}
