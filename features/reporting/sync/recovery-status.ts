export type ReportingRecoveryState = "HEALTHY" | "NEEDS_REAUTH" | "NEEDS_ACTION" | "RECOVERING";

export type ReportingRecoveryInput = {
  integrationStatus?: string | null;
  integrationErrorCode?: string | null;
  enabled?: boolean | null;
  lastError?: string | null;
  lastRequestedSequence?: number | null;
  lastProcessedSequence?: number | null;
};

export type ReportingRecoveryStatus = {
  state: ReportingRecoveryState;
  label: string;
  reason: string | null;
  canReconnect: boolean;
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function buildReportingRecoveryStatus(input: ReportingRecoveryInput): ReportingRecoveryStatus {
  const errors = [input.integrationErrorCode, input.lastError].map(normalize);
  const integrationStatus = normalize(input.integrationStatus);
  const authErrors = ["google_invalid_grant", "google_auth_failed", "google_oauth_account_mismatch", "google_drive_integration_required"];
  const reauth = integrationStatus === "needs_reauth" || ((integrationStatus === "error" || integrationStatus === "disabled" || !integrationStatus) && errors.some((error) => authErrors.includes(error)));
  if (reauth) return { state: "NEEDS_REAUTH", label: "Google necesita reconexión", reason: "EntryFlow no puede continuar actualizando los reportes hasta reconectar la cuenta vinculada.", canReconnect: true };
  const effectiveErrors = integrationStatus === "connected" ? errors.filter((error) => !authErrors.includes(error)) : errors;
  const needsAction = effectiveErrors.some((error) => Boolean(error) && !["retry", "google_rate_limited", "google_temporarily_unavailable"].includes(error));
  if (needsAction) {
    const drift = effectiveErrors.some((error) => ["drive_folder_drift", "drive_manual_rename_detected", "spreadsheet_moved", "spreadsheet_not_found", "managed_sheet_needs_action", "drive_event_folder_invalid"].includes(error));
    return { state: "NEEDS_ACTION", label: "El reporte necesita atención", reason: drift ? "Un recurso de Google cambió y requiere revisión." : "La recuperación automática se detuvo y el reporte requiere revisión.", canReconnect: false };
  }
  const requested = Number(input.lastRequestedSequence ?? 0);
  const processed = Number(input.lastProcessedSequence ?? 0);
  if (input.enabled === true && requested > processed) return { state: "RECOVERING", label: "Google reconectado; recuperando reportes pendientes", reason: "EntryFlow está retomando los trabajos pendientes automáticamente.", canReconnect: false };
  return { state: "HEALTHY", label: "Reportes saludables", reason: null, canReconnect: false };
}
