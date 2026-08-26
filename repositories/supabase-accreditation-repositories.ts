import type {
  AccreditationCategory,
  AccreditationCategoryInput,
  AccreditationCategoryUpdateInput,
  AccreditationEnrollment,
  AccreditationEnrollmentInput,
  AccreditationEnrollmentUpdateInput,
  AccreditationListFilters,
  AccreditationRepositoryErrorPayload,
} from "@/features/accreditation/types";
import {
  buildAccreditationCategory,
  buildAccreditationEnrollment,
  cancelAccreditationEnrollment,
  updateAccreditationCategory,
  updateAccreditationEnrollment,
} from "@/features/accreditation/domain";
import {
  assertAccreditationEnrollmentScope,
  AccreditationValidationError,
  normalizeAccreditationStatus,
} from "@/features/accreditation/domain/accreditation-rules";
import {
  mapAccreditationCategoryRowToDomain,
  mapAccreditationCategoryToRow,
  mapAccreditationEnrollmentRowToDomain,
  mapAccreditationEnrollmentToRow,
} from "@/lib/supabase/accreditation-mappers";
import { mapEventRowToDomain, mapSectorRowToDomain } from "@/lib/supabase/mappers";
import type { AccreditationCategoryRow, AccreditationEnrollmentRow } from "@/features/accreditation/types";
import type { EventRow, SectorRow } from "@/lib/supabase/types";
import { nowIso } from "@/lib/supabase/helpers";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: AccreditationRepositoryErrorPayload | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseQueryResult<T>> & {
  select(columns?: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  in(column: string, values: readonly unknown[]): SupabaseQuery<T>;
  is(column: string, value: null): SupabaseQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery<T>;
  insert(values: unknown): SupabaseQuery<T>;
  update(values: unknown): SupabaseQuery<T>;
  upsert(values: unknown, options?: { onConflict?: string }): SupabaseQuery<T>;
  delete(): SupabaseQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
  single(): Promise<SupabaseQueryResult<T>>;
};

export type AccreditationSupabaseClient = {
  from<T = unknown>(table: string): SupabaseQuery<T>;
};

export type AccreditationRepositories = {
  enrollments: {
    create(input: AccreditationEnrollmentInput): Promise<AccreditationEnrollment>;
    update(id: string, patch: AccreditationEnrollmentUpdateInput): Promise<AccreditationEnrollment>;
    cancel(id: string): Promise<AccreditationEnrollment>;
    getById(id: string): Promise<AccreditationEnrollment | undefined>;
    list(filters: AccreditationListFilters): Promise<AccreditationEnrollment[]>;
  };
  categories: {
    create(input: AccreditationCategoryInput): Promise<AccreditationCategory>;
    update(id: string, patch: AccreditationCategoryUpdateInput): Promise<AccreditationCategory>;
    getById(id: string): Promise<AccreditationCategory | undefined>;
    list(filters: Pick<AccreditationListFilters, "organizationId" | "eventId">): Promise<AccreditationCategory[]>;
  };
};

function createNoopRepositories(): AccreditationRepositories {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  return {
    enrollments: {
      create: unavailable,
      update: unavailable,
      cancel: unavailable,
      getById: unavailable,
      list: unavailable,
    },
    categories: {
      create: unavailable,
      update: unavailable,
      getById: unavailable,
      list: unavailable,
    },
  };
}

async function unwrapSingle<T>(query: SupabaseQuery<T>): Promise<T | undefined> {
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? undefined;
}

async function unwrapMany<T>(query: SupabaseQuery<T[]>): Promise<T[]> {
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return Array.isArray(data) ? data : [data];
}

async function getEventById(client: AccreditationSupabaseClient, eventId: string) {
  const row = await unwrapSingle(client.from<EventRow>("events").select("*").eq("id", eventId).is("deleted_at", null));
  return row ? mapEventRowToDomain(row) : undefined;
}

async function getCategoryById(client: AccreditationSupabaseClient, categoryId: string) {
  const row = await unwrapSingle(client.from<AccreditationCategoryRow>("accreditation_categories").select("*").eq("id", categoryId).is("deleted_at", null));
  return row ? mapAccreditationCategoryRowToDomain(row) : undefined;
}

async function getSectorById(client: AccreditationSupabaseClient, sectorId: string) {
  const row = await unwrapSingle(client.from<SectorRow>("sectors").select("*").eq("id", sectorId).is("deleted_at", null));
  return row ? mapSectorRowToDomain(row) : undefined;
}

async function getEnrollmentById(client: AccreditationSupabaseClient, enrollmentId: string) {
  const row = await unwrapSingle(client.from<AccreditationEnrollmentRow>("accreditation_enrollments").select("*").eq("id", enrollmentId).is("deleted_at", null));
  return row ? mapAccreditationEnrollmentRowToDomain(row) : undefined;
}

async function validateEnrollmentContext(
  client: AccreditationSupabaseClient,
  input: Pick<AccreditationEnrollmentInput, "organizationId" | "eventId" | "categoryId" | "sectorId">,
) {
  const event = await getEventById(client, input.eventId);

  if (!event) {
    throw new AccreditationValidationError("event_mismatch", "Accreditation event was not found.");
  }

  const category = input.categoryId ? await getCategoryById(client, input.categoryId) : undefined;
  const sector = input.sectorId ? await getSectorById(client, input.sectorId) : undefined;

  assertAccreditationEnrollmentScope({
    organizationId: input.organizationId,
    eventId: input.eventId,
    event,
    category: category ? {
      organizationId: category.organizationId,
      eventId: category.eventId,
    } : undefined,
    sector: sector ? {
      id: sector.id,
      venueId: sector.venueId,
    } : undefined,
  });
}

async function validateCategoryContext(
  client: AccreditationSupabaseClient,
  input: Pick<AccreditationCategoryInput, "organizationId" | "eventId">,
) {
  const event = await getEventById(client, input.eventId);

  if (!event) {
    throw new AccreditationValidationError("event_mismatch", "Accreditation event was not found.");
  }

  if (event.organizationId !== input.organizationId) {
    throw new AccreditationValidationError("organization_mismatch", "Accreditation category belongs to another organization.");
  }
}

function resolveStatusFilter(status?: AccreditationListFilters["status"]) {
  if (!status) {
    return undefined;
  }

  return Array.isArray(status) ? status.map((item) => normalizeAccreditationStatus(item)) : [normalizeAccreditationStatus(status)];
}

export function createSupabaseAccreditationRepositories(client: AccreditationSupabaseClient | null): AccreditationRepositories {
  if (!client) {
    return createNoopRepositories();
  }

  return {
    enrollments: {
      async create(input) {
        await validateEnrollmentContext(client, input);
        const row = mapAccreditationEnrollmentToRow(buildAccreditationEnrollment(input));
        const { data, error } = await client.from<AccreditationEnrollmentRow>("accreditation_enrollments").insert(row).select("*").single();

        if (error) {
          throw error;
        }

        return mapAccreditationEnrollmentRowToDomain(data as AccreditationEnrollmentRow);
      },
      async update(id, patch) {
        const current = await getEnrollmentById(client, id);

        if (!current) {
          throw new Error("Accreditation enrollment not found.");
        }

        const next = updateAccreditationEnrollment(current, patch, nowIso);
        await validateEnrollmentContext(client, {
          organizationId: next.organizationId,
          eventId: next.eventId,
          categoryId: next.categoryId ?? null,
          sectorId: next.sectorId ?? null,
        });

        const { data, error } = await client
          .from<AccreditationEnrollmentRow>("accreditation_enrollments")
          .upsert(mapAccreditationEnrollmentToRow(next), { onConflict: "id" })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        return mapAccreditationEnrollmentRowToDomain(data as AccreditationEnrollmentRow);
      },
      async cancel(id) {
        const current = await getEnrollmentById(client, id);

        if (!current) {
          throw new Error("Accreditation enrollment not found.");
        }

        const next = cancelAccreditationEnrollment(current, nowIso);
        const { data, error } = await client
          .from<AccreditationEnrollmentRow>("accreditation_enrollments")
          .upsert(mapAccreditationEnrollmentToRow(next), { onConflict: "id" })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        return mapAccreditationEnrollmentRowToDomain(data as AccreditationEnrollmentRow);
      },
      async getById(id) {
        const row = await unwrapSingle(client.from<AccreditationEnrollmentRow>("accreditation_enrollments").select("*").eq("id", id).is("deleted_at", null));
        return row ? mapAccreditationEnrollmentRowToDomain(row) : undefined;
      },
      async list(filters) {
        const rows = await unwrapMany(client.from<AccreditationEnrollmentRow[]>("accreditation_enrollments")
          .select("*")
          .eq("organization_id", filters.organizationId)
          .eq("event_id", filters.eventId)
          .is("deleted_at", null));

        const status = resolveStatusFilter(filters.status);
        const scopedRows = rows.filter((row) => {
          if (status?.length && !status.includes(row.status)) {
            return false;
          }

          if (filters.categoryId && row.category_id !== filters.categoryId) {
            return false;
          }

          if (filters.sectorId && row.sector_id !== filters.sectorId) {
            return false;
          }

          return true;
        });

        return scopedRows.map((row) => mapAccreditationEnrollmentRowToDomain(row));
      },
    },
    categories: {
      async create(input) {
        await validateCategoryContext(client, input);
        const row = mapAccreditationCategoryToRow(buildAccreditationCategory(input));
        const { data, error } = await client.from<AccreditationCategoryRow>("accreditation_categories").insert(row).select("*").single();

        if (error) {
          throw error;
        }

        return mapAccreditationCategoryRowToDomain(data as AccreditationCategoryRow);
      },
      async update(id, patch) {
        const current = await unwrapSingle(client.from<AccreditationCategoryRow>("accreditation_categories").select("*").eq("id", id).is("deleted_at", null));

        if (!current) {
          throw new Error("Accreditation category not found.");
        }

        const currentDomain = mapAccreditationCategoryRowToDomain(current);
        const next = updateAccreditationCategory(currentDomain, patch, nowIso);
        await validateCategoryContext(client, {
          organizationId: next.organizationId,
          eventId: next.eventId,
        });

        const { data, error } = await client
          .from<AccreditationCategoryRow>("accreditation_categories")
          .upsert(mapAccreditationCategoryToRow(next), { onConflict: "id" })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        return mapAccreditationCategoryRowToDomain(data as AccreditationCategoryRow);
      },
      async getById(id) {
        const row = await unwrapSingle(client.from<AccreditationCategoryRow>("accreditation_categories").select("*").eq("id", id).is("deleted_at", null));
        return row ? mapAccreditationCategoryRowToDomain(row) : undefined;
      },
      async list(filters) {
        const { data, error } = await client
          .from<AccreditationCategoryRow[]>("accreditation_categories")
          .select("*")
          .eq("organization_id", filters.organizationId)
          .eq("event_id", filters.eventId)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true });

        if (error) {
          throw error;
        }

        return (Array.isArray(data) ? data : []).map((row) => mapAccreditationCategoryRowToDomain(row as AccreditationCategoryRow));
      },
    },
  };
}
