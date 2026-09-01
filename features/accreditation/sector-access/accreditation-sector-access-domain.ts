import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type {
  AccreditationAccessEntitlement,
  AccreditationAccessEntitlementInput,
  AccreditationAccessSector,
  AccreditationAccessSectorInput,
  AccreditationSectorAccessDecision,
  AccreditationSectorAccessDecisionInput,
} from "./types";
import {
  assertAccreditationAccessSectorScope,
  buildAccreditationAccessEntitlement,
  buildAccreditationAccessSector,
  deactivateAccreditationAccessSector,
  evaluateAccreditationSectorAccess,
  revokeAccreditationAccessEntitlement,
  updateAccreditationAccessSector,
} from "./accreditation-sector-access-rules";

export function buildAccreditationAccessSectorRecord(input: AccreditationAccessSectorInput) {
  return buildAccreditationAccessSector(input);
}

export function updateAccreditationAccessSectorRecord(
  current: AccreditationAccessSector,
  patch: Partial<AccreditationAccessSectorInput>,
) {
  return updateAccreditationAccessSector(current, patch);
}

export function deactivateAccreditationAccessSectorRecord(current: AccreditationAccessSector) {
  return deactivateAccreditationAccessSector(current);
}

export function buildAccreditationAccessEntitlementRecord(input: AccreditationAccessEntitlementInput) {
  return buildAccreditationAccessEntitlement(input);
}

export function revokeAccreditationAccessEntitlementRecord(current: AccreditationAccessEntitlement) {
  return revokeAccreditationAccessEntitlement(current);
}

export function evaluateAccreditationAccessSectorDecision(
  input: AccreditationSectorAccessDecisionInput,
): AccreditationSectorAccessDecision {
  return evaluateAccreditationSectorAccess(input);
}

export function assertAccreditationAccessSectorBelongsToScope(params: {
  scope: { organizationId: string; eventId: string };
  sector: Pick<AccreditationAccessSector, "organizationId" | "eventId"> | null | undefined;
}) {
  assertAccreditationAccessSectorScope(params);
}

export type AccreditationSectorAccessDomainDependencies = {
  grants?: {
    getByEnrollment(enrollmentId: string): Promise<AccreditationAccessGrant | undefined>;
  };
  enrollments?: {
    getById(enrollmentId: string): Promise<AccreditationEnrollment | undefined>;
  };
};
