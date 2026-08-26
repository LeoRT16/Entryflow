import type { AccreditationCategory, AccreditationEnrollment } from "@/features/accreditation/types";
import type { Json } from "@/lib/supabase/types";
import type { AccreditationCategoryRow, AccreditationEnrollmentRow } from "@/features/accreditation/types";

function toMetadata(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toJson(value?: Record<string, unknown> | null) {
  return value ? (value as Json) : null;
}

export function mapAccreditationEnrollmentRowToDomain(row: AccreditationEnrollmentRow): AccreditationEnrollment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    categoryId: row.category_id ?? undefined,
    sectorId: row.sector_id ?? undefined,
    status: row.status,
    metadata: toMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapAccreditationEnrollmentToRow(
  enrollment: AccreditationEnrollment,
): Omit<AccreditationEnrollmentRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: enrollment.id,
    organization_id: enrollment.organizationId,
    event_id: enrollment.eventId,
    category_id: enrollment.categoryId ?? null,
    sector_id: enrollment.sectorId ?? null,
    name: enrollment.name,
    email: enrollment.email ?? null,
    phone: enrollment.phone ?? null,
    status: enrollment.status,
    metadata: toJson(enrollment.metadata),
  };
}

export function mapAccreditationCategoryRowToDomain(row: AccreditationCategoryRow): AccreditationCategory {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    metadata: toMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapAccreditationCategoryToRow(
  category: AccreditationCategory,
): Omit<AccreditationCategoryRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: category.id,
    organization_id: category.organizationId,
    event_id: category.eventId,
    slug: category.slug,
    name: category.name,
    description: category.description ?? null,
    color: category.color ?? null,
    sort_order: category.sortOrder,
    is_active: category.isActive,
    metadata: toJson(category.metadata),
  };
}
