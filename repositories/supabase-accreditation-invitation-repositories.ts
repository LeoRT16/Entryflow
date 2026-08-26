import type {
  AccreditationInvitationDeliveryRepository,
  AccreditationWhatsAppDeliveryAttempt,
  AccreditationWhatsAppDeliveryAttemptRow,
  AccreditationInvitationScope,
} from "@/features/accreditation/invitations";
import { mapAccreditationWhatsAppDeliveryAttemptRowToDomain, mapAccreditationWhatsAppDeliveryAttemptToRow } from "@/lib/supabase/accreditation-invitation-mappers";

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

export type AccreditationInvitationSupabaseClient = {
  from<T = unknown>(table: string): SupabaseQuery<T>;
};

function createNoopRepositories(): AccreditationInvitationDeliveryRepository {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  return {
    create: unavailable,
    getByMessageId: unavailable,
    listByEnrollment: unavailable,
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

function buildQueryScope<T>(query: SupabaseQuery<T>, scope: AccreditationInvitationScope) {
  return query.eq("organization_id", scope.organizationId).eq("event_id", scope.eventId);
}

export function createSupabaseAccreditationInvitationDeliveryRepositories(
  client: AccreditationInvitationSupabaseClient | null,
): AccreditationInvitationDeliveryRepository {
  if (!client) {
    return createNoopRepositories();
  }

  const safeClient = client;

  async function create(attempt: AccreditationWhatsAppDeliveryAttempt) {
    const { data, error } = await safeClient
      .from<AccreditationWhatsAppDeliveryAttemptRow>("accreditation_whatsapp_delivery_attempts")
      .insert(mapAccreditationWhatsAppDeliveryAttemptToRow(attempt))
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return mapAccreditationWhatsAppDeliveryAttemptRowToDomain(data as AccreditationWhatsAppDeliveryAttemptRow);
  }

  return {
    create,
    async getByMessageId(scope, messageId) {
      const row = await unwrapSingle(
        buildQueryScope(
          safeClient
            .from<AccreditationWhatsAppDeliveryAttemptRow>("accreditation_whatsapp_delivery_attempts")
            .select("*")
            .eq("message_id", messageId),
          scope,
        ),
      );

      return row ? mapAccreditationWhatsAppDeliveryAttemptRowToDomain(row) : undefined;
    },
    async listByEnrollment(scope, enrollmentId) {
      const rows = await unwrapMany(
        buildQueryScope(
          safeClient
            .from<AccreditationWhatsAppDeliveryAttemptRow[]>("accreditation_whatsapp_delivery_attempts")
            .select("*")
            .eq("enrollment_id", enrollmentId)
            .order("attempt_number", { ascending: false }),
          scope,
        ),
      );

      return rows.map((row) => mapAccreditationWhatsAppDeliveryAttemptRowToDomain(row as AccreditationWhatsAppDeliveryAttemptRow));
    },
  };
}
