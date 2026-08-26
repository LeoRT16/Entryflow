import { createUuid, nowIso } from "@/lib/supabase/helpers";
import type {
  AccreditationCategory,
  AccreditationCategoryInput,
  AccreditationCategoryUpdateInput,
  AccreditationEnrollment,
  AccreditationEnrollmentInput,
  AccreditationEnrollmentUpdateInput,
  AccreditationStatus,
} from "@/features/accreditation/types";
import {
  normalizeAccreditationCategorySlug,
  normalizeAccreditationEnrollmentEmail,
  normalizeAccreditationEnrollmentName,
  normalizeAccreditationEnrollmentPhone,
  normalizeAccreditationMetadata,
  normalizeAccreditationStatus,
} from "./accreditation-rules";

type Clock = () => string;

function defaultClock() {
  return nowIso();
}

function buildEnrollmentBase(
  input: AccreditationEnrollmentInput | AccreditationEnrollment,
  clock: Clock,
  status: AccreditationStatus,
): AccreditationEnrollment {
  const timestamp = clock();

  return {
    id: "id" in input && input.id ? input.id : createUuid(),
    organizationId: input.organizationId,
    eventId: input.eventId,
    name: normalizeAccreditationEnrollmentName(input.name),
    email: normalizeAccreditationEnrollmentEmail(input.email ?? undefined),
    phone: normalizeAccreditationEnrollmentPhone(input.phone ?? undefined),
    categoryId: input.categoryId ?? undefined,
    sectorId: input.sectorId ?? undefined,
    status,
    metadata: normalizeAccreditationMetadata(input.metadata ?? undefined),
    createdAt: "createdAt" in input && input.createdAt ? input.createdAt : timestamp,
    updatedAt: timestamp,
    deletedAt: "deletedAt" in input ? input.deletedAt ?? null : null,
  };
}

export function buildAccreditationEnrollment(input: AccreditationEnrollmentInput, clock: Clock = defaultClock) {
  return buildEnrollmentBase(
    {
      ...input,
      status: normalizeAccreditationStatus(input.status ?? "active"),
    },
    clock,
    normalizeAccreditationStatus(input.status ?? "active"),
  );
}

export function updateAccreditationEnrollment(
  current: AccreditationEnrollment,
  patch: AccreditationEnrollmentUpdateInput,
  clock: Clock = defaultClock,
) {
  const timestamp = clock();
  const nextStatus = normalizeAccreditationStatus(patch.status ?? current.status);

  return {
    ...current,
    name: patch.name !== undefined ? normalizeAccreditationEnrollmentName(patch.name) : current.name,
    email: patch.email !== undefined ? normalizeAccreditationEnrollmentEmail(patch.email) : current.email,
    phone: patch.phone !== undefined ? normalizeAccreditationEnrollmentPhone(patch.phone) : current.phone,
    categoryId: patch.categoryId !== undefined ? patch.categoryId ?? undefined : current.categoryId,
    sectorId: patch.sectorId !== undefined ? patch.sectorId ?? undefined : current.sectorId,
    status: nextStatus,
    metadata: patch.metadata !== undefined ? normalizeAccreditationMetadata(patch.metadata) : current.metadata,
    updatedAt: timestamp,
  };
}

export function cancelAccreditationEnrollment(current: AccreditationEnrollment, clock: Clock = defaultClock) {
  return {
    ...current,
    status: "cancelled" as const,
    updatedAt: clock(),
  };
}

export function buildAccreditationCategory(input: AccreditationCategoryInput, clock: Clock = defaultClock): AccreditationCategory {
  const timestamp = clock();

  return {
    id: createUuid(),
    organizationId: input.organizationId,
    eventId: input.eventId,
    slug: normalizeAccreditationCategorySlug(input.slug),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    color: input.color?.trim() || undefined,
    sortOrder: Number.isFinite(input.sortOrder ?? 0) ? Number(input.sortOrder ?? 0) : 0,
    isActive: input.isActive ?? true,
    metadata: normalizeAccreditationMetadata(input.metadata ?? undefined),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

export function updateAccreditationCategory(
  current: AccreditationCategory,
  patch: AccreditationCategoryUpdateInput,
  clock: Clock = defaultClock,
) {
  const timestamp = clock();

  return {
    ...current,
    slug: patch.slug !== undefined ? normalizeAccreditationCategorySlug(patch.slug) : current.slug,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    description: patch.description !== undefined ? patch.description?.trim() || undefined : current.description,
    color: patch.color !== undefined ? patch.color?.trim() || undefined : current.color,
    sortOrder: patch.sortOrder !== undefined ? (Number.isFinite(patch.sortOrder) ? Number(patch.sortOrder) : current.sortOrder) : current.sortOrder,
    isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    metadata: patch.metadata !== undefined ? normalizeAccreditationMetadata(patch.metadata) : current.metadata,
    updatedAt: timestamp,
  };
}
