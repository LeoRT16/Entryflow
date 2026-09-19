export type SpreadsheetProvisioningFailureStatus = "blocked" | "retry" | "uncertain" | "needs_action" | "needs_reauth";
export type SpreadsheetProvisioningFailureCode =
  | "drive_event_folder_required"
  | "drive_event_folder_invalid"
  | "google_invalid_grant"
  | "google_auth_failed"
  | "google_scope_insufficient"
  | "google_permission_denied"
  | "spreadsheet_not_found"
  | "spreadsheet_moved"
  | "spreadsheet_marker_duplicates"
  | "spreadsheet_identity_conflict"
  | "spreadsheet_create_uncertain"
  | "google_rate_limited"
  | "google_temporarily_unavailable"
  | "google_network_unavailable"
  | "spreadsheet_provisioning_failed";
export type SpreadsheetProvisioningFailure = { status: SpreadsheetProvisioningFailureStatus; code: SpreadsheetProvisioningFailureCode };

function readObject(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" ? value as Record<string, unknown> : null; }
function errorFields(error: unknown) {
  const root = readObject(error);
  const response = readObject(root?.response);
  const data = readObject(response?.data);
  const providerError = readObject(data?.error);
  const errors = Array.isArray(providerError?.errors) ? providerError.errors : Array.isArray(data?.errors) ? data.errors : [];
  const first = readObject(errors[0]);
  const cause = readObject(root?.cause);
  const statusValue = response?.status ?? root?.status ?? root?.statusCode ?? root?.code;
  const status = typeof statusValue === "number" ? statusValue : typeof statusValue === "string" && /^\d{3}$/.test(statusValue) ? Number(statusValue) : null;
  const oauthError = typeof providerError?.status === "string" ? providerError.status : typeof data?.error === "string" ? data.error : "";
  const reason = typeof first?.reason === "string" ? first.reason : typeof data?.reason === "string" ? data.reason : "";
  const message = [root?.message, cause?.message].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  const code = typeof root?.code === "string" ? root.code : "";
  return { status, oauthError: oauthError.toLowerCase(), reason, message, code: code.toLowerCase() };
}

export function classifySpreadsheetProvisioningError(error: unknown, stage: "folder_metadata" | "spreadsheet_search" | "spreadsheet_metadata" | "spreadsheet_create" | "spreadsheet_rename"): SpreadsheetProvisioningFailure {
  const fields = errorFields(error);
  if (fields.oauthError.includes("invalid_grant") || fields.message.includes("invalid_grant")) return { status: "needs_reauth", code: "google_invalid_grant" };
  if (fields.status === 401 || fields.oauthError.includes("unauthorized")) return { status: "needs_reauth", code: "google_auth_failed" };
  if (fields.status === 403) {
    if (["access_token_scope_insufficient", "insufficient_scope", "insufficient_scope_error"].includes(fields.reason.toLowerCase())) {
      return { status: "needs_action", code: "google_scope_insufficient" };
    }
    return { status: "needs_action", code: "google_permission_denied" };
  }
  if (fields.status === 404) {
    if (stage === "spreadsheet_metadata") return { status: "needs_action", code: "spreadsheet_not_found" };
    if (stage === "folder_metadata") return { status: "needs_action", code: "drive_event_folder_invalid" };
    return { status: "needs_action", code: "spreadsheet_not_found" };
  }
  if (fields.status === 429) return { status: "retry", code: "google_rate_limited" };
  if (stage === "spreadsheet_create" && (fields.status === null || fields.status >= 500)) {
    return { status: "uncertain", code: "spreadsheet_create_uncertain" };
  }
  if (fields.status !== null && fields.status >= 500) return { status: "retry", code: "google_temporarily_unavailable" };
  if (fields.status === null && /timeout|timed out|econnreset|econnrefused|enotfound|network|socket hang up|fetch failed/.test(`${fields.message} ${fields.code}`)) {
    return stage === "spreadsheet_create"
      ? { status: "uncertain", code: "spreadsheet_create_uncertain" }
      : { status: "retry", code: "google_network_unavailable" };
  }
  return { status: "needs_action", code: "spreadsheet_provisioning_failed" };
}
