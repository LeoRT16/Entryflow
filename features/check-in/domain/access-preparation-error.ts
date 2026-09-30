export type AccessPreparationErrorFields = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
};

/** Safe, structured error for the authoritative access preparation RPC. */
export class AccessPreparationError extends Error {
  readonly operation = "prepare_guest_access_atomic";
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;

  constructor(fields: AccessPreparationErrorFields) {
    super(fields.message || "Authoritative access preparation failed.");
    this.name = "AccessPreparationError";
    this.code = fields.code;
    this.details = fields.details;
    this.hint = fields.hint;
  }
}

export function toAccessPreparationError(error: unknown) {
  if (error instanceof AccessPreparationError) return error;
  if (!error || typeof error !== "object") {
    return new AccessPreparationError({ message: "Authoritative access preparation failed." });
  }
  const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return new AccessPreparationError({
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : "Authoritative access preparation failed.",
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
  });
}

export function logAccessPreparationDiagnostic(error: AccessPreparationError) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[access-preparation]", {
      operation: error.operation,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}
