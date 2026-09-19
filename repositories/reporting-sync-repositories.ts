import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ReportingSyncRequest } from "@/features/reporting/sync/types";

export async function requestReportingSync(client: SupabaseClient<Database>, eventId: string): Promise<ReportingSyncRequest> {
  const routed = client as unknown as {
    from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { is: (column: string, value: null) => Promise<{ data: unknown; error: Error | null }> } } } };
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
  };
  const destination = await routed.from("reporting_destinations").select("writer_mode,sheet_schema_version,enabled").eq("event_id", eventId).eq("provider", "google_sheets").is("deleted_at", null);
  if (destination.error) throw destination.error;
  const row = Array.isArray(destination.data) ? destination.data[0] as Record<string, unknown> | undefined : destination.data as Record<string, unknown> | null;
  const rpcName = row?.writer_mode === "oauth_user" && Number(row.sheet_schema_version) === 2
    ? "request_reporting_oauth_sync"
    : "request_reporting_sync";
  const { data, error } = await routed.rpc(rpcName, { p_event_id: eventId });
  if (error) throw error;
  const resultRow = Array.isArray(data) ? data[0] : data;
  if (!resultRow) throw new Error("Reporting sync request returned no work item.");
  const result = resultRow as { outbox_id: string; destination_id: string; requested_sequence: number };
  return { outboxId: result.outbox_id, destinationId: result.destination_id, requestedSequence: Number(result.requested_sequence) };
}

export const requestEventReportingSync = requestReportingSync;

export async function requestReportingReconciliationBatch(client: SupabaseClient<Database>, limit = 100) {
  const { data, error } = await (client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> }).rpc("request_reporting_reconciliation", { p_limit: limit });
  if (error) throw error;
  return (data ?? { destinations_considered: 0, requested: 0, failed: 0 }) as { destinations_considered: number; requested: number; failed: number };
}

export const requestFinalEventReportingSync = requestReportingSync;

export async function getReportingDestination(client: SupabaseClient<Database>, eventId: string) {
  const { data, error } = await client.from("reporting_destinations").select("*").eq("event_id", eventId).eq("provider", "google_sheets").is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertReportingDestination(client: SupabaseClient<Database>, eventId: string, spreadsheetId: string, enabled = true) {
  const { data, error } = await (client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> }).rpc("upsert_reporting_destination", { p_event_id: eventId, p_spreadsheet_id: spreadsheetId, p_enabled: enabled });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
}

export async function setReportingDestinationEnabled(client: SupabaseClient<Database>, eventId: string, enabled: boolean) {
  const { data, error } = await (client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> }).rpc("set_reporting_destination_enabled", { p_event_id: eventId, p_enabled: enabled });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
}

export async function listReportingSyncRuns(client: SupabaseClient<Database>, eventId: string, limit = 20) {
  const { data, error } = await client.from("reporting_sync_runs").select("*").eq("event_id", eventId).order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}
