export type ReportingRecoveryPolicy = "AUTO_RETRY" | "REAUTH_REQUIRED" | "REPAIRABLE_DRIFT" | "OPERATOR_RETRY" | "NEEDS_ACTION" | "NON_RETRYABLE" | "BLOCKED";

const transient = new Set(["google_rate_limited", "google_temporarily_unavailable", "google_network_unavailable", "reporting_sync_failed", "worker_failed", "worker_lease_expired"]);
const auth = new Set(["google_invalid_grant", "google_auth_failed", "google_scope_insufficient", "google_drive_integration_required"]);
const drift = new Set(["spreadsheet_moved", "drive_event_folder_invalid", "drive_folder_drift", "drive_manual_rename_detected", "drive_event_folder_revision_changed", "uncertain"]);
const action = new Set(["google_permission_denied", "spreadsheet_not_found", "managed_sheet_needs_action", "spreadsheet_marker_duplicates"]);
const blocked = new Set(["drive_event_folder_required"]);
const invariant = new Set(["reporting_spreadsheet_identity_conflict", "drive_event_start_at_invalid", "google_schema_mismatch", "spreadsheet_identity_conflict"]);

export function classifyReportingFailure(code: string | null | undefined, terminal = false): ReportingRecoveryPolicy {
  const normalized = String(code ?? "").trim().toLowerCase();
  if (auth.has(normalized)) return "REAUTH_REQUIRED";
  if (drift.has(normalized)) return normalized === "uncertain" ? "REPAIRABLE_DRIFT" : "NEEDS_ACTION";
  if (action.has(normalized)) return "NEEDS_ACTION";
  if (blocked.has(normalized)) return "BLOCKED";
  if (invariant.has(normalized)) return "NON_RETRYABLE";
  if (transient.has(normalized)) return terminal ? "OPERATOR_RETRY" : "AUTO_RETRY";
  return "NON_RETRYABLE";
}

export function isOperatorRetryEligible(code: string | null | undefined) {
  return classifyReportingFailure(code, true) === "OPERATOR_RETRY";
}
