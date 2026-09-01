import type { Json } from "@/lib/supabase/types";
import type {
  AccreditationAccessEntitlement,
  AccreditationAccessEntitlementRow,
  AccreditationAccessSector,
  AccreditationAccessSectorRow,
} from "@/features/accreditation/sector-access";

function toMetadata(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toJson(value?: Record<string, unknown> | null) {
  return value ? (value as Json) : null;
}

export function mapAccreditationAccessSectorRowToDomain(row: AccreditationAccessSectorRow): AccreditationAccessSector {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    name: row.name,
    code: row.code,
    description: row.description ?? undefined,
    status: row.status,
    capacity: row.capacity ?? undefined,
    sortOrder: row.sort_order,
    metadata: toMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapAccreditationAccessSectorToRow(
  sector: AccreditationAccessSector,
): Omit<AccreditationAccessSectorRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: sector.id,
    organization_id: sector.organizationId,
    event_id: sector.eventId,
    name: sector.name,
    code: sector.code,
    description: sector.description ?? null,
    status: sector.status,
    capacity: sector.capacity ?? null,
    sort_order: sector.sortOrder,
    metadata: toJson(sector.metadata),
  };
}

export function mapAccreditationAccessEntitlementRowToDomain(row: AccreditationAccessEntitlementRow): AccreditationAccessEntitlement {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    accessGrantId: row.access_grant_id,
    sectorId: row.sector_id,
    status: row.status,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
    metadata: toMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAccreditationAccessEntitlementToRow(
  entitlement: AccreditationAccessEntitlement,
): Omit<AccreditationAccessEntitlementRow, "created_at" | "updated_at"> {
  return {
    id: entitlement.id,
    organization_id: entitlement.organizationId,
    event_id: entitlement.eventId,
    access_grant_id: entitlement.accessGrantId,
    sector_id: entitlement.sectorId,
    status: entitlement.status,
    issued_at: entitlement.issuedAt,
    revoked_at: entitlement.revokedAt ?? null,
    metadata: toJson(entitlement.metadata),
  };
}
