export type ReportingStatusInput = { destination?: { enabled?: boolean | null; last_requested_sequence?: number | null; last_processed_sequence?: number | null; last_sync_at?: string | null; last_success_at?: string | null; last_error?: string | null } | null; outbox?: { status?: string | null } | null; latestRun?: { status?: string | null; error_message?: string | null } | null };
export function buildReportingSyncStatus(input: ReportingStatusInput) {
  const d = input.destination;
  if (!d) return { configured: false, enabled: false, status: "not_configured" as const, lastRequestedSequence: 0, lastProcessedSequence: 0, lastSyncAt: null, lastSuccessAt: null, error: null };
  const raw = input.outbox?.status ?? input.latestRun?.status ?? (Number(d.last_requested_sequence ?? 0) > Number(d.last_processed_sequence ?? 0) ? "pending" : d.last_success_at ? "synced" : "idle");
  const status = d.enabled === false ? "disabled" : raw === "processing" ? "processing" : raw === "retry" ? "retry" : raw === "failed" || raw === "dead" ? raw : raw === "pending" ? "pending" : "synced";
  return { configured: true, enabled: d.enabled !== false, status, lastRequestedSequence: Number(d.last_requested_sequence ?? 0), lastProcessedSequence: Number(d.last_processed_sequence ?? 0), lastSyncAt: d.last_sync_at ?? null, lastSuccessAt: d.last_success_at ?? null, error: d.last_error ?? input.latestRun?.error_message ?? null };
}
