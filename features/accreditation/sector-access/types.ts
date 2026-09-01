import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type { Json } from "@/lib/supabase/types";

export type AccreditationAccessSectorStatus = "active" | "inactive";
export type AccreditationAccessEntitlementStatus = "active" | "revoked";

export type AccreditationSectorAccessScope = {
  organizationId: string;
  eventId: string;
};

export type AccreditationAccessSector = {
  id: string;
  organizationId: string;
  eventId: string;
  name: string;
  code: string;
  description?: string;
  status: AccreditationAccessSectorStatus;
  capacity?: number;
  sortOrder: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AccreditationAccessSectorInput = {
  organizationId: string;
  eventId: string;
  name: string;
  code: string;
  description?: string | null;
  status?: AccreditationAccessSectorStatus;
  capacity?: number | null;
  sortOrder?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationAccessSectorUpdateInput = {
  name?: string;
  code?: string;
  description?: string | null;
  status?: AccreditationAccessSectorStatus;
  capacity?: number | null;
  sortOrder?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationAccessEntitlement = {
  id: string;
  organizationId: string;
  eventId: string;
  accessGrantId: string;
  sectorId: string;
  status: AccreditationAccessEntitlementStatus;
  issuedAt: string;
  revokedAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AccreditationAccessEntitlementInput = {
  organizationId: string;
  eventId: string;
  accessGrantId: string;
  sectorId: string;
  status?: AccreditationAccessEntitlementStatus;
  issuedAt?: string | null;
  revokedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationAccessEntitlementUpdateInput = {
  status?: AccreditationAccessEntitlementStatus;
  revokedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationAccessSectorRow = {
  id: string;
  organization_id: string;
  event_id: string;
  name: string;
  code: string;
  description: string | null;
  status: AccreditationAccessSectorStatus;
  capacity: number | null;
  sort_order: number;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AccreditationAccessEntitlementRow = {
  id: string;
  organization_id: string;
  event_id: string;
  access_grant_id: string;
  sector_id: string;
  status: AccreditationAccessEntitlementStatus;
  issued_at: string;
  revoked_at: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

export type AccreditationSectorAccessValidationErrorCode =
  | "invalid_status"
  | "invalid_name"
  | "invalid_code"
  | "invalid_capacity"
  | "organization_mismatch"
  | "event_mismatch"
  | "wrong_scope"
  | "grant_not_found"
  | "grant_revoked"
  | "enrollment_cancelled"
  | "sector_not_found"
  | "sector_inactive"
  | "no_sector_entitlement"
  | "entitlement_revoked";

export type AccreditationSectorAccessDecisionReason =
  | "grant_not_found"
  | "wrong_scope"
  | "grant_revoked"
  | "enrollment_cancelled"
  | "sector_not_found"
  | "sector_inactive"
  | "no_sector_entitlement"
  | "entitlement_revoked";

export type AccreditationSectorAccessDecision = {
  allowed: boolean;
  reason?: AccreditationSectorAccessDecisionReason;
};

export type AccreditationAccessSectorRepository = {
  create(input: AccreditationAccessSectorInput): Promise<AccreditationAccessSector>;
  update(id: string, patch: AccreditationAccessSectorUpdateInput): Promise<AccreditationAccessSector>;
  deactivate(id: string): Promise<AccreditationAccessSector>;
  getById(id: string): Promise<AccreditationAccessSector | undefined>;
  listByEvent(scope: AccreditationSectorAccessScope): Promise<AccreditationAccessSector[]>;
};

export type AccreditationAccessEntitlementRepository = {
  assign(input: AccreditationAccessEntitlementInput): Promise<AccreditationAccessEntitlement>;
  revoke(id: string): Promise<AccreditationAccessEntitlement>;
  getById(id: string): Promise<AccreditationAccessEntitlement | undefined>;
  listByGrant(scope: AccreditationSectorAccessScope, accessGrantId: string): Promise<AccreditationAccessEntitlement[]>;
  listByEvent(scope: AccreditationSectorAccessScope): Promise<AccreditationAccessEntitlement[]>;
  resolveActiveByGrantAndSector(
    scope: AccreditationSectorAccessScope,
    accessGrantId: string,
    sectorId: string,
  ): Promise<AccreditationAccessEntitlement | undefined>;
};

export type AccreditationSectorAccessRepositories = {
  sectors: AccreditationAccessSectorRepository;
  entitlements: AccreditationAccessEntitlementRepository;
};

export type AccreditationSectorAccessDecisionInput = {
  scope: AccreditationSectorAccessScope;
  grant?: Pick<AccreditationAccessGrant, "id" | "organizationId" | "eventId" | "status" | "enrollmentId"> | null;
  enrollment?: Pick<AccreditationEnrollment, "id" | "organizationId" | "eventId" | "status"> | null;
  sector?: Pick<AccreditationAccessSector, "id" | "organizationId" | "eventId" | "status"> | null;
  entitlements?: Pick<
    AccreditationAccessEntitlement,
    "accessGrantId" | "sectorId" | "status" | "organizationId" | "eventId"
  >[];
};
