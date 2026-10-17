export type FinalReportPhase =
  | "authentication"
  | "authorization"
  | "revision_lookup"
  | "report_load"
  | "report_build"
  | "revision_check"
  | "transition"
  | "snapshot_job_confirmation";

export type FinalReportFailure = {
  code: string;
  message: string;
  phase: FinalReportPhase;
};

type ErrorLike = { code?: unknown; message?: unknown };

function errorLike(value: unknown): ErrorLike {
  return value && typeof value === "object" ? value as ErrorLike : {};
}

export function finalReportFailure(phase: FinalReportPhase, error: unknown, fallbackCode: string, fallbackMessage: string): FinalReportFailure {
  const details = errorLike(error);
  const code = typeof details.code === "string" && details.code.trim() ? details.code.trim().slice(0, 80) : fallbackCode;
  const message = typeof details.message === "string" && details.message.trim() ? details.message.trim().slice(0, 240) : fallbackMessage;
  return { code, message, phase };
}

export function logFinalReportFailure(eventId: string, failure: FinalReportFailure) {
  console.error("reporting_final_report_failure", { eventId, ...failure });
}
