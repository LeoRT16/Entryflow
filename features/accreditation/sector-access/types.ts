import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type { Json } from "@/lib/supabase/types";

export type AccreditationAccessSectorStatus = "active" | "inactive";
export type AccreditationAccessEntitlementStatus = "active" | "revoked";
export type AccreditationSectorAccessAttemptSource = "qr" | "manual_code" | "manual_operator";
export type AccreditationSectorAccessAttemptDecision = "allow" | "deny";
export type AccreditationSectorMovementType = "entry" | "exit";
export type AccreditationAccessCheckpointStatus = "active" | "inactive";

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

export type AccreditationAccessCheckpoint = {
  id: string;
  organizationId: string;
  eventId: string;
  sectorId: string;
  name: string;
  code?: string;
  status: AccreditationAccessCheckpointStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AccreditationAccessCheckpointRow = {
  id: string;
  organization_id: string;
  event_id: string;
  sector_id: string;
  name: string;
  code: string | null;
  status: AccreditationAccessCheckpointStatus;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AccreditationAccessCheckpointInput = {
  organizationId: string;
  eventId: string;
  sectorId: string;
  name: string;
  code?: string | null;
  status?: AccreditationAccessCheckpointStatus;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationAccessCheckpointUpdateInput = Partial<Omit<AccreditationAccessCheckpointInput, "organizationId" | "eventId" | "sectorId">>;

export type AccreditationSectorAccessValidationErrorCode =
  | "invalid_source"
  | "invalid_decision"
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
  | "entitlement_revoked"
  | "checkpoint_inactive";

export type AccreditationSectorAccessDecisionReason =
  | "grant_not_found"
  | "wrong_scope"
  | "grant_revoked"
  | "enrollment_cancelled"
  | "sector_not_found"
  | "sector_inactive"
  | "no_sector_entitlement"
  | "entitlement_revoked"
  | "checkpoint_inactive";

export type AccreditationSectorAccessDecision = {
  allowed: boolean;
  reason?: AccreditationSectorAccessDecisionReason;
};

export type AccreditationSectorAccessAttempt = {
  id: string;
  organizationId: string;
  eventId: string;
  accessGrantId?: string | null;
  enrollmentId?: string | null;
  sectorId?: string | null;
  checkpointId?: string | null;
  operatorProfileId: string;
  source: AccreditationSectorAccessAttemptSource;
  credentialReference: string;
  sectorReference: string;
  decision: AccreditationSectorAccessAttemptDecision;
  denialReason?: AccreditationSectorAccessDecisionReason;
  evaluatedAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AccreditationSectorAccessAttemptInput = Omit<
  AccreditationSectorAccessAttempt,
  "id" | "evaluatedAt" | "createdAt"
> & {
  evaluatedAt?: string;
};

export type AccreditationSectorAccessAttemptRow = {
  id: string;
  organization_id: string;
  event_id: string;
  access_grant_id: string | null;
  enrollment_id: string | null;
  sector_id: string | null;
  checkpoint_id?: string | null;
  operator_profile_id: string;
  source: AccreditationSectorAccessAttemptSource;
  credential_reference: string;
  sector_reference: string;
  decision: AccreditationSectorAccessAttemptDecision;
  denial_reason: AccreditationSectorAccessDecisionReason | null;
  evaluated_at: string;
  metadata: Json | null;
  created_at: string;
};

export type AccreditationSectorMovement = {
  id: string;
  organizationId: string;
  eventId: string;
  accessGrantId: string;
  enrollmentId: string;
  sectorId: string;
  checkpointId?: string | null;
  operatorProfileId: string;
  movement: AccreditationSectorMovementType;
  source: AccreditationSectorAccessAttemptSource;
  evaluationAttemptId?: string | null;
  credentialReference: string;
  sectorReference: string;
  movedAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AccreditationSectorMovementRow = {
  id: string;
  organization_id: string;
  event_id: string;
  access_grant_id: string;
  enrollment_id: string;
  sector_id: string;
  checkpoint_id?: string | null;
  operator_profile_id: string;
  movement: AccreditationSectorMovementType;
  source: AccreditationSectorAccessAttemptSource;
  evaluation_attempt_id: string | null;
  credential_reference: string;
  sector_reference: string;
  moved_at: string;
  metadata: Json | null;
  created_at: string;
};

export type AccreditationSectorPresence = {
  organizationId: string;
  eventId: string;
  accessGrantId: string;
  sectorId: string;
  inside: boolean;
  latestMovement?: AccreditationSectorMovement;
};

export type AccreditationSectorMovementInput = {
  organizationId: string;
  eventId: string;
  accessGrantId?: string | null;
  enrollmentId?: string | null;
  sectorId?: string | null;
  checkpointId?: string | null;
  operatorProfileId: string;
  movement: AccreditationSectorMovementType;
  source: AccreditationSectorAccessAttemptSource;
  evaluationAttemptId?: string | null;
  credentialReference: string;
  sectorReference: string;
};

export type AccreditationSectorMovementResult = {
  status: "recorded" | "already_inside" | "already_outside" | "denied";
  inside: boolean;
  movement?: AccreditationSectorMovement;
  decision?: AccreditationSectorAccessDecision;
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
  checkpoints: AccreditationAccessCheckpointRepository;
  sectors: AccreditationAccessSectorRepository;
  entitlements: AccreditationAccessEntitlementRepository;
  attempts: AccreditationSectorAccessAttemptRepository;
  movements: AccreditationSectorMovementRepository;
};

export type AccreditationAccessCheckpointRepository = {
  create(input: AccreditationAccessCheckpointInput): Promise<AccreditationAccessCheckpoint>;
  update(id: string, patch: AccreditationAccessCheckpointUpdateInput): Promise<AccreditationAccessCheckpoint>;
  deactivate(id: string): Promise<AccreditationAccessCheckpoint>;
  getById(id: string): Promise<AccreditationAccessCheckpoint | undefined>;
  listByEvent(scope: AccreditationSectorAccessScope): Promise<AccreditationAccessCheckpoint[]>;
};

export type AccreditationSectorAccessAttemptRepository = {
  append(input: AccreditationSectorAccessAttemptInput): Promise<AccreditationSectorAccessAttempt>;
  listByEvent(scope: AccreditationSectorAccessScope): Promise<AccreditationSectorAccessAttempt[]>;
};

export type AccreditationSectorMovementRepository = {
  record(input: AccreditationSectorMovementInput): Promise<AccreditationSectorMovementResult>;
  listByEvent(scope: AccreditationSectorAccessScope): Promise<AccreditationSectorMovement[]>;
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
