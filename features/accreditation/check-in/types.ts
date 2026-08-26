import type { AccreditationAccessRepository, AccreditationAccessScope } from "@/features/accreditation/access";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type { Json } from "@/lib/supabase/types";

export type AccreditationCheckInSource = "qr" | "manual_code";

export type AccreditationCheckInInvalidReason =
  | "grant_not_found"
  | "wrong_scope"
  | "grant_revoked"
  | "enrollment_cancelled"
  | "already_checked_in";

export type AccreditationCheckInScope = AccreditationAccessScope;

export type AccreditationCheckIn = {
  id: string;
  organizationId: string;
  eventId: string;
  enrollmentId: string;
  accessGrantId: string;
  operatorProfileId: string;
  source: AccreditationCheckInSource;
  checkedInAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AccreditationCheckInInput = {
  id?: string;
  organizationId: string;
  eventId: string;
  enrollmentId: string;
  accessGrantId: string;
  operatorProfileId: string;
  source: AccreditationCheckInSource;
  checkedInAt?: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AccreditationCheckInRow = {
  id: string;
  organization_id: string;
  event_id: string;
  enrollment_id: string;
  access_grant_id: string;
  operator_profile_id: string;
  source: AccreditationCheckInSource;
  checked_in_at: string;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

export type AccreditationCheckInEvaluation = {
  isValid: boolean;
  invalidReason?: AccreditationCheckInInvalidReason;
};

export type AccreditationCheckInRepository = {
  create(checkIn: AccreditationCheckIn): Promise<AccreditationCheckIn>;
  getByAccessGrant(scope: AccreditationCheckInScope, accessGrantId: string): Promise<AccreditationCheckIn | undefined>;
  getByEnrollment(scope: AccreditationCheckInScope, enrollmentId: string): Promise<AccreditationCheckIn | undefined>;
  listByEvent(scope: AccreditationCheckInScope): Promise<AccreditationCheckIn[]>;
};

export type AccreditationCheckInCredential =
  | {
      source: "qr";
      qrToken: string;
    }
  | {
      source: "manual_code";
      accessCode: string;
    };

export type AccreditationCheckInDependencies = {
  enrollments: {
    getById(enrollmentId: string): Promise<AccreditationEnrollment | undefined>;
  };
  accessGrants: AccreditationAccessRepository;
  checkIns: AccreditationCheckInRepository;
  clock?: () => string;
};
