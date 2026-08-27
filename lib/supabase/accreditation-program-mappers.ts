import type { Json } from "@/lib/supabase/types";
import type {
  AccreditationProgramSession,
  AccreditationProgramSessionRow,
} from "@/features/accreditation/program";

function toMetadata(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toJson(value?: Record<string, unknown> | null) {
  return value ? (value as Json) : null;
}

export function mapAccreditationProgramSessionRowToDomain(row: AccreditationProgramSessionRow): AccreditationProgramSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    title: row.title,
    description: row.description ?? undefined,
    sessionType: row.session_type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    room: row.room ?? undefined,
    capacity: row.capacity ?? undefined,
    metadata: toMetadata(row.metadata),
    status: row.status,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAccreditationProgramSessionToRow(
  session: AccreditationProgramSession,
): Omit<AccreditationProgramSessionRow, "created_at" | "updated_at"> {
  return {
    id: session.id,
    organization_id: session.organizationId,
    event_id: session.eventId,
    title: session.title,
    description: session.description ?? null,
    session_type: session.sessionType,
    starts_at: session.startsAt,
    ends_at: session.endsAt,
    room: session.room ?? null,
    capacity: session.capacity ?? null,
    metadata: toJson(session.metadata),
    status: session.status,
    cancelled_at: session.cancelledAt ?? null,
  };
}
