import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import type { ReservationRecord, ReservationTimelineEntry } from "@/features/reservations/types";
import type { TimelineEvent, TimelineIcon, TimelineKind, TimelineTone } from "@/features/timeline/types";

function parseTimelineTimestamp(timestamp: string) {
  const trimmed = timestamp.trim();

  if (!trimmed) {
    return Number.NEGATIVE_INFINITY;
  }

  const exactTimeMatch = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (exactTimeMatch) {
    const hours = Number.parseInt(exactTimeMatch[1], 10);
    const minutes = Number.parseInt(exactTimeMatch[2], 10);
    const seconds = exactTimeMatch[3] ? Number.parseInt(exactTimeMatch[3], 10) : 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  const parsed = Date.parse(trimmed);

  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const embeddedTimeMatch = trimmed.match(/(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (embeddedTimeMatch) {
    const hours = Number.parseInt(embeddedTimeMatch[1], 10);
    const minutes = Number.parseInt(embeddedTimeMatch[2], 10);
    const seconds = embeddedTimeMatch[3] ? Number.parseInt(embeddedTimeMatch[3], 10) : 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return Number.NEGATIVE_INFINITY;
}

export function getTimelineTimestampSortValue(timestamp: string) {
  return parseTimelineTimestamp(timestamp);
}

export function compareTimelineTimestampsDescending(a: string, b: string) {
  const delta = getTimelineTimestampSortValue(b) - getTimelineTimestampSortValue(a);

  if (delta !== 0) {
    return delta;
  }

  return b.localeCompare(a);
}

function getTimelineEventSortValue(event: Pick<TimelineEvent, "createdAt" | "timestamp">) {
  if (event.createdAt) {
    const createdAt = Date.parse(event.createdAt);

    if (!Number.isNaN(createdAt)) {
      return createdAt;
    }
  }

  return getTimelineTimestampSortValue(event.timestamp);
}

export function compareTimelineEventsDescending(a: Pick<TimelineEvent, "createdAt" | "timestamp" | "id">, b: Pick<TimelineEvent, "createdAt" | "timestamp" | "id">) {
  const delta = getTimelineEventSortValue(b) - getTimelineEventSortValue(a);

  if (delta !== 0) {
    return delta;
  }

  const timestampDelta = compareTimelineTimestampsDescending(a.timestamp, b.timestamp);

  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return b.id.localeCompare(a.id);
}

export function formatTimelineDisplayTime(timestamp: string) {
  const trimmed = timestamp.trim();

  if (!trimmed) {
    return "--:--";
  }

  if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed.slice(0, 5);
  }

  const parsed = new Date(trimmed);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("es-BO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return trimmed;
}

export function getSecondaryTimelineSectionGridClass(sectionCount: number) {
  return sectionCount > 1 ? "grid gap-4 xl:grid-cols-2" : "grid gap-4";
}

export async function refreshTimelineWorkspace(reloadWorkspace: () => Promise<void>) {
  await reloadWorkspace();
}

function getSuccessfulCheckInMergeKeys(event: Pick<TimelineEvent, "kind" | "eventId" | "guestId" | "reservationId" | "metadata">) {
  if (event.kind !== "checkin.success" && event.kind !== "checkin.manual") {
    return [];
  }

  const checkInId = typeof event.metadata?.checkInId === "string" ? event.metadata.checkInId.trim() : "";
  const eventId = event.eventId ?? "";
  const guestId = event.guestId ?? "";
  const reservationId = event.reservationId ?? "";
  const keys: string[] = [];

  if (checkInId) {
    keys.push(`checkin:${event.kind}:${checkInId}`);
  }

  if (!eventId || !guestId) {
    return keys;
  }

  keys.push(`checkin:${event.kind}:${eventId}:${guestId}:${reservationId}`);
  return keys;
}

export function mergeTimelineEvents(persisted: TimelineEvent[], synthetic: TimelineEvent[]) {
  const persistedSuccessfulKeys = new Set(
    persisted.flatMap((event) => getSuccessfulCheckInMergeKeys(event)),
  );

  const combined: TimelineEvent[] = [...persisted];
  const seenIds = new Set(persisted.map((event) => event.id));

  for (const entry of synthetic) {
    const successKeys = getSuccessfulCheckInMergeKeys(entry);

    if (successKeys.some((key) => persistedSuccessfulKeys.has(key))) {
      continue;
    }

    if (!seenIds.has(entry.id)) {
      combined.push(entry);
      seenIds.add(entry.id);
    }
  }

  return combined.sort(compareTimelineEventsDescending);
}

function readMetadataString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function inferReservationEventMeta(title: string): {
  kind: TimelineKind;
  icon: TimelineIcon;
  tone: TimelineTone;
} {
  const normalized = title.toLowerCase();

  if (normalized.includes("mesa asignada")) {
    return { kind: "table.assigned", icon: "table", tone: "info" };
  }

  if (normalized.includes("mesa cambiada") || normalized.includes("invitado movido")) {
    return { kind: "table.changed", icon: "table", tone: "warning" };
  }

  if (normalized.includes("mesa liberada")) {
    return { kind: "table.released", icon: "table", tone: "warning" };
  }

  if (normalized.includes("mesa cerrada")) {
    return { kind: "table.closed", icon: "table", tone: "danger" };
  }

  if (normalized.includes("invitado agregado") || normalized.includes("invitaciones enviadas")) {
    return { kind: "guest.added", icon: "guest", tone: "info" };
  }

  if (normalized.includes("invitado confirmado")) {
    return { kind: "guest.confirmed", icon: "guest", tone: "success" };
  }

  if (normalized.includes("invitado cancelado") || normalized.includes("invitado rechazado")) {
    return { kind: "guest.cancelled", icon: "guest", tone: "danger" };
  }

  if (normalized.includes("invitado eliminado")) {
    return { kind: "guest.removed", icon: "guest", tone: "warning" };
  }

  if (normalized.includes("ingreso revertido")) {
    return { kind: "guest.reverted", icon: "guest", tone: "warning" };
  }

  if (normalized.includes("reserva creada")) {
    return { kind: "reservation.created", icon: "reservation", tone: "info" };
  }

  return { kind: "reservation.updated", icon: "reservation", tone: "info" };
}

function reservationTimelineToEvent(
  reservation: ReservationRecord,
  entry: ReservationTimelineEntry,
): TimelineEvent {
  const meta = inferReservationEventMeta(entry.title);

  return {
    id: `reservation-${reservation.id}-${entry.id}`,
    eventId: reservation.eventId,
    timestamp: entry.time,
    kind: meta.kind,
    icon: meta.icon,
    tone: meta.tone,
    title: entry.title,
    description: entry.detail,
    reservationId: reservation.id,
    reservationCode: reservation.code,
    reservationName: reservation.name,
    tableId: reservation.tableId,
    tableName: reservation.tableName,
    actor: entry.actor,
    actorRole: entry.actorRole,
    context: entry.context ?? reservation.eventName,
    target: entry.target ?? reservation.name,
  };
}

function checkInToEvent(guest: Guest, checkIn: CheckIn): TimelineEvent {
  if (checkIn.status === "Checked Out") {
    return {
      id: `checkin-${checkIn.id}`,
      createdAt: checkIn.createdAt,
      timestamp: checkIn.checkedOutAt ?? checkIn.checkedInAt,
      kind: "checkin.checkout",
      icon: "checkin",
      tone: "info",
      title: "Check-out registrado",
      description:
        checkIn.notes ??
        `${guest.guestName} salió por ${checkIn.gate ?? guest.gate ?? "principal"}.`,
      eventId: guest.eventId,
      reservationId: guest.reservationId,
      reservationCode: guest.reservationCode,
      reservationName: guest.reservationName,
      guestId: guest.id,
      guestName: guest.guestName,
      tableId: guest.tableId,
      tableName: guest.tableName,
      metadata: {
        guestCarnet: guest.carnet,
        method: checkIn.method,
        gate: checkIn.gate ?? guest.gate,
      },
    };
  }

  const isDangerStatus = checkIn.status === "Rejected" || checkIn.status === "Expired" || checkIn.status === "Cancelled" || checkIn.status === "No Show";
  const isWarningStatus = checkIn.status === "Blocked" || checkIn.status === "Duplicate Attempt" || checkIn.status === "Transferred";
  const tone = isDangerStatus ? "danger" : isWarningStatus ? "warning" : "success";
  const kind =
    checkIn.status === "Duplicate Attempt" || checkIn.status === "Blocked" || checkIn.status === "Transferred"
      ? "checkin.blocked"
      : checkIn.status === "Rejected" || checkIn.status === "Expired" || checkIn.status === "Cancelled" || checkIn.status === "No Show"
        ? "checkin.invalid"
        : checkIn.method === "Manual"
          ? "checkin.manual"
          : "checkin.success";

  return {
    id: `checkin-${checkIn.id}`,
    eventId: guest.eventId,
    createdAt: checkIn.createdAt,
    timestamp: checkIn.checkedInAt,
    kind,
    icon: "checkin",
    tone,
    title:
      checkIn.status === "Duplicate Attempt"
        ? "Segundo intento bloqueado"
        : checkIn.status === "Blocked"
          ? "Ingreso bloqueado"
          : checkIn.status === "Rejected"
            ? "Ingreso rechazado"
            : checkIn.status === "Expired"
              ? "Acceso vencido"
              : checkIn.status === "Cancelled"
                ? "Ingreso cancelado"
                : checkIn.method === "Manual"
                  ? "Check-in manual"
                  : "Check-in exitoso",
    description:
      checkIn.notes ??
      (checkIn.method === "Manual"
        ? `${guest.guestName} ingresó manualmente en ${checkIn.operator}.`
        : `${guest.guestName} validó su ingreso con QR.`),
    reservationId: guest.reservationId,
    reservationCode: guest.reservationCode,
    reservationName: guest.reservationName,
    guestId: guest.id,
    guestName: guest.guestName,
    tableId: guest.tableId,
    tableName: guest.tableName,
    actor: checkIn.actor ?? checkIn.operator,
    actorRole: checkIn.actorRole,
    context: checkIn.context ?? guest.eventName,
    target: checkIn.target ?? guest.guestName,
    metadata: {
      guestCarnet: guest.carnet,
      method: checkIn.method,
      gate: checkIn.gate ?? guest.gate,
    },
  };
}

export function buildCheckInAttemptTimelineEvent(guest: Guest | undefined, attempt: CheckInAttempt): TimelineEvent | null {
  if (attempt.result === "Encontrado") {
    return null;
  }

  if (attempt.result === "No encontrado") {
    return {
      id: `attempt-${attempt.id}`,
      eventId: guest?.eventId ?? attempt.eventId,
      createdAt: attempt.timestamp,
      timestamp: attempt.timestamp,
      kind: "checkin.invalid",
      icon: "alert",
      tone: "danger",
      title: "Código inválido",
      description: "El código no coincide con una invitación activa.",
      guestId: guest?.id,
      guestName: guest?.guestName,
      reservationId: guest?.reservationId,
      reservationCode: guest?.reservationCode,
      reservationName: guest?.reservationName,
      tableId: guest?.tableId,
      tableName: guest?.tableName,
      actor: attempt.actor,
      actorRole: attempt.actorRole,
      context: attempt.context ?? guest?.eventName,
      target: attempt.target ?? guest?.guestName ?? attempt.query,
    };
  }

  return {
    id: `attempt-${attempt.id}`,
    eventId: guest?.eventId ?? attempt.eventId,
    createdAt: attempt.timestamp,
    timestamp: attempt.timestamp,
    kind: "checkin.blocked",
    icon: "alert",
    tone: "warning",
    title:
      attempt.result === "Usado"
        ? "Segundo intento bloqueado"
        : attempt.result === "Anulado"
          ? "Ingreso bloqueado"
          : "Ingreso bloqueado",
    description: attempt.note,
    guestId: guest?.id ?? attempt.guestId,
    guestName: guest?.guestName ?? attempt.guestName,
    reservationId: guest?.reservationId,
    reservationCode: guest?.reservationCode,
    reservationName: guest?.reservationName,
    tableId: guest?.tableId,
    tableName: guest?.tableName,
    actor: attempt.actor,
    actorRole: attempt.actorRole,
    context: attempt.context ?? guest?.eventName,
    target: attempt.target ?? guest?.guestName ?? attempt.query,
    metadata: {
      query: attempt.query,
      method: attempt.method,
      result: attempt.result,
      note: attempt.note,
      accessGrantId: guest?.accessGrantId ?? guest?.id ?? attempt.guestId,
      guestCarnet: guest?.carnet,
    },
  };
}

export function buildTimelineQuickReadSummary(event: TimelineEvent) {
  const guestCarnet = readMetadataString(event.metadata?.guestCarnet);
  const method = readMetadataString(event.metadata?.method);
  const fallbackGuestName =
    readMetadataString(event.metadata?.guestName) || (event.guestId && event.kind.startsWith("checkin") ? readMetadataString(event.target) : "");
  const guestName = event.guestName ?? fallbackGuestName;
  const guestLine = guestName
    ? guestCarnet
      ? `${guestName}\nCarnet · ${guestCarnet}`
      : guestName
    : "";
  const reservationSource = event.tableName ?? event.reservationName ?? readMetadataString(event.metadata?.reservationName);
  const reservationCode = event.reservationCode ?? readMetadataString(event.metadata?.reservationCode);
  const reservationLine = reservationSource && reservationCode
    ? `${reservationSource}\n${reservationCode}`
    : reservationSource || reservationCode;
  const operatorParts = [event.actorRole ?? "", method].filter((value) => value.length > 0);
  const operatorLine = event.actor
    ? operatorParts.length
      ? `${event.actor}\n${operatorParts.join(" · ")}`
      : event.actor
    : operatorParts.join(" · ");

  return {
    action: event.title,
    target: event.target ?? "",
    actorLine: event.actor
      ? event.actorRole
        ? `${event.actor} · ${event.actorRole}`
        : event.actor
      : event.actorRole ?? "",
    context: event.context ?? "",
    guestLine,
    reservationLine,
    operatorLine,
    reason: readMetadataString(event.metadata?.reason),
    description: event.description,
    timestamp: event.timestamp,
  };
}

export function buildTimelineEvents({
  eventId,
  reservations,
  guests,
  checkIns,
  attempts,
}: {
  eventId?: string;
  reservations: ReservationRecord[];
  guests: Guest[];
  checkIns: CheckIn[];
  attempts: CheckInAttempt[];
}) {
  const reservationSource = eventId ? reservations.filter((reservation) => reservation.eventId === eventId) : reservations;
  const guestSource = eventId ? guests.filter((guest) => guest.eventId === eventId) : guests;
  const checkInSource = eventId ? checkIns.filter((checkIn) => checkIn.eventId === eventId) : checkIns;
  const attemptSource = eventId ? attempts.filter((attempt) => attempt.eventId === eventId) : attempts;

  const guestById = new Map(guestSource.map((guest) => [guest.id, guest]));

  const reservationEvents = reservationSource.flatMap((reservation) =>
    reservation.timeline.map((entry) => reservationTimelineToEvent(reservation, entry)),
  );

  const checkInEvents = checkInSource
    .map((checkIn) => {
      const guest = guestById.get(checkIn.guestId);

      if (!guest) {
        return null;
      }

      return checkInToEvent(guest, checkIn);
    })
    .filter((event): event is TimelineEvent => Boolean(event));

  const attemptEvents = attemptSource
    .map((attempt) => {
      const guest = attempt.guestId ? guestById.get(attempt.guestId) : undefined;

      return buildCheckInAttemptTimelineEvent(guest, attempt);
    })
    .filter((event): event is TimelineEvent => Boolean(event));

  return [...reservationEvents, ...checkInEvents, ...attemptEvents]
    .sort(compareTimelineEventsDescending);
}

export function buildTimelineSummary(events: TimelineEvent[]) {
  const checkedIn = events.filter((event) => event.kind === "checkin.success" || event.kind === "checkin.manual").length;
  const checkedOut = events.filter((event) => event.kind === "checkin.checkout").length;
  const alerts = events.filter((event) => event.kind === "checkin.invalid" || event.kind === "checkin.blocked").length;
  const tableMoves = events.filter((event) => event.kind === "table.assigned" || event.kind === "table.changed").length;
  const reservationsOpened = events.filter((event) => event.kind === "reservation.created").length;
  const latestEvent = [...events].sort(compareTimelineEventsDescending)[0];

  return {
    total: events.length,
    checkedIn,
    checkedOut,
    alerts,
    tableMoves,
    reservationsOpened,
    latest: latestEvent?.timestamp ?? "--:--",
  };
}
