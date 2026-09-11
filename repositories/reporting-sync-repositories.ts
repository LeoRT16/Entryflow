import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ReportingSyncRequest } from "@/features/reporting/sync/types";

export async function requestReportingSync(client: SupabaseClient<Database>, eventId: string): Promise<ReportingSyncRequest> {
  const { data, error } = await (client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> }).rpc("request_reporting_sync", { p_event_id: eventId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Reporting sync request returned no work item.");
  const result = row as { outbox_id: string; destination_id: string; requested_sequence: number };
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

export async function listReportingSyncRuns(client: SupabaseClient<Database>, eventId: string, limit = 20) {
  const { data, error } = await client.from("reporting_sync_runs").select("*").eq("event_id", eventId).order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}
