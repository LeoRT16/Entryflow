import type { AccreditationAccessGrant, AccreditationAccessGrantRow, AccreditationAccessRepository, AccreditationAccessScope } from "@/features/accreditation/access";
import {
  normalizeAccreditationAccessCode,
  normalizeAccreditationQrToken,
} from "@/features/accreditation/access";
import {
  mapAccreditationAccessGrantRowToDomain,
  mapAccreditationAccessGrantToRow,
} from "@/lib/supabase/accreditation-access-mappers";
import { nowIso } from "@/lib/supabase/helpers";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { code?: string; message?: string; constraint?: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseQueryResult<T>> & {
  select(columns?: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery<T>;
  insert(values: unknown): SupabaseQuery<T>;
  update(values: unknown): SupabaseQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
  single(): Promise<SupabaseQueryResult<T>>;
};

export type AccreditationAccessSupabaseClient = {
  from<T = unknown>(table: string): SupabaseQuery<T>;
};

function createNoopRepositories(): AccreditationAccessRepository {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  return {
    create: unavailable,
    issue: unavailable,
    getById: unavailable,
    getByEnrollment: unavailable,
    resolveByAccessCode: unavailable,
    resolveByQrToken: unavailable,
    revoke: unavailable,
    list: unavailable,
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

function buildQueryScope<T>(query: SupabaseQuery<T>, scope: AccreditationAccessScope) {
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

const enrollmentUniqueConstraints = new Set(["accreditation_access_grants_organization_event_enrollment_unique"]);
const accessCodeUniqueConstraints = new Set(["accreditation_access_grants_organization_event_access_code_unique"]);
const qrTokenUniqueConstraints = new Set(["accreditation_access_grants_qr_token_unique"]);

export function createSupabaseAccreditationAccessRepositories(client: AccreditationAccessSupabaseClient | null): AccreditationAccessRepository {
  if (!client) {
    return createNoopRepositories();
  }

  const safeClient = client;

  async function create(grant: AccreditationAccessGrant) {
    const { data, error } = await safeClient.from<AccreditationAccessGrantRow>("accreditation_access_grants").insert(mapAccreditationAccessGrantToRow(grant)).select("*").single();

    if (error) {
      throw error;
    }

    return mapAccreditationAccessGrantRowToDomain(data as AccreditationAccessGrantRow);
  }

  return {
    create,
    issue: create,
    async getById(scope, grantId) {
      const row = await unwrapSingle(buildQueryScope(safeClient.from<AccreditationAccessGrantRow>("accreditation_access_grants").select("*").eq("id", grantId), scope));
      return row ? mapAccreditationAccessGrantRowToDomain(row) : undefined;
    },
    async getByEnrollment(scope, enrollmentId) {
      const row = await unwrapSingle(
        buildQueryScope(
          safeClient.from<AccreditationAccessGrantRow>("accreditation_access_grants").select("*").eq("enrollment_id", enrollmentId),
          scope,
        ),
      );
      return row ? mapAccreditationAccessGrantRowToDomain(row) : undefined;
    },
    async resolveByAccessCode(scope, accessCode) {
      const row = await unwrapSingle(
        buildQueryScope(
          safeClient.from<AccreditationAccessGrantRow>("accreditation_access_grants").select("*").eq("access_code", normalizeAccreditationAccessCode(accessCode)),
          scope,
        ),
      );
      return row ? mapAccreditationAccessGrantRowToDomain(row) : undefined;
    },
    async resolveByQrToken(scope, qrToken) {
      const row = await unwrapSingle(
        buildQueryScope(
          safeClient.from<AccreditationAccessGrantRow>("accreditation_access_grants").select("*").eq("qr_token", normalizeAccreditationQrToken(qrToken)),
          scope,
        ),
      );
      return row ? mapAccreditationAccessGrantRowToDomain(row) : undefined;
    },
    async revoke(scope, grantId) {
      const current = await unwrapSingle(buildQueryScope(safeClient.from<AccreditationAccessGrantRow>("accreditation_access_grants").select("*").eq("id", grantId), scope));

      if (!current) {
        throw new Error("Accreditation access grant not found.");
      }

      const next: AccreditationAccessGrantRow = {
        ...current,
        status: "revoked",
        revoked_at: current.revoked_at ?? nowIso(),
        updated_at: nowIso(),
      };

      const { data, error } = await buildQueryScope(
        safeClient.from<AccreditationAccessGrantRow>("accreditation_access_grants").update(next).eq("id", grantId),
        scope,
      )
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationAccessGrantRowToDomain(data as AccreditationAccessGrantRow);
    },
    async list(scope) {
      const rows = await unwrapMany(
        buildQueryScope(
          safeClient.from<AccreditationAccessGrantRow[]>("accreditation_access_grants").select("*").order("issued_at", { ascending: false }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationAccessGrantRowToDomain(row as AccreditationAccessGrantRow));
    },
  };
}

export function isAccreditationAccessUniqueViolation(error: unknown) {
  return (
    isUniqueViolation(error, enrollmentUniqueConstraints) ||
    isUniqueViolation(error, accessCodeUniqueConstraints) ||
    isUniqueViolation(error, qrTokenUniqueConstraints)
  );
}

export function isAccreditationAccessEnrollmentUniqueViolation(error: unknown) {
  return isUniqueViolation(error, enrollmentUniqueConstraints);
}

export function isAccreditationAccessCodeUniqueViolation(error: unknown) {
  return isUniqueViolation(error, accessCodeUniqueConstraints);
}

export function isAccreditationAccessQrTokenUniqueViolation(error: unknown) {
  return isUniqueViolation(error, qrTokenUniqueConstraints);
}
