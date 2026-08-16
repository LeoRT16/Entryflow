import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import type { ReservationRecord, ReservationTimelineEntry } from "@/features/reservations/types";
import type { TimelineEvent, TimelineIcon, TimelineKind, TimelineTone } from "@/features/timeline/types";

function timeToMinutes(timestamp: string) {
  const [hours, minutes] = timestamp.split(":").map((value) => Number.parseInt(value, 10));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return -1;
  }

  return hours * 60 + minutes;
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
    },
  };
}

export function buildTimelineQuickReadSummary(event: TimelineEvent) {
  return {
    action: event.title,
    target: event.target ?? event.guestName ?? event.reservationName ?? event.tableName ?? "",
    actorLine: event.actor
      ? event.actorRole
        ? `${event.actor} · ${event.actorRole}`
        : event.actor
      : event.actorRole ?? "",
    context: event.context ?? "",
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
    .sort((a, b) => {
      const timeDelta = timeToMinutes(b.timestamp) - timeToMinutes(a.timestamp);

      if (timeDelta !== 0) {
        return timeDelta;
      }

      return b.id.localeCompare(a.id);
    });
}

export function buildTimelineSummary(events: TimelineEvent[]) {
  const checkedIn = events.filter((event) => event.kind === "checkin.success" || event.kind === "checkin.manual").length;
  const checkedOut = events.filter((event) => event.kind === "checkin.checkout").length;
  const alerts = events.filter((event) => event.kind === "checkin.invalid" || event.kind === "checkin.blocked").length;
  const tableMoves = events.filter((event) => event.kind === "table.assigned" || event.kind === "table.changed").length;
  const reservationsOpened = events.filter((event) => event.kind === "reservation.created").length;

  return {
    total: events.length,
    checkedIn,
    checkedOut,
    alerts,
    tableMoves,
    reservationsOpened,
    latest: events.at(0)?.timestamp ?? "--:--",
  };
}
