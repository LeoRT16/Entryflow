import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type { Json } from "@/lib/supabase/types";

export type AccreditationAccessScope = {
  organizationId: string;
  eventId: string;
};

export type AccreditationAccessGrantStatus = "active" | "revoked";

export type AccreditationAccessInvalidReason =
  | "not_found"
  | "wrong_scope"
  | "revoked"
  | "enrollment_cancelled";

export type AccreditationAccessGrant = {
  id: string;
  organizationId: string;
  eventId: string;
  enrollmentId: string;
  accessCode: string;
  qrToken: string;
  status: AccreditationAccessGrantStatus;
  issuedAt: string;
  updatedAt: string;
  revokedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type AccreditationAccessGrantInput = {
  id?: string;
  organizationId: string;
  eventId: string;
  enrollmentId: string;
  accessCode: string;
  qrToken: string;
  status?: AccreditationAccessGrantStatus;
  issuedAt?: string;
  updatedAt?: string;
  revokedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationAccessGrantRow = {
  id: string;
  organization_id: string;
  event_id: string;
  enrollment_id: string;
  access_code: string;
  qr_token: string;
  status: AccreditationAccessGrantStatus;
  issued_at: string;
  updated_at: string;
  revoked_at: string | null;
  metadata: Json | null;
};

export type AccreditationAccessEvaluation = {
  isValid: boolean;
  invalidReason?: AccreditationAccessInvalidReason;
};

export type AccreditationAccessDto = {
  grantId: string;
  enrollmentId: string;
  organizationId: string;
  eventId: string;
  displayName: string;
  accessCode: string;
  qrToken: string;
  isValid: boolean;
  invalidReason?: AccreditationAccessInvalidReason;
};

export type AccreditationAccessRepository = {
  create(grant: AccreditationAccessGrant): Promise<AccreditationAccessGrant>;
  issue?(grant: AccreditationAccessGrant): Promise<AccreditationAccessGrant>;
  getById(scope: AccreditationAccessScope, grantId: string): Promise<AccreditationAccessGrant | undefined>;
  getByEnrollment(scope: AccreditationAccessScope, enrollmentId: string): Promise<AccreditationAccessGrant | undefined>;
  resolveByAccessCode(scope: AccreditationAccessScope, accessCode: string): Promise<AccreditationAccessGrant | undefined>;
  resolveByQrToken(scope: AccreditationAccessScope, qrToken: string): Promise<AccreditationAccessGrant | undefined>;
  revoke(scope: AccreditationAccessScope, grantId: string): Promise<AccreditationAccessGrant>;
  list(scope: AccreditationAccessScope): Promise<AccreditationAccessGrant[]>;
};

export type AccreditationAccessDomainDependencies = {
  enrollments: {
    getById(enrollmentId: string): Promise<AccreditationEnrollment | undefined>;
  };
  accessGrants: AccreditationAccessRepository;
  clock?: () => string;
  generateAccessCode?: () => string;
  generateQrToken?: () => string;
};
