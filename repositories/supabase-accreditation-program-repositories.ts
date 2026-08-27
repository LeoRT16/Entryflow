import { isAccreditationPhase2EventType } from "@/features/accreditation/events";
import type {
  AccreditationProgramSessionInput,
  AccreditationProgramSessionRepository,
  AccreditationProgramSessionRow,
} from "@/features/accreditation/program";
import {
  applyAccreditationProgramSessionPatch,
  cancelAccreditationProgramSession,
  compareAccreditationProgramSessions,
  validateAccreditationProgramSessionInput,
} from "@/features/accreditation/program";
import { mapAccreditationProgramSessionRowToDomain, mapAccreditationProgramSessionToRow } from "@/lib/supabase/accreditation-program-mappers";
import { createUuid, nowIso } from "@/lib/supabase/helpers";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { code?: string; message?: string; constraint?: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseQueryResult<T>> & {
  select(columns?: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  is(column: string, value: null): SupabaseQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery<T>;
  insert(values: unknown): SupabaseQuery<T>;
  update(values: unknown): SupabaseQuery<T>;
  upsert(values: unknown, options?: { onConflict?: string }): SupabaseQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
  single(): Promise<SupabaseQueryResult<T>>;
};

export type AccreditationProgramSupabaseClient = {
  from<T = unknown>(table: string): SupabaseQuery<T>;
};

type EventRow = {
  id: string;
  organization_id: string;
  event_type: string;
  deleted_at: string | null;
};

function createNoopRepository(): AccreditationProgramSessionRepository {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  return {
    create: unavailable,
    update: unavailable,
    cancel: unavailable,
    getById: unavailable,
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

  return Array.isArray(data) ? data : data ? [data] : [];
}

async function getEventById(client: AccreditationProgramSupabaseClient, eventId: string) {
  const row = await unwrapSingle(client.from<EventRow>("events").select("*").eq("id", eventId).is("deleted_at", null));
  return row;
}

async function validateSessionContext(
  client: AccreditationProgramSupabaseClient,
  input: Pick<AccreditationProgramSessionInput, "organizationId" | "eventId">,
) {
  const event = await getEventById(client, input.eventId);

  if (!event) {
    throw new Error("Accreditation program event was not found.");
  }

  if (event.organization_id !== input.organizationId) {
    throw new Error("Accreditation program session belongs to another organization.");
  }

  if (!isAccreditationPhase2EventType(event.event_type)) {
    throw new Error("Accreditation program sessions are only available for conference, seminar, and workshop events.");
  }
}

export function createSupabaseAccreditationProgramRepositories(client: AccreditationProgramSupabaseClient | null): AccreditationProgramSessionRepository {
  if (!client) {
    return createNoopRepository();
  }

  return {
    async create(input) {
      const next = validateAccreditationProgramSessionInput(input);
      await validateSessionContext(client, next);
      const row = mapAccreditationProgramSessionToRow({
        id: createUuid(),
        organizationId: next.organizationId,
        eventId: next.eventId,
        title: next.title,
        description: next.description,
        sessionType: next.sessionType,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        room: next.room,
        capacity: next.capacity,
        metadata: next.metadata,
        status: "active",
        cancelledAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      const { data, error } = await client.from<AccreditationProgramSessionRow>("accreditation_program_sessions").insert(row).select("*").single();

      if (error) {
        throw error;
      }

      return mapAccreditationProgramSessionRowToDomain(data as AccreditationProgramSessionRow);
    },
    async update(id, patch) {
      const current = await unwrapSingle(client.from<AccreditationProgramSessionRow>("accreditation_program_sessions").select("*").eq("id", id));

      if (!current) {
        throw new Error("Accreditation program session not found.");
      }

      const currentDomain = mapAccreditationProgramSessionRowToDomain(current);
      const next = applyAccreditationProgramSessionPatch(currentDomain, patch, nowIso);
      await validateSessionContext(client, next);

      const { data, error } = await client
        .from<AccreditationProgramSessionRow>("accreditation_program_sessions")
        .upsert(mapAccreditationProgramSessionToRow(next), { onConflict: "id" })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationProgramSessionRowToDomain(data as AccreditationProgramSessionRow);
    },
    async cancel(id) {
      const current = await unwrapSingle(client.from<AccreditationProgramSessionRow>("accreditation_program_sessions").select("*").eq("id", id));

      if (!current) {
        throw new Error("Accreditation program session not found.");
      }

      const currentDomain = mapAccreditationProgramSessionRowToDomain(current);
      const next = cancelAccreditationProgramSession(currentDomain, nowIso);

      const { data, error } = await client
        .from<AccreditationProgramSessionRow>("accreditation_program_sessions")
        .upsert(mapAccreditationProgramSessionToRow(next), { onConflict: "id" })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapAccreditationProgramSessionRowToDomain(data as AccreditationProgramSessionRow);
    },
    async getById(id) {
      const row = await unwrapSingle(client.from<AccreditationProgramSessionRow>("accreditation_program_sessions").select("*").eq("id", id));
      return row ? mapAccreditationProgramSessionRowToDomain(row) : undefined;
    },
    async list(scope) {
      const rows = await unwrapMany(
        client
          .from<AccreditationProgramSessionRow[]>("accreditation_program_sessions")
          .select("*")
          .eq("organization_id", scope.organizationId)
          .eq("event_id", scope.eventId),
      );

      return rows.map((row) => mapAccreditationProgramSessionRowToDomain(row as AccreditationProgramSessionRow)).sort(compareAccreditationProgramSessions);
    },
  };
}
