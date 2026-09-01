import { createUuid, nowIso } from "@/lib/supabase/helpers";
import type {
  AccreditationAccessEntitlement,
  AccreditationAccessEntitlementInput,
  AccreditationAccessEntitlementStatus,
  AccreditationAccessSector,
  AccreditationAccessSectorInput,
  AccreditationAccessSectorStatus,
  AccreditationSectorAccessDecision,
  AccreditationSectorAccessDecisionInput,
  AccreditationSectorAccessAttempt,
  AccreditationSectorAccessAttemptInput,
  AccreditationSectorAccessAttemptSource,
  AccreditationSectorAccessValidationErrorCode,
} from "./types";

export class AccreditationSectorAccessValidationError extends Error {
  code: AccreditationSectorAccessValidationErrorCode;

  constructor(code: AccreditationSectorAccessValidationErrorCode, message: string) {
    super(message);
    this.name = "AccreditationSectorAccessValidationError";
    this.code = code;
  }
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOptionalText(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

export function normalizeAccreditationAccessSectorStatus(status?: string | null): AccreditationAccessSectorStatus {
  if (status === "active" || status === "inactive") {
    return status;
  }

  throw new AccreditationSectorAccessValidationError("invalid_status", `Invalid accreditation access sector status: ${status ?? "undefined"}`);
}

export function normalizeAccreditationAccessEntitlementStatus(
  status?: string | null,
): AccreditationAccessEntitlementStatus {
  if (status === "active" || status === "revoked") {
    return status;
  }

  throw new AccreditationSectorAccessValidationError("invalid_status", `Invalid accreditation access entitlement status: ${status ?? "undefined"}`);
}

export function normalizeAccreditationSectorAccessAttemptSource(source?: string | null): AccreditationSectorAccessAttemptSource {
  if (source === "qr" || source === "manual_code" || source === "manual_operator") {
    return source;
  }

  throw new AccreditationSectorAccessValidationError("invalid_source", `Invalid accreditation sector access source: ${source ?? "undefined"}`);
}

export function normalizeAccreditationAccessSectorName(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new AccreditationSectorAccessValidationError("invalid_name", "Accreditation access sector name is required.");
  }

  return normalized;
}

export function normalizeAccreditationAccessSectorCode(value: string) {
  const normalized = normalizeText(value).toUpperCase();

  if (!normalized) {
    throw new AccreditationSectorAccessValidationError("invalid_code", "Accreditation access sector code is required.");
  }

  return normalized;
}

export function normalizeAccreditationAccessSectorCapacity(value?: number | string | null) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const capacity = typeof value === "string" ? Number(value) : value;

  if (!Number.isFinite(capacity) || capacity < 0 || !Number.isInteger(capacity)) {
    throw new AccreditationSectorAccessValidationError("invalid_capacity", "Accreditation access sector capacity must be a non-negative integer.");
  }

  return capacity;
}

function toMetadata(value?: Record<string, unknown> | null) {
  return value && typeof value === "object" ? value : undefined;
}

function sameScope(
  left: Pick<{
    organizationId: string;
    eventId: string;
  }, "organizationId" | "eventId">,
  right: Pick<{
    organizationId: string;
    eventId: string;
  }, "organizationId" | "eventId">,
) {
  return left.organizationId === right.organizationId && left.eventId === right.eventId;
}

export function buildAccreditationAccessSector(input: AccreditationAccessSectorInput, clock: () => string = nowIso): AccreditationAccessSector {
  const timestamp = clock();

  return {
    id: createUuid(),
    organizationId: input.organizationId,
    eventId: input.eventId,
    name: normalizeAccreditationAccessSectorName(input.name),
    code: normalizeAccreditationAccessSectorCode(input.code),
    description: normalizeOptionalText(input.description),
    status: normalizeAccreditationAccessSectorStatus(input.status ?? "active"),
    capacity: normalizeAccreditationAccessSectorCapacity(input.capacity),
    sortOrder: typeof input.sortOrder === "number" && Number.isInteger(input.sortOrder) ? input.sortOrder : 0,
    metadata: toMetadata(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

export function updateAccreditationAccessSector(
  current: AccreditationAccessSector,
  patch: Partial<AccreditationAccessSectorInput>,
  clock: () => string = nowIso,
): AccreditationAccessSector {
  return {
    ...current,
    name: patch.name === undefined ? current.name : normalizeAccreditationAccessSectorName(patch.name),
    code: patch.code === undefined ? current.code : normalizeAccreditationAccessSectorCode(patch.code),
    description: patch.description === undefined ? current.description : normalizeOptionalText(patch.description),
    status: patch.status === undefined ? current.status : normalizeAccreditationAccessSectorStatus(patch.status),
    capacity: patch.capacity === undefined ? current.capacity : normalizeAccreditationAccessSectorCapacity(patch.capacity),
    sortOrder:
      patch.sortOrder === undefined
        ? current.sortOrder
        : typeof patch.sortOrder === "number" && Number.isInteger(patch.sortOrder)
          ? patch.sortOrder
          : 0,
    metadata: patch.metadata === undefined ? current.metadata : toMetadata(patch.metadata),
    updatedAt: clock(),
  };
}

export function deactivateAccreditationAccessSector(current: AccreditationAccessSector, clock: () => string = nowIso): AccreditationAccessSector {
  if (current.status === "inactive") {
    return { ...current, updatedAt: clock() };
  }

  return {
    ...current,
    status: "inactive",
    updatedAt: clock(),
  };
}

export function buildAccreditationAccessEntitlement(
  input: AccreditationAccessEntitlementInput,
  clock: () => string = nowIso,
): AccreditationAccessEntitlement {
  const timestamp = clock();

  return {
    id: createUuid(),
    organizationId: input.organizationId,
    eventId: input.eventId,
    accessGrantId: input.accessGrantId,
    sectorId: input.sectorId,
    status: normalizeAccreditationAccessEntitlementStatus(input.status ?? "active"),
    issuedAt: input.issuedAt ?? timestamp,
    revokedAt: input.revokedAt ?? null,
    metadata: toMetadata(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function revokeAccreditationAccessEntitlement(
  current: AccreditationAccessEntitlement,
  clock: () => string = nowIso,
): AccreditationAccessEntitlement {
  const timestamp = clock();

  return {
    ...current,
    status: "revoked",
    revokedAt: current.revokedAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function evaluateAccreditationSectorAccess(input: AccreditationSectorAccessDecisionInput): AccreditationSectorAccessDecision {
  const { scope, grant, enrollment, sector, entitlements = [] } = input;

  if (!grant) {
    return { allowed: false, reason: "grant_not_found" };
  }

  if (!enrollment) {
    return { allowed: false, reason: "wrong_scope" };
  }

  if (!sector) {
    return { allowed: false, reason: "sector_not_found" };
  }

  if (
    grant.organizationId !== scope.organizationId ||
    grant.eventId !== scope.eventId ||
    enrollment.organizationId !== scope.organizationId ||
    enrollment.eventId !== scope.eventId ||
    sector.organizationId !== scope.organizationId ||
    sector.eventId !== scope.eventId ||
    grant.enrollmentId !== enrollment.id
  ) {
    return { allowed: false, reason: "wrong_scope" };
  }

  if (grant.status === "revoked") {
    return { allowed: false, reason: "grant_revoked" };
  }

  if (enrollment.status === "cancelled") {
    return { allowed: false, reason: "enrollment_cancelled" };
  }

  if (sector.status === "inactive") {
    return { allowed: false, reason: "sector_inactive" };
  }

  const matchingEntitlements = entitlements.filter(
    (entitlement) =>
      sameScope(entitlement, scope) &&
      entitlement.accessGrantId === grant.id &&
      entitlement.sectorId === sector.id,
  );

  if (matchingEntitlements.some((entitlement) => entitlement.status === "active")) {
    return { allowed: true };
  }

  if (matchingEntitlements.some((entitlement) => entitlement.status === "revoked")) {
    return { allowed: false, reason: "entitlement_revoked" };
  }

  return { allowed: false, reason: "no_sector_entitlement" };
}

export function buildAccreditationSectorAccessAttempt(
  input: AccreditationSectorAccessAttemptInput,
  decision: AccreditationSectorAccessDecision,
  clock: () => string = nowIso,
): AccreditationSectorAccessAttempt {
  const timestamp = input.evaluatedAt ?? clock();
  const normalizedSource = normalizeAccreditationSectorAccessAttemptSource(input.source);

  if (decision.allowed && decision.reason) {
    throw new AccreditationSectorAccessValidationError("invalid_decision", "Allowed sector access attempts cannot include a denial reason.");
  }

  if (!decision.allowed && !decision.reason) {
    throw new AccreditationSectorAccessValidationError("invalid_decision", "Denied sector access attempts require a denial reason.");
  }

  return {
    ...input,
    id: createUuid(),
    source: normalizedSource,
    decision: decision.allowed ? "allow" : "deny",
    denialReason: decision.reason,
    evaluatedAt: timestamp,
    createdAt: timestamp,
  };
}

export function assertAccreditationAccessSectorScope(params: {
  scope: { organizationId: string; eventId: string };
  sector: Pick<AccreditationAccessSector, "organizationId" | "eventId"> | null | undefined;
}) {
  if (!params.sector) {
    throw new AccreditationSectorAccessValidationError("wrong_scope", "Accreditation access sector was not found.");
  }

  if (!sameScope(params.scope, params.sector)) {
    throw new AccreditationSectorAccessValidationError("wrong_scope", "Accreditation access sector belongs to another organization or event.");
  }
}
