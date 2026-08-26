import type { Json } from "@/lib/supabase/types";
import type { AccreditationCheckIn, AccreditationCheckInRow } from "@/features/accreditation/check-in/types";

function toMetadata(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toJson(value?: Record<string, unknown> | null) {
  return value ? (value as Json) : null;
}

export function mapAccreditationCheckInRowToDomain(row: AccreditationCheckInRow): AccreditationCheckIn {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    enrollmentId: row.enrollment_id,
    accessGrantId: row.access_grant_id,
    operatorProfileId: row.operator_profile_id,
    source: row.source,
    checkedInAt: row.checked_in_at,
    metadata: toMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAccreditationCheckInToRow(checkIn: AccreditationCheckIn): AccreditationCheckInRow {
  return {
    id: checkIn.id,
    organization_id: checkIn.organizationId,
    event_id: checkIn.eventId,
    enrollment_id: checkIn.enrollmentId,
    access_grant_id: checkIn.accessGrantId,
    operator_profile_id: checkIn.operatorProfileId,
    source: checkIn.source,
    checked_in_at: checkIn.checkedInAt,
    metadata: toJson(checkIn.metadata),
    created_at: checkIn.createdAt,
    updated_at: checkIn.updatedAt,
  };
}
