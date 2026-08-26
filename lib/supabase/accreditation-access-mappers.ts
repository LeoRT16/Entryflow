import type { Json } from "@/lib/supabase/types";
import type {
  AccreditationAccessGrant,
  AccreditationAccessGrantRow,
} from "@/features/accreditation/access";

function toMetadata(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toJson(value?: Record<string, unknown> | null) {
  return value ? (value as Json) : null;
}

export function mapAccreditationAccessGrantRowToDomain(row: AccreditationAccessGrantRow): AccreditationAccessGrant {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    enrollmentId: row.enrollment_id,
    accessCode: row.access_code,
    qrToken: row.qr_token,
    status: row.status,
    issuedAt: row.issued_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at ?? undefined,
    metadata: toMetadata(row.metadata),
  };
}

export function mapAccreditationAccessGrantToRow(
  grant: AccreditationAccessGrant,
): AccreditationAccessGrantRow {
  return {
    id: grant.id,
    organization_id: grant.organizationId,
    event_id: grant.eventId,
    enrollment_id: grant.enrollmentId,
    access_code: grant.accessCode,
    qr_token: grant.qrToken,
    status: grant.status,
    issued_at: grant.issuedAt,
    updated_at: grant.updatedAt,
    revoked_at: grant.revokedAt ?? null,
    metadata: toJson(grant.metadata),
  };
}
