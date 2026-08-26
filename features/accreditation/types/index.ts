import type { Event, Sector } from "@/features/domain/types";
import type { Json } from "@/lib/supabase/types";

export type AccreditationStatus = "active" | "cancelled";

export type AccreditationEnrollment = {
  id: string;
  organizationId: string;
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  categoryId?: string;
  sectorId?: string;
  status: AccreditationStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AccreditationCategory = {
  id: string;
  organizationId: string;
  eventId: string;
  slug: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AccreditationEnrollmentInput = {
  organizationId: string;
  eventId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  categoryId?: string | null;
  sectorId?: string | null;
  status?: AccreditationStatus;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationEnrollmentUpdateInput = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  categoryId?: string | null;
  sectorId?: string | null;
  status?: AccreditationStatus;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationCategoryInput = {
  organizationId: string;
  eventId: string;
  slug: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  isActive?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationCategoryUpdateInput = {
  slug?: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  isActive?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationValidationContext = {
  organizationId: string;
  eventId: string;
  event: Pick<Event, "id" | "organizationId" | "venueId"> | null;
  category?: Pick<AccreditationCategory, "organizationId" | "eventId"> | null;
  sector?: Pick<Sector, "id" | "venueId"> | null;
};

export type AccreditationListFilters = {
  organizationId: string;
  eventId: string;
  status?: AccreditationStatus | AccreditationStatus[];
  categoryId?: string;
  sectorId?: string;
};

export type AccreditationRepositoryErrorPayload = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  constraint?: string;
};

export type AccreditationRowBase = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AccreditationCategoryRow = AccreditationRowBase & {
  organization_id: string;
  event_id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Json | null;
};

export type AccreditationEnrollmentRow = AccreditationRowBase & {
  organization_id: string;
  event_id: string;
  category_id: string | null;
  sector_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  status: AccreditationStatus;
  metadata: Json | null;
};
