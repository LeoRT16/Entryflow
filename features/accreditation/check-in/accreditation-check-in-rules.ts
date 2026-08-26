import type { AccreditationAccessDto } from "@/features/accreditation/access";
import type { AccreditationCheckIn, AccreditationCheckInEvaluation, AccreditationCheckInInvalidReason, AccreditationCheckInScope, AccreditationCheckInSource } from "./types";

export type AccreditationCheckInValidationErrorCode =
  | "invalid_source"
  | "grant_not_found"
  | "wrong_scope"
  | "grant_revoked"
  | "enrollment_cancelled"
  | "already_checked_in";

export class AccreditationCheckInValidationError extends Error {
  code: AccreditationCheckInValidationErrorCode;

  constructor(code: AccreditationCheckInValidationErrorCode, message: string) {
    super(message);
    this.name = "AccreditationCheckInValidationError";
    this.code = code;
  }
}

export function normalizeAccreditationCheckInSource(source: string): AccreditationCheckInSource {
  if (source === "qr" || source === "manual_code") {
    return source;
  }

  throw new AccreditationCheckInValidationError("invalid_source", `Invalid accreditation check-in source: ${source}`);
}

function normalizeInvalidReason(reason?: AccreditationCheckInInvalidReason | string | null): AccreditationCheckInInvalidReason | undefined {
  if (
    reason === "grant_not_found" ||
    reason === "wrong_scope" ||
    reason === "grant_revoked" ||
    reason === "enrollment_cancelled" ||
    reason === "already_checked_in"
  ) {
    return reason;
  }

  if (reason === "revoked") {
    return "grant_revoked";
  }

  return undefined;
}

export function evaluateAccreditationCheckIn(params: {
  scope: AccreditationCheckInScope;
  access?: Pick<AccreditationAccessDto, "grantId" | "organizationId" | "eventId" | "enrollmentId" | "isValid" | "invalidReason"> | null;
  existingCheckIn?: Pick<AccreditationCheckIn, "accessGrantId"> | null;
}): AccreditationCheckInEvaluation {
  const { scope, access, existingCheckIn } = params;

  if (!access) {
    return { isValid: false, invalidReason: "grant_not_found" };
  }

  if (access.organizationId !== scope.organizationId || access.eventId !== scope.eventId) {
    return { isValid: false, invalidReason: "wrong_scope" };
  }

  const invalidReason = normalizeInvalidReason(access.invalidReason);

  if (invalidReason === "wrong_scope") {
    return { isValid: false, invalidReason: "wrong_scope" };
  }

  if (existingCheckIn) {
    return { isValid: false, invalidReason: "already_checked_in" };
  }

  if (invalidReason === "grant_revoked") {
    return { isValid: false, invalidReason: "grant_revoked" };
  }

  if (invalidReason === "enrollment_cancelled") {
    return { isValid: false, invalidReason: "enrollment_cancelled" };
  }

  if (!access.isValid) {
    return { isValid: false, invalidReason: "grant_not_found" };
  }

  return { isValid: true };
}
