import { createUuid, nowIso } from "@/lib/supabase/helpers";
import {
  resolveAccreditationAccessByCode,
  resolveAccreditationAccessByQrToken,
  type AccreditationAccessDto,
} from "@/features/accreditation/access";
import { isAccreditationCheckInUniqueViolation } from "@/repositories/supabase-accreditation-checkin-repositories";
import {
  evaluateAccreditationCheckIn,
  normalizeAccreditationCheckInSource,
  AccreditationCheckInValidationError,
} from "./accreditation-check-in-rules";
import { AccreditationCheckInAlreadyConsumedError } from "./errors";
import type {
  AccreditationCheckIn,
  AccreditationCheckInCredential,
  AccreditationCheckInDependencies,
  AccreditationCheckInScope,
} from "./types";

function buildAccreditationCheckIn(params: {
  scope: AccreditationCheckInScope;
  access: AccreditationAccessDto;
  source: AccreditationCheckIn["source"];
  operatorProfileId: string;
  clock?: () => string;
  metadata?: Record<string, unknown> | null;
}): AccreditationCheckIn {
  const timestamp = (params.clock ?? nowIso)();

  return {
    id: createUuid(),
    organizationId: params.scope.organizationId,
    eventId: params.scope.eventId,
    enrollmentId: params.access.enrollmentId,
    accessGrantId: params.access.grantId,
    operatorProfileId: params.operatorProfileId,
    source: params.source,
    checkedInAt: timestamp,
    metadata: params.metadata ?? undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function resolveAccreditationCheckInAccess(params: {
  scope: AccreditationCheckInScope;
  credential: AccreditationCheckInCredential;
  dependencies: AccreditationCheckInDependencies;
}) {
  const { scope, credential, dependencies } = params;

  if (credential.source === "qr") {
    return resolveAccreditationAccessByQrToken({
      scope,
      qrToken: credential.qrToken,
      dependencies,
    });
  }

  return resolveAccreditationAccessByCode({
    scope,
    accessCode: credential.accessCode,
    dependencies,
  });
}

function toValidationError(evaluation: ReturnType<typeof evaluateAccreditationCheckIn>) {
  if (evaluation.isValid) {
    return undefined;
  }

  if (evaluation.invalidReason === "grant_not_found") {
    return new AccreditationCheckInValidationError("grant_not_found", "Accreditation grant was not found.");
  }

  if (evaluation.invalidReason === "wrong_scope") {
    return new AccreditationCheckInValidationError("wrong_scope", "Accreditation access grant belongs to another scope.");
  }

  if (evaluation.invalidReason === "grant_revoked") {
    return new AccreditationCheckInValidationError("grant_revoked", "Accreditation access grant is revoked.");
  }

  if (evaluation.invalidReason === "enrollment_cancelled") {
    return new AccreditationCheckInValidationError("enrollment_cancelled", "Accreditation enrollment is cancelled.");
  }

  return new AccreditationCheckInValidationError("already_checked_in", "Accreditation access grant was already checked in.");
}

export async function registerAccreditationCheckIn(params: {
  scope: AccreditationCheckInScope;
  credential: AccreditationCheckInCredential;
  operatorProfileId: string;
  dependencies: AccreditationCheckInDependencies;
  metadata?: Record<string, unknown> | null;
}): Promise<AccreditationCheckIn> {
  const { scope, credential, operatorProfileId, dependencies, metadata } = params;
  const normalizedSource = normalizeAccreditationCheckInSource(credential.source);
  const access = await resolveAccreditationCheckInAccess({ scope, credential, dependencies });
  const existingCheckIn = access ? await dependencies.checkIns.getByAccessGrant(scope, access.grantId) : undefined;
  const evaluation = evaluateAccreditationCheckIn({ scope, access, existingCheckIn });
  const validationError = toValidationError(evaluation);

  if (validationError) {
    throw validationError;
  }

  const checkIn = buildAccreditationCheckIn({
    scope,
    access: access as AccreditationAccessDto,
    source: normalizedSource,
    operatorProfileId,
    clock: dependencies.clock,
    metadata,
  });

  try {
    return await dependencies.checkIns.create(checkIn);
  } catch (error) {
    if (isAccreditationCheckInUniqueViolation(error)) {
      throw new AccreditationCheckInAlreadyConsumedError();
    }

    throw error;
  }
}

export async function registerAccreditationCheckInByQrToken(params: {
  scope: AccreditationCheckInScope;
  qrToken: string;
  operatorProfileId: string;
  dependencies: AccreditationCheckInDependencies;
  metadata?: Record<string, unknown> | null;
}) {
  return registerAccreditationCheckIn({
    scope: params.scope,
    credential: { source: "qr", qrToken: params.qrToken },
    operatorProfileId: params.operatorProfileId,
    dependencies: params.dependencies,
    metadata: params.metadata,
  });
}

export async function registerAccreditationCheckInByAccessCode(params: {
  scope: AccreditationCheckInScope;
  accessCode: string;
  operatorProfileId: string;
  dependencies: AccreditationCheckInDependencies;
  metadata?: Record<string, unknown> | null;
}) {
  return registerAccreditationCheckIn({
    scope: params.scope,
    credential: { source: "manual_code", accessCode: params.accessCode },
    operatorProfileId: params.operatorProfileId,
    dependencies: params.dependencies,
    metadata: params.metadata,
  });
}
