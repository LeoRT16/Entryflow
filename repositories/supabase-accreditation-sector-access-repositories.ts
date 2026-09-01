import type { AccreditationAccessGrantRow } from "@/features/accreditation/access";
import type { AccreditationEnrollmentRow } from "@/features/accreditation/types";
import type { Json } from "@/lib/supabase/types";
import type {
  AccreditationAccessEntitlementRepository,
  AccreditationAccessEntitlementRow,
  AccreditationAccessSectorRepository,
  AccreditationAccessSectorRow,
  AccreditationSectorAccessAttemptRepository,
  AccreditationSectorAccessAttemptRow,
  AccreditationSectorAccessRepositories,
  AccreditationSectorAccessScope,
  AccreditationSectorMovementRepository,
  AccreditationSectorMovementRow,
  AccreditationAccessCheckpointRepository,
  AccreditationAccessCheckpointRow,
} from "@/features/accreditation/sector-access";
import {
  AccreditationSectorAccessValidationError,
  buildAccreditationAccessEntitlement,
  buildAccreditationAccessSector,
  buildAccreditationSectorAccessAttempt,
  deactivateAccreditationAccessSector,
  normalizeAccreditationAccessEntitlementStatus,
  normalizeAccreditationAccessSectorCode,
  normalizeAccreditationAccessSectorName,
  normalizeAccreditationAccessSectorStatus,
  revokeAccreditationAccessEntitlement,
  updateAccreditationAccessSector,
} from "@/features/accreditation/sector-access";
import {
  mapAccreditationAccessEntitlementRowToDomain,
  mapAccreditationAccessEntitlementToRow,
  mapAccreditationAccessSectorRowToDomain,
  mapAccreditationAccessSectorToRow,
  mapAccreditationSectorAccessAttemptRowToDomain,
  mapAccreditationSectorAccessAttemptToRow,
  mapAccreditationSectorMovementRowToDomain,
  mapAccreditationAccessCheckpointRowToDomain,
} from "@/lib/supabase/accreditation-sector-access-mappers";
import { mapAccreditationAccessGrantRowToDomain } from "@/lib/supabase/accreditation-access-mappers";
import { mapAccreditationEnrollmentRowToDomain } from "@/lib/supabase/accreditation-mappers";
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

type SupabaseRpcClient = {
  rpc<T = unknown>(functionName: string, args: Record<string, unknown>): PromiseLike<SupabaseQueryResult<T>>;
};

export type AccreditationSectorAccessSupabaseClient = {
  from<T = unknown>(table: string): SupabaseQuery<T>;
} & SupabaseRpcClient;

function createNoopRepositories(): AccreditationSectorAccessRepositories {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  return {
    checkpoints: {
      create: unavailable,
      update: unavailable,
      deactivate: unavailable,
      getById: unavailable,
      listByEvent: unavailable,
    },
    sectors: {
      create: unavailable,
      update: unavailable,
      deactivate: unavailable,
      getById: unavailable,
      listByEvent: unavailable,
    },
    entitlements: {
      assign: unavailable,
      revoke: unavailable,
      getById: unavailable,
      listByGrant: unavailable,
      listByEvent: unavailable,
      resolveActiveByGrantAndSector: unavailable,
    },
    attempts: {
      append: unavailable,
      listByEvent: unavailable,
    },
    movements: {
      record: unavailable,
      listByEvent: unavailable,
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

function buildQueryScope<T>(query: SupabaseQuery<T>, scope: AccreditationSectorAccessScope) {
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

const entitlementUniqueConstraints = new Set(["accreditation_access_entitlements_grant_sector_active_unique"]);

async function getEventById(client: AccreditationSectorAccessSupabaseClient, eventId: string) {
  return unwrapSingle(client.from<{ id: string; organization_id: string; deleted_at: string | null }>("events").select("*").eq("id", eventId).eq("deleted_at", null));
}

async function getSectorById(client: AccreditationSectorAccessSupabaseClient, sectorId: string) {
  const row = await unwrapSingle(client.from<AccreditationAccessSectorRow>("accreditation_access_sectors").select("*").eq("id", sectorId).eq("deleted_at", null));
  return row ? mapAccreditationAccessSectorRowToDomain(row) : undefined;
}

async function getGrantById(client: AccreditationSectorAccessSupabaseClient, grantId: string) {
  const row = await unwrapSingle(client.from<AccreditationAccessGrantRow>("accreditation_access_grants").select("*").eq("id", grantId));
  return row ? mapAccreditationAccessGrantRowToDomain(row) : undefined;
}

async function getEnrollmentById(client: AccreditationSectorAccessSupabaseClient, enrollmentId: string) {
  const row = await unwrapSingle(client.from<AccreditationEnrollmentRow>("accreditation_enrollments").select("*").eq("id", enrollmentId).eq("deleted_at", null));
  return row ? mapAccreditationEnrollmentRowToDomain(row) : undefined;
}

async function resolveActiveByGrantAndSector(
  client: AccreditationSectorAccessSupabaseClient,
  scope: AccreditationSectorAccessScope,
  accessGrantId: string,
  sectorId: string,
) {
  const row = await unwrapSingle(
    buildQueryScope(
      client
        .from<AccreditationAccessEntitlementRow>("accreditation_access_entitlements")
        .select("*")
        .eq("access_grant_id", accessGrantId)
        .eq("sector_id", sectorId)
        .eq("status", "active"),
      scope,
    ),
  );

  return row ? mapAccreditationAccessEntitlementRowToDomain(row) : undefined;
}

export function createSupabaseAccreditationSectorAccessRepositories(
  client: AccreditationSectorAccessSupabaseClient | null,
): AccreditationSectorAccessRepositories {
  if (!client) {
    return createNoopRepositories();
  }

  const sectors: AccreditationAccessSectorRepository = {
    async create(input) {
      const event = await getEventById(client, input.eventId);

      if (!event) {
        throw new AccreditationSectorAccessValidationError("event_mismatch", "Accreditation event was not found.");
      }

      if (event.organization_id !== input.organizationId) {
        throw new AccreditationSectorAccessValidationError("organization_mismatch", "Accreditation access sector belongs to another organization.");
      }

      const sector = buildAccreditationAccessSector({
        ...input,
        name: normalizeAccreditationAccessSectorName(input.name),
        code: normalizeAccreditationAccessSectorCode(input.code),
        status: normalizeAccreditationAccessSectorStatus(input.status ?? "active"),
      });

      const { data, error } = await client
        .from<AccreditationAccessSectorRow>("accreditation_access_sectors")
        .insert(mapAccreditationAccessSectorToRow(sector))
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationAccessSectorRowToDomain(data as AccreditationAccessSectorRow);
    },
    async update(id, patch) {
      const current = await sectors.getById(id);

      if (!current) {
        throw new Error("Accreditation access sector not found.");
      }

      const next = updateAccreditationAccessSector(current, {
        ...patch,
        name: patch.name === undefined ? undefined : normalizeAccreditationAccessSectorName(patch.name),
        code: patch.code === undefined ? undefined : normalizeAccreditationAccessSectorCode(patch.code),
        status: patch.status === undefined ? undefined : normalizeAccreditationAccessSectorStatus(patch.status),
      });

      const { data, error } = await client
        .from<AccreditationAccessSectorRow>("accreditation_access_sectors")
        .update(mapAccreditationAccessSectorToRow(next))
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationAccessSectorRowToDomain(data as AccreditationAccessSectorRow);
    },
    async deactivate(id) {
      const current = await sectors.getById(id);

      if (!current) {
        throw new Error("Accreditation access sector not found.");
      }

      const next = deactivateAccreditationAccessSector(current, nowIso);

      const { data, error } = await client
        .from<AccreditationAccessSectorRow>("accreditation_access_sectors")
        .update(mapAccreditationAccessSectorToRow(next))
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationAccessSectorRowToDomain(data as AccreditationAccessSectorRow);
    },
    async getById(id) {
      const row = await unwrapSingle(client.from<AccreditationAccessSectorRow>("accreditation_access_sectors").select("*").eq("id", id).eq("deleted_at", null));
      return row ? mapAccreditationAccessSectorRowToDomain(row) : undefined;
    },
    async listByEvent(scope) {
      const rows = await unwrapMany(
        buildQueryScope(
          client
            .from<AccreditationAccessSectorRow[]>("accreditation_access_sectors")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("code", { ascending: true }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationAccessSectorRowToDomain(row as AccreditationAccessSectorRow));
    },
  };

  const checkpoints: AccreditationAccessCheckpointRepository = {
    async create(input) {
      const sector = await getSectorById(client, input.sectorId);
      if (!sector || sector.organizationId !== input.organizationId || sector.eventId !== input.eventId) {
        throw new AccreditationSectorAccessValidationError("wrong_scope", "El checkpoint debe apuntar a un sector del mismo evento.");
      }
      const now = nowIso();
      const row = {
        id: crypto.randomUUID(),
        organization_id: input.organizationId,
        event_id: input.eventId,
        sector_id: input.sectorId,
        name: input.name.trim(),
        code: input.code?.trim() || null,
        status: input.status ?? "active",
        metadata: (input.metadata as Json | null | undefined) ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      } satisfies AccreditationAccessCheckpointRow;
      const { data, error } = await client.from<AccreditationAccessCheckpointRow>("accreditation_access_checkpoints").insert(row).select("*").single();
      if (error) throw error;
      return mapAccreditationAccessCheckpointRowToDomain(data as AccreditationAccessCheckpointRow);
    },
    async update(id, patch) {
      const current = await checkpoints.getById(id);
      if (!current) throw new Error("Accreditation checkpoint not found.");
      const { data, error } = await client.from<AccreditationAccessCheckpointRow>("accreditation_access_checkpoints").update({
        id: current.id,
        organization_id: current.organizationId,
        event_id: current.eventId,
        sector_id: current.sectorId,
        name: patch.name?.trim() || current.name,
        code: patch.code?.trim() || null,
        status: patch.status ?? current.status,
        metadata: patch.metadata ?? null,
        created_at: current.createdAt,
        updated_at: nowIso(),
        deleted_at: current.deletedAt ?? null,
      }).eq("id", id).select("*").single();
      if (error) throw error;
      return mapAccreditationAccessCheckpointRowToDomain(data as AccreditationAccessCheckpointRow);
    },
    async deactivate(id) { return checkpoints.update(id, { status: "inactive" }); },
    async getById(id) {
      const row = await unwrapSingle(client.from<AccreditationAccessCheckpointRow>("accreditation_access_checkpoints").select("*").eq("id", id).eq("deleted_at", null));
      return row ? mapAccreditationAccessCheckpointRowToDomain(row) : undefined;
    },
    async listByEvent(scope) {
      const rows = await unwrapMany(buildQueryScope(client.from<AccreditationAccessCheckpointRow[]>("accreditation_access_checkpoints").select("*").order("name", { ascending: true }), scope));
      return rows.map((row) => mapAccreditationAccessCheckpointRowToDomain(row));
    },
  };

  const entitlements: AccreditationAccessEntitlementRepository = {
    async assign(input) {
      const existing = await resolveActiveByGrantAndSector(client, { organizationId: input.organizationId, eventId: input.eventId }, input.accessGrantId, input.sectorId);

      if (existing) {
        return existing;
      }

      const grant = await getGrantById(client, input.accessGrantId);
      const sector = await getSectorById(client, input.sectorId);
      const enrollment = grant ? await getEnrollmentById(client, grant.enrollmentId) : undefined;

      if (!grant) {
        throw new AccreditationSectorAccessValidationError("grant_not_found", "Accreditation access grant was not found.");
      }

      if (!sector) {
        throw new AccreditationSectorAccessValidationError("sector_not_found", "Accreditation access sector was not found.");
      }

      if (grant.organizationId !== input.organizationId || grant.eventId !== input.eventId) {
        throw new AccreditationSectorAccessValidationError("wrong_scope", "Accreditation access grant belongs to another organization or event.");
      }

      if (sector.organizationId !== input.organizationId || sector.eventId !== input.eventId) {
        throw new AccreditationSectorAccessValidationError("wrong_scope", "Accreditation access sector belongs to another organization or event.");
      }

      if (grant.status !== "active") {
        throw new AccreditationSectorAccessValidationError("grant_revoked", "Accreditation access grant is not active.");
      }

      if (!enrollment || enrollment.status !== "active") {
        throw new AccreditationSectorAccessValidationError("enrollment_cancelled", "Accreditation enrollment is not active.");
      }

      if (sector.status !== "active") {
        throw new AccreditationSectorAccessValidationError("sector_inactive", "Accreditation access sector is not active.");
      }

      const entitlement = buildAccreditationAccessEntitlement({
        ...input,
        status: normalizeAccreditationAccessEntitlementStatus(input.status ?? "active"),
      });

      try {
        const { data, error } = await client
          .from<AccreditationAccessEntitlementRow>("accreditation_access_entitlements")
          .insert(mapAccreditationAccessEntitlementToRow(entitlement))
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        return mapAccreditationAccessEntitlementRowToDomain(data as AccreditationAccessEntitlementRow);
      } catch (error) {
        if (isUniqueViolation(error, entitlementUniqueConstraints)) {
          const fallback = await resolveActiveByGrantAndSector(client, { organizationId: input.organizationId, eventId: input.eventId }, input.accessGrantId, input.sectorId);

          if (fallback) {
            return fallback;
          }
        }

        throw error;
      }
    },
    async revoke(id) {
      const current = await entitlements.getById(id);

      if (!current) {
        throw new Error("Accreditation access entitlement not found.");
      }

      const next = revokeAccreditationAccessEntitlement(current, nowIso);

      const { data, error } = await client
        .from<AccreditationAccessEntitlementRow>("accreditation_access_entitlements")
        .update(mapAccreditationAccessEntitlementToRow(next))
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationAccessEntitlementRowToDomain(data as AccreditationAccessEntitlementRow);
    },
    async getById(id) {
      const row = await unwrapSingle(client.from<AccreditationAccessEntitlementRow>("accreditation_access_entitlements").select("*").eq("id", id));
      return row ? mapAccreditationAccessEntitlementRowToDomain(row) : undefined;
    },
    async listByGrant(scope, accessGrantId) {
      const rows = await unwrapMany(
        buildQueryScope(
          client
            .from<AccreditationAccessEntitlementRow[]>("accreditation_access_entitlements")
            .select("*")
            .eq("access_grant_id", accessGrantId)
            .order("issued_at", { ascending: false }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationAccessEntitlementRowToDomain(row as AccreditationAccessEntitlementRow));
    },
    async listByEvent(scope) {
      const rows = await unwrapMany(
        buildQueryScope(
          client
            .from<AccreditationAccessEntitlementRow[]>("accreditation_access_entitlements")
            .select("*")
            .order("issued_at", { ascending: false }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationAccessEntitlementRowToDomain(row as AccreditationAccessEntitlementRow));
    },
    async resolveActiveByGrantAndSector(scope, accessGrantId, sectorId) {
      return resolveActiveByGrantAndSector(client, scope, accessGrantId, sectorId);
    },
  };

  const attempts: AccreditationSectorAccessAttemptRepository = {
    async append(input) {
      const attempt = buildAccreditationSectorAccessAttempt(
        input,
        input.decision === "allow" ? { allowed: true } : { allowed: false, reason: input.denialReason },
      );
      const { data, error } = await client
        .from<AccreditationSectorAccessAttemptRow>("accreditation_sector_access_attempts")
        .insert(mapAccreditationSectorAccessAttemptToRow(attempt))
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationSectorAccessAttemptRowToDomain(data as AccreditationSectorAccessAttemptRow);
    },
    async listByEvent(scope) {
      const rows = await unwrapMany(
        buildQueryScope(
          client
            .from<AccreditationSectorAccessAttemptRow[]>("accreditation_sector_access_attempts")
            .select("*")
            .order("evaluated_at", { ascending: false }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationSectorAccessAttemptRowToDomain(row as AccreditationSectorAccessAttemptRow));
    },
  };

  const movements: AccreditationSectorMovementRepository = {
    async record(input) {
      const rpcName = input.checkpointId ? "accreditation_sector_record_movement_at_checkpoint" : "accreditation_sector_record_movement";
      const rpcArgs = input.checkpointId
        ? {
            movement_organization_id: input.organizationId,
            movement_event_id: input.eventId,
            movement_checkpoint_id: input.checkpointId,
            movement_access_grant_id: input.accessGrantId ?? null,
            movement_enrollment_id: input.enrollmentId ?? null,
            movement_operator_profile_id: input.operatorProfileId,
            movement_type: input.movement,
            movement_source: input.source,
            movement_credential_reference: input.credentialReference,
          }
        : {
            movement_organization_id: input.organizationId,
            movement_event_id: input.eventId,
            movement_access_grant_id: input.accessGrantId ?? null,
            movement_enrollment_id: input.enrollmentId ?? null,
            movement_sector_id: input.sectorId ?? null,
            movement_operator_profile_id: input.operatorProfileId,
            movement_type: input.movement,
            movement_source: input.source,
            movement_credential_reference: input.credentialReference,
            movement_sector_reference: input.sectorReference,
          };
      const { data, error } = await client.rpc<{
        status: "recorded" | "already_inside" | "already_outside" | "denied";
        inside: boolean;
        movement_id: string | null;
        attempt_id: string | null;
        denial_reason: string | null;
      }[]>(rpcName, rpcArgs);

      if (error) {
        throw error;
      }

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) {
        throw new Error("Supabase returned no accreditation sector movement result.");
      }

      const movement = result.movement_id
        ? await unwrapSingle(client.from<AccreditationSectorMovementRow>("accreditation_sector_movements").select("*").eq("id", result.movement_id))
        : undefined;

      return {
        status: result.status,
        inside: result.inside,
        movement: movement ? mapAccreditationSectorMovementRowToDomain(movement) : undefined,
        decision: result.status === "denied"
          ? { allowed: false, reason: result.denial_reason as never }
          : result.attempt_id
            ? { allowed: true }
            : undefined,
      };
    },
    async listByEvent(scope) {
      const rows = await unwrapMany(
        buildQueryScope(
          client.from<AccreditationSectorMovementRow[]>("accreditation_sector_movements").select("*").order("moved_at", { ascending: false }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationSectorMovementRowToDomain(row));
    },
  };

      return { checkpoints, sectors, entitlements, attempts, movements };
}
