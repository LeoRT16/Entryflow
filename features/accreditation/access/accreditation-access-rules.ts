import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type {
  AccreditationAccessDto,
  AccreditationAccessEvaluation,
  AccreditationAccessGrant,
  AccreditationAccessGrantStatus,
  AccreditationAccessInvalidReason,
  AccreditationAccessScope,
} from "./types";

export type AccreditationAccessValidationErrorCode =
  | "invalid_status"
  | "organization_mismatch"
  | "event_mismatch"
  | "enrollment_mismatch"
  | "inactive_enrollment"
  | "wrong_scope"
  | "not_found";

export class AccreditationAccessValidationError extends Error {
  code: AccreditationAccessValidationErrorCode;

  constructor(code: AccreditationAccessValidationErrorCode, message: string) {
    super(message);
    this.name = "AccreditationAccessValidationError";
    this.code = code;
  }
}

export function normalizeAccreditationAccessStatus(status?: string | null): AccreditationAccessGrantStatus {
  if (status === "active" || status === "revoked") {
    return status;
  }

  throw new AccreditationAccessValidationError("invalid_status", `Invalid accreditation access status: ${status ?? "undefined"}`);
}

export function normalizeAccreditationAccessCode(code: string) {
  const normalized = code.trim().toUpperCase();

  if (!normalized) {
    throw new AccreditationAccessValidationError("not_found", "Accreditation access code is required.");
  }

  return normalized;
}

export function normalizeAccreditationQrToken(token: string) {
  const normalized = token.trim().toLowerCase();

  if (!normalized) {
    throw new AccreditationAccessValidationError("not_found", "Accreditation QR token is required.");
  }

  return normalized;
}

export function assertAccreditationAccessScope(params: {
  scope: AccreditationAccessScope;
  grant: Pick<AccreditationAccessGrant, "organizationId" | "eventId" | "enrollmentId">;
}) {
  const { scope, grant } = params;

  if (grant.organizationId !== scope.organizationId) {
    throw new AccreditationAccessValidationError("organization_mismatch", "Accreditation access grant belongs to another organization.");
  }

  if (grant.eventId !== scope.eventId) {
    throw new AccreditationAccessValidationError("event_mismatch", "Accreditation access grant belongs to another event.");
  }
}

export function assertAccreditationAccessEnrollmentScope(params: {
  scope: AccreditationAccessScope;
  enrollment?: Pick<AccreditationEnrollment, "organizationId" | "eventId" | "status"> | null;
}) {
  const { scope, enrollment } = params;

  if (!enrollment) {
    throw new AccreditationAccessValidationError("not_found", "Accreditation enrollment was not found.");
  }

  if (enrollment.organizationId !== scope.organizationId) {
    throw new AccreditationAccessValidationError("organization_mismatch", "Accreditation enrollment belongs to another organization.");
  }

  if (enrollment.eventId !== scope.eventId) {
    throw new AccreditationAccessValidationError("event_mismatch", "Accreditation enrollment belongs to another event.");
  }

  if (enrollment.status !== "active") {
    throw new AccreditationAccessValidationError("inactive_enrollment", "Accreditation enrollment is not active.");
  }
}

export function evaluateAccreditationAccessValidity(params: {
  scope: AccreditationAccessScope;
  grant?: Pick<AccreditationAccessGrant, "organizationId" | "eventId" | "status" | "enrollmentId"> | null;
  enrollment?: Pick<AccreditationEnrollment, "id" | "organizationId" | "eventId" | "status"> | null;
}): AccreditationAccessEvaluation {
  const { scope, grant, enrollment } = params;

  if (!grant || !enrollment) {
    return { isValid: false, invalidReason: "not_found" };
  }

  if (
    grant.organizationId !== scope.organizationId ||
    grant.eventId !== scope.eventId ||
    enrollment.organizationId !== scope.organizationId ||
    enrollment.eventId !== scope.eventId ||
    grant.enrollmentId !== enrollment.id
  ) {
    return { isValid: false, invalidReason: "wrong_scope" };
  }

  if (grant.status === "revoked") {
    return { isValid: false, invalidReason: "revoked" };
  }

  if (enrollment.status === "cancelled") {
    return { isValid: false, invalidReason: "enrollment_cancelled" };
  }

  return { isValid: true };
}

export function buildAccreditationAccessDto(params: {
  scope: AccreditationAccessScope;
  grant?: Pick<
    AccreditationAccessGrant,
    "id" | "organizationId" | "eventId" | "enrollmentId" | "accessCode" | "qrToken" | "status"
  > | null;
  enrollment?: Pick<AccreditationEnrollment, "id" | "organizationId" | "eventId" | "name" | "status"> | null;
}): AccreditationAccessDto | undefined {
  const { scope, grant, enrollment } = params;

  if (!grant) {
    return undefined;
  }

  const evaluation = evaluateAccreditationAccessValidity({ scope, grant, enrollment });

  return {
    grantId: grant.id,
    enrollmentId: grant.enrollmentId,
    organizationId: grant.organizationId,
    eventId: grant.eventId,
    displayName: enrollment?.name ?? "",
    accessCode: grant.accessCode,
    qrToken: grant.qrToken,
    isValid: evaluation.isValid,
    invalidReason: evaluation.invalidReason,
  };
}

export function getAccreditationAccessInvalidReason(evaluation: AccreditationAccessEvaluation): AccreditationAccessInvalidReason | undefined {
  return evaluation.invalidReason;
}
