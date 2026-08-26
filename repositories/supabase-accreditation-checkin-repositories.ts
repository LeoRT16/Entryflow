import type {
  AccreditationCheckIn,
  AccreditationCheckInRepository,
  AccreditationCheckInRow,
  AccreditationCheckInScope,
} from "@/features/accreditation/check-in/types";
import { AccreditationCheckInAlreadyConsumedError } from "@/features/accreditation/check-in/errors";
import { mapAccreditationCheckInRowToDomain, mapAccreditationCheckInToRow } from "@/lib/supabase/accreditation-checkin-mappers";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { code?: string; message?: string; constraint?: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseQueryResult<T>> & {
  select(columns?: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery<T>;
  insert(values: unknown): SupabaseQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
  single(): Promise<SupabaseQueryResult<T>>;
};

export type AccreditationCheckInSupabaseClient = {
  from<T = unknown>(table: string): SupabaseQuery<T>;
};

function createNoopRepositories(): AccreditationCheckInRepository {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  return {
    create: unavailable,
    getByAccessGrant: unavailable,
    getByEnrollment: unavailable,
    listByEvent: unavailable,
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

function buildQueryScope<T>(query: SupabaseQuery<T>, scope: AccreditationCheckInScope) {
  return query.eq("organization_id", scope.organizationId).eq("event_id", scope.eventId);
}

function isUniqueViolation(error: unknown, constraintNames: ReadonlySet<string>) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; constraint?: unknown; message?: unknown };

  if (maybeError.code !== "23505") {
    return false;
  }

  if (typeof maybeError.constraint === "string" && constraintNames.has(maybeError.constraint)) {
    return true;
  }

  const message = typeof maybeError.message === "string" ? maybeError.message : "";

  return [...constraintNames].some((constraint) => message.includes(constraint));
}

const accessGrantUniqueConstraints = new Set(["accreditation_checkins_access_grant_unique"]);

export function isAccreditationCheckInUniqueViolation(error: unknown) {
  return isUniqueViolation(error, accessGrantUniqueConstraints);
}

export function createSupabaseAccreditationCheckInRepositories(
  client: AccreditationCheckInSupabaseClient | null,
): AccreditationCheckInRepository {
  if (!client) {
    return createNoopRepositories();
  }

  const safeClient = client;

  async function create(checkIn: AccreditationCheckIn) {
    const row = mapAccreditationCheckInToRow(checkIn);

    try {
      const { data, error } = await safeClient
        .from<AccreditationCheckInRow>("accreditation_checkins")
        .insert(row)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationCheckInRowToDomain(data as AccreditationCheckInRow);
    } catch (error) {
      if (isAccreditationCheckInUniqueViolation(error)) {
        throw new AccreditationCheckInAlreadyConsumedError();
      }

      throw error;
    }
  }

  return {
    create,
    async getByAccessGrant(scope, accessGrantId) {
      const row = await unwrapSingle(
        buildQueryScope(
          safeClient.from<AccreditationCheckInRow>("accreditation_checkins").select("*").eq("access_grant_id", accessGrantId),
          scope,
        ),
      );

      return row ? mapAccreditationCheckInRowToDomain(row) : undefined;
    },
    async getByEnrollment(scope, enrollmentId) {
      const row = await unwrapSingle(
        buildQueryScope(
          safeClient.from<AccreditationCheckInRow>("accreditation_checkins").select("*").eq("enrollment_id", enrollmentId),
          scope,
        ),
      );

      return row ? mapAccreditationCheckInRowToDomain(row) : undefined;
    },
    async listByEvent(scope) {
      const rows = await unwrapMany(
        buildQueryScope(
          safeClient
            .from<AccreditationCheckInRow[]>("accreditation_checkins")
            .select("*")
            .order("checked_in_at", { ascending: false }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationCheckInRowToDomain(row as AccreditationCheckInRow));
    },
  };
}
