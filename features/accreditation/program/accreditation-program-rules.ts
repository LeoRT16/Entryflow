import { nowIso } from "@/lib/supabase/helpers";
import type { Event } from "@/features/domain/types";
import { buildAccreditationEventProfile, isAccreditationPhase2EventType } from "../events";
import { formatAccreditationProgramDateKey } from "./accreditation-program-time";
import type {
  AccreditationProgramDateGroup,
  AccreditationProgramReadModel,
  AccreditationProgramSession,
  AccreditationProgramSessionDisplay,
  AccreditationProgramSessionInput,
  AccreditationProgramSessionSummary,
  AccreditationProgramSessionType,
  AccreditationProgramSessionUpdateInput,
} from "./types";
import { AccreditationProgramValidationError } from "./errors";

const ACCREDITATION_PROGRAM_SESSION_TYPES = new Set<AccreditationProgramSessionType>([
  "keynote",
  "talk",
  "panel",
  "workshop",
  "break",
  "networking",
  "other",
]);

function normalizeText(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizeOptionalString(value?: string | null) {
  const normalized = normalizeText(value);
  return normalized === undefined ? undefined : normalized;
}

function parseIso(value: string, field: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new AccreditationProgramValidationError("missing_field", `Falta ${field}.`, field);
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.valueOf())) {
    throw new AccreditationProgramValidationError("invalid_datetime", `La fecha y hora de ${field} no es válida.`, field);
  }

  return parsed.toISOString();
}

function normalizeCapacity(value?: number | null) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new AccreditationProgramValidationError("invalid_capacity", "La capacidad debe ser un entero positivo.", "capacity");
  }

  return value;
}

export function normalizeAccreditationProgramSessionType(value?: string | null): AccreditationProgramSessionType {
  const normalized = normalizeOptionalString(value)?.toLowerCase();

  if (!normalized) {
    return "other";
  }

  return ACCREDITATION_PROGRAM_SESSION_TYPES.has(normalized as AccreditationProgramSessionType)
    ? (normalized as AccreditationProgramSessionType)
    : "other";
}

export function getAccreditationProgramSessionTypeLabel(sessionType: AccreditationProgramSessionType) {
  return {
    keynote: "Keynote",
    talk: "Charla",
    panel: "Panel",
    workshop: "Taller",
    break: "Pausa",
    networking: "Networking",
    other: "Otro",
  }[sessionType];
}

export function getAccreditationProgramSessionLifecycleState(
  session: Pick<AccreditationProgramSession, "status" | "startsAt" | "endsAt">,
  clock: () => string = nowIso,
): AccreditationProgramSessionDisplay["lifecycleState"] {
  if (session.status === "cancelled") {
    return "cancelled";
  }

  const now = new Date(clock()).valueOf();
  const starts = new Date(session.startsAt).valueOf();
  const ends = new Date(session.endsAt).valueOf();

  if (Number.isNaN(starts) || Number.isNaN(ends) || now < starts) {
    return "upcoming";
  }

  if (now >= starts && now < ends) {
    return "in_progress";
  }

  return "completed";
}

export function compareAccreditationProgramSessions(
  left: Pick<AccreditationProgramSession, "startsAt" | "endsAt" | "title" | "id">,
  right: Pick<AccreditationProgramSession, "startsAt" | "endsAt" | "title" | "id">,
) {
  if (left.startsAt !== right.startsAt) {
    return left.startsAt < right.startsAt ? -1 : 1;
  }

  if (left.endsAt !== right.endsAt) {
    return left.endsAt < right.endsAt ? -1 : 1;
  }

  const titleCompare = left.title.localeCompare(right.title, "es-BO");

  if (titleCompare !== 0) {
    return titleCompare;
  }

  return left.id.localeCompare(right.id, "es-BO");
}

function formatSessionDateLabel(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("es-BO", {
      dateStyle: "full",
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatAccreditationProgramSessionTimeRange(session: Pick<AccreditationProgramSession, "startsAt" | "endsAt">, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("es-BO", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    });

    return `${formatter.format(new Date(session.startsAt))} · ${formatter.format(new Date(session.endsAt))}`;
  } catch {
    return `${session.startsAt} · ${session.endsAt}`;
  }
}

export function validateAccreditationProgramSessionInput(input: AccreditationProgramSessionInput) {
  const title = normalizeOptionalString(input.title);

  if (!title) {
    throw new AccreditationProgramValidationError("missing_field", "Falta el título de la sesión.", "title");
  }

  const startsAt = parseIso(input.startsAt, "startsAt");
  const endsAt = parseIso(input.endsAt, "endsAt");

  if (new Date(endsAt).valueOf() <= new Date(startsAt).valueOf()) {
    throw new AccreditationProgramValidationError("invalid_time_window", "La sesión debe terminar después de comenzar.", "endsAt");
  }

  return {
    organizationId: input.organizationId,
    eventId: input.eventId,
    title,
    description: normalizeOptionalString(input.description),
    sessionType: normalizeAccreditationProgramSessionType(input.sessionType),
    startsAt,
    endsAt,
    room: normalizeOptionalString(input.room),
    capacity: normalizeCapacity(input.capacity),
    metadata: input.metadata ?? undefined,
  };
}

export function applyAccreditationProgramSessionPatch(
  current: AccreditationProgramSession,
  patch: AccreditationProgramSessionUpdateInput,
  clock: () => string = nowIso,
): AccreditationProgramSession {
  const nextTitle = patch.title === undefined ? current.title : normalizeOptionalString(patch.title);

  if (!nextTitle) {
    throw new AccreditationProgramValidationError("missing_field", "Falta el título de la sesión.", "title");
  }

  const nextStartsAt = patch.startsAt === undefined ? current.startsAt : parseIso(patch.startsAt, "startsAt");
  const nextEndsAt = patch.endsAt === undefined ? current.endsAt : parseIso(patch.endsAt, "endsAt");

  if (new Date(nextEndsAt).valueOf() <= new Date(nextStartsAt).valueOf()) {
    throw new AccreditationProgramValidationError("invalid_time_window", "La sesión debe terminar después de comenzar.", "endsAt");
  }

  return {
    ...current,
    title: nextTitle,
    description: patch.description === undefined ? current.description : normalizeOptionalString(patch.description),
    sessionType: patch.sessionType === undefined ? current.sessionType : normalizeAccreditationProgramSessionType(patch.sessionType),
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    room: patch.room === undefined ? current.room : normalizeOptionalString(patch.room),
    capacity: patch.capacity === undefined ? current.capacity : normalizeCapacity(patch.capacity),
    metadata: patch.metadata === undefined ? current.metadata : (patch.metadata ?? undefined),
    updatedAt: clock(),
  };
}

export function cancelAccreditationProgramSession(current: AccreditationProgramSession, clock: () => string = nowIso): AccreditationProgramSession {
  const timestamp = clock();

  return {
    ...current,
    status: "cancelled",
    cancelledAt: current.cancelledAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function buildAccreditationProgramSessionDisplay(
  session: AccreditationProgramSession,
  eventTimezone: string,
  clock: () => string = nowIso,
): AccreditationProgramSessionDisplay {
  const lifecycleState = getAccreditationProgramSessionLifecycleState(session, clock);

  return {
    id: session.id,
    title: session.title,
    description: session.description,
    sessionType: session.sessionType,
    sessionTypeLabel: getAccreditationProgramSessionTypeLabel(session.sessionType),
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timeRangeLabel: formatAccreditationProgramSessionTimeRange(session, eventTimezone),
    room: session.room,
    roomLabel: session.room?.trim() || "Sin sala",
    capacity: session.capacity,
    capacityLabel: session.capacity === undefined ? undefined : `${session.capacity} cupos`,
    status: session.status,
    statusLabel: session.status === "active" ? "Activa" : "Cancelada",
    lifecycleState,
    lifecycleStateLabel:
      lifecycleState === "upcoming"
        ? "Programada"
        : lifecycleState === "in_progress"
          ? "En curso"
          : lifecycleState === "completed"
            ? "Finalizada"
            : "Cancelada",
    dateKey: formatAccreditationProgramDateKey(session.startsAt, eventTimezone),
  };
}

export function groupAccreditationProgramSessions(
  sessions: AccreditationProgramSession[],
  eventTimezone: string,
  clock: () => string = nowIso,
): AccreditationProgramDateGroup[] {
  const groups = new Map<string, AccreditationProgramSessionDisplay[]>();
  const orderedSessions = [...sessions].sort(compareAccreditationProgramSessions);

  for (const session of orderedSessions) {
    const display = buildAccreditationProgramSessionDisplay(session, eventTimezone, clock);
    const current = groups.get(display.dateKey) ?? [];
    current.push(display);
    groups.set(display.dateKey, current);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([dateKey, sessionsInDate]) => ({
      dateKey,
      dateLabel: formatSessionDateLabel(sessionsInDate[0]?.startsAt ?? `${dateKey}T00:00:00.000Z`, eventTimezone),
      sessions: sessionsInDate,
    }));
}

export function buildAccreditationProgramReadModel(params: {
  event: Pick<Event, "id" | "name" | "eventType" | "operationalModel" | "startAt" | "endAt" | "timezone" | "venue">;
  sessions: AccreditationProgramSession[];
  clock?: () => string;
}): AccreditationProgramReadModel | null {
  if (!isAccreditationPhase2EventType(params.event.eventType)) {
    return null;
  }

  const clock = params.clock ?? nowIso;
  const eventProfile = buildAccreditationEventProfile(params.event, {
    participantCount: params.sessions.length,
    activeParticipantCount: params.sessions.filter((session) => session.status === "active").length,
    cancelledParticipantCount: params.sessions.filter((session) => session.status === "cancelled").length,
  });

  if (!eventProfile) {
    return null;
  }

  const summary: AccreditationProgramSessionSummary = params.sessions.reduce<AccreditationProgramSessionSummary>(
    (accumulator, session) => {
      const lifecycleState = getAccreditationProgramSessionLifecycleState(session, clock);

      accumulator.total += 1;
      accumulator.active += session.status === "active" ? 1 : 0;
      accumulator.cancelled += session.status === "cancelled" ? 1 : 0;
      accumulator.upcoming += lifecycleState === "upcoming" ? 1 : 0;
      accumulator.inProgress += lifecycleState === "in_progress" ? 1 : 0;
      accumulator.completed += lifecycleState === "completed" ? 1 : 0;
      return accumulator;
    },
    {
      total: 0,
      active: 0,
      cancelled: 0,
      upcoming: 0,
      inProgress: 0,
      completed: 0,
    },
  );

  return {
    eventProfile,
    summary,
    dateGroups: groupAccreditationProgramSessions(params.sessions, params.event.timezone, clock),
  };
}
