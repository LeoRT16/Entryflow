import { createUuid, nowIso } from "@/lib/supabase/helpers";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type {
  AccreditationAccessDomainDependencies,
  AccreditationAccessDto,
  AccreditationAccessGrant,
  AccreditationAccessScope,
} from "./types";
import {
  assertAccreditationAccessEnrollmentScope,
  buildAccreditationAccessDto,
  normalizeAccreditationAccessCode,
  normalizeAccreditationAccessStatus,
  normalizeAccreditationQrToken,
} from "./accreditation-access-rules";

const HUMAN_READABLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UNIQUE_CONFLICT_MAX_ATTEMPTS = 6;

function getCrypto() {
  const crypto = globalThis.crypto;

  if (!crypto || typeof crypto.getRandomValues !== "function") {
    throw new Error("Crypto API is unavailable.");
  }

  return crypto;
}

function randomIndex(maxExclusive: number) {
  const crypto = getCrypto();
  const limit = Math.floor(256 / maxExclusive) * maxExclusive;
  const single = new Uint8Array(1);

  for (;;) {
    crypto.getRandomValues(single);

    if (single[0] < limit) {
      return single[0] % maxExclusive;
    }
  }
}

function randomReadableChunk(length: number) {
  let output = "";

  for (let index = 0; index < length; index += 1) {
    output += HUMAN_READABLE_ALPHABET[randomIndex(HUMAN_READABLE_ALPHABET.length)];
  }

  return output;
}

export function generateAccreditationAccessCode() {
  return `ACC-${randomReadableChunk(4)}-${randomReadableChunk(4)}`;
}

export function generateAccreditationQrToken() {
  const bytes = new Uint8Array(16);
  getCrypto().getRandomValues(bytes);

  return `acc1_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function buildAccreditationAccessGrant(params: {
  scope: AccreditationAccessScope;
  enrollmentId: string;
  clock?: () => string;
  accessCode?: string;
  qrToken?: string;
  metadata?: Record<string, unknown>;
}): AccreditationAccessGrant {
  const timestamp = (params.clock ?? nowIso)();

  return {
    id: createUuid(),
    organizationId: params.scope.organizationId,
    eventId: params.scope.eventId,
    enrollmentId: params.enrollmentId,
    accessCode: normalizeAccreditationAccessCode(params.accessCode ?? generateAccreditationAccessCode()),
    qrToken: normalizeAccreditationQrToken(params.qrToken ?? generateAccreditationQrToken()),
    status: normalizeAccreditationAccessStatus("active"),
    issuedAt: timestamp,
    updatedAt: timestamp,
    revokedAt: null,
    metadata: params.metadata,
  };
}

function isUniqueViolation(error: unknown, constraints: ReadonlySet<string>) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; constraint?: unknown; message?: unknown };

  if (maybeError.code !== "23505") {
    return false;
  }

  if (typeof maybeError.constraint === "string" && constraints.has(maybeError.constraint)) {
    return true;
  }

  const message = typeof maybeError.message === "string" ? maybeError.message : "";

  return [...constraints].some((constraint) => message.includes(constraint));
}

const enrollmentUniqueConstraints = new Set(["accreditation_access_grants_organization_event_enrollment_unique"]);
const accessCodeUniqueConstraints = new Set(["accreditation_access_grants_organization_event_access_code_unique"]);
const qrTokenUniqueConstraints = new Set(["accreditation_access_grants_qr_token_unique"]);

async function persistWithRetry(params: {
  scope: AccreditationAccessScope;
  enrollmentId: string;
  dependencies: AccreditationAccessDomainDependencies;
  enrollment: AccreditationEnrollment;
}): Promise<AccreditationAccessDto> {
  const { scope, enrollmentId, dependencies, enrollment } = params;

  for (let attempt = 0; attempt < UNIQUE_CONFLICT_MAX_ATTEMPTS; attempt += 1) {
    const grant = buildAccreditationAccessGrant({
      scope,
      enrollmentId,
      clock: dependencies.clock,
      accessCode: dependencies.generateAccessCode?.(),
      qrToken: dependencies.generateQrToken?.(),
    });

    try {
      const stored = await dependencies.accessGrants.create(grant);
      return buildAccreditationAccessDto({ scope, grant: stored, enrollment })!;
    } catch (error) {
      if (isUniqueViolation(error, enrollmentUniqueConstraints)) {
        const existing = await dependencies.accessGrants.getByEnrollment(scope, enrollmentId);

        if (existing) {
          return buildAccreditationAccessDto({ scope, grant: existing, enrollment })!;
        }
      }

      if (isUniqueViolation(error, accessCodeUniqueConstraints) || isUniqueViolation(error, qrTokenUniqueConstraints)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to issue a unique accreditation access grant.");
}

export async function issueAccreditationAccess(params: {
  scope: AccreditationAccessScope;
  enrollmentId: string;
  dependencies: AccreditationAccessDomainDependencies;
}): Promise<AccreditationAccessDto> {
  const { scope, enrollmentId, dependencies } = params;
  const enrollment = await dependencies.enrollments.getById(enrollmentId);

  assertAccreditationAccessEnrollmentScope({ scope, enrollment });
  const activeEnrollment = enrollment as AccreditationEnrollment;

  const existing = await dependencies.accessGrants.getByEnrollment(scope, enrollmentId);

  if (existing) {
    return buildAccreditationAccessDto({ scope, grant: existing, enrollment: activeEnrollment })!;
  }

  return persistWithRetry({ scope, enrollmentId, dependencies, enrollment: activeEnrollment });
}

export async function getAccreditationAccessByEnrollment(params: {
  scope: AccreditationAccessScope;
  enrollmentId: string;
  dependencies: AccreditationAccessDomainDependencies;
}): Promise<AccreditationAccessDto | undefined> {
  const { scope, enrollmentId, dependencies } = params;
  const grant = await dependencies.accessGrants.getByEnrollment(scope, enrollmentId);

  if (!grant) {
    return undefined;
  }

  const enrollment = await dependencies.enrollments.getById(enrollmentId);

  return buildAccreditationAccessDto({ scope, grant, enrollment });
}

export async function resolveAccreditationAccessByCode(params: {
  scope: AccreditationAccessScope;
  accessCode: string;
  dependencies: AccreditationAccessDomainDependencies;
}): Promise<AccreditationAccessDto | undefined> {
  const { scope, accessCode, dependencies } = params;
  const grant = await dependencies.accessGrants.resolveByAccessCode(scope, accessCode);

  if (!grant) {
    return undefined;
  }

  const enrollment = await dependencies.enrollments.getById(grant.enrollmentId);

  return buildAccreditationAccessDto({ scope, grant, enrollment });
}

export async function resolveAccreditationAccessByQrToken(params: {
  scope: AccreditationAccessScope;
  qrToken: string;
  dependencies: AccreditationAccessDomainDependencies;
}): Promise<AccreditationAccessDto | undefined> {
  const { scope, qrToken, dependencies } = params;
  const grant = await dependencies.accessGrants.resolveByQrToken(scope, qrToken);

  if (!grant) {
    return undefined;
  }

  const enrollment = await dependencies.enrollments.getById(grant.enrollmentId);

  return buildAccreditationAccessDto({ scope, grant, enrollment });
}

export async function revokeAccreditationAccess(params: {
  scope: AccreditationAccessScope;
  grantId: string;
  dependencies: AccreditationAccessDomainDependencies;
}): Promise<AccreditationAccessDto> {
  const { scope, grantId, dependencies } = params;
  const current = await dependencies.accessGrants.getById(scope, grantId);

  if (!current) {
    throw new Error("Accreditation access grant not found.");
  }

  if (current.status === "revoked") {
    const enrollment = await dependencies.enrollments.getById(current.enrollmentId);
    return buildAccreditationAccessDto({ scope, grant: current, enrollment })!;
  }

  const revoked = await dependencies.accessGrants.revoke(scope, grantId);
  const enrollment = await dependencies.enrollments.getById(revoked.enrollmentId);

  return buildAccreditationAccessDto({ scope, grant: revoked, enrollment })!;
}
