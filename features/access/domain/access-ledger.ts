import type { Guest } from "@/features/check-in/types";
import type { AccessGrant, AccessGrantStatus, AccessGrantType, Event } from "@/features/domain/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TimelineEvent } from "@/features/timeline/types";

export type AccessGrantLedgerEntry = AccessGrant & {
  code: string;
  qrToken: string;
  guestId: string;
  reservationId: string;
  reservationName: string;
  guestName: string;
  tableName?: string;
  tableId?: string;
  eventName: string;
};

export type AccessGrantResolution = {
  grant: AccessGrantLedgerEntry | null;
  guest: Guest | null;
  reservation: ReservationRecord | null;
  matches: AccessGrantLedgerEntry[];
  reason: string;
  status: "found" | "ambiguous" | "not-found";
};

type AccessGrantState = "active" | "used" | "cancelled" | "expired" | "blocked";

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function hash32(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getAccessGrantIdentity(guest: Pick<Guest, "id" | "accessGrantId">) {
  return guest.accessGrantId ?? guest.id;
}

export function getVisibleInvitationCode(guest: Pick<Guest, "invitationCode" | "accessCode">) {
  return guest.accessCode ?? guest.invitationCode;
}

export function getQrToken(
  guest: Pick<Guest, "id" | "reservationId" | "eventId" | "invitationCode" | "accessCode" | "qrToken">,
) {
  if (guest.qrToken) {
    return guest.qrToken;
  }

  return createAccessGrantToken({
    guestId: guest.id,
    reservationId: guest.reservationId,
    eventId: guest.eventId,
    code: getVisibleInvitationCode(guest),
  });
}

export function createAccessGrantToken(input: {
  guestId: string;
  reservationId: string;
  eventId: string;
  code: string;
}) {
  const seed = ["entryflow", input.guestId, input.reservationId, input.eventId, input.code].join("|");
  return `qr_${hash32(seed)}${hash32(`${seed}|secondary`)}`;
}

function inferState(guest: Guest, reservation?: ReservationRecord | null): AccessGrantState {
  const reservationStatus = reservation?.status ?? guest.reservationStatus;

  if (guest.admissionStatus === "Ingresó" || guest.checkInTime) {
    return "used";
  }

  if (guest.admissionStatus === "Anulada" || reservationStatus === "Cancelled") {
    return "cancelled";
  }

  if (reservationStatus === "No Show") {
    return "expired";
  }

  if (guest.admissionStatus === "Bloqueada") {
    return "blocked";
  }

  return "active";
}

function mapStateToAccessStatus(state: AccessGrantState): AccessGrantStatus {
  if (state === "active") return "active";
  if (state === "used") return "used";
  if (state === "cancelled") return "cancelled";
  if (state === "expired") return "expired";
  return "blocked";
}

function getGrantType(guest: Guest): AccessGrantType {
  if (guest.manualAdmission) {
    return "registration";
  }

  return "invitation";
}

export function buildAccessGrantFromGuest(
  guest: Guest,
  reservation?: ReservationRecord | null,
): AccessGrantLedgerEntry {
  const code = getVisibleInvitationCode(guest);
  const qrToken = getQrToken(guest);
  const state = inferState(guest, reservation);
  const eventReservationId = reservation?.id ?? guest.reservationId;
  const eventReservationName = reservation?.name ?? guest.reservationName;

  return {
    id: guest.accessGrantId ?? guest.id,
    eventId: guest.eventId,
    attendeeId: guest.id,
    code,
    qrToken,
    type: getGrantType(guest),
    status: mapStateToAccessStatus(state),
    validFrom: reservation?.createdAt,
    validUntil: undefined,
    usesAllowed: 1,
    usesConsumed: state === "used" ? 1 : 0,
    resourceAssignments: guest.tableId ? [guest.tableId] : [],
    admissionRules: [],
    source: guest.manualAdmission ? "manual" : "whatsapp",
    metadata: {
      guestName: guest.guestName,
      reservationName: eventReservationName,
      reservationCode: guest.reservationCode,
      tableId: guest.tableId,
      tableName: guest.tableName,
      eventName: guest.eventName,
      eventId: guest.eventId,
      reservationId: eventReservationId,
      accessCode: code,
      qrToken,
      accessState: state,
      manualAdmission: guest.manualAdmission ?? false,
    },
    guestId: guest.id,
    reservationId: guest.reservationId,
    reservationName: eventReservationName,
    guestName: guest.guestName,
    tableName: guest.tableName,
    tableId: guest.tableId,
    eventName: guest.eventName,
  };
}

export function buildAccessGrantTimelineEvent(
  guest: Guest,
  reservation?: ReservationRecord | null,
  timestamp = new Date().toISOString(),
): TimelineEvent {
  const grant = buildAccessGrantFromGuest(guest, reservation);
  const eventTimestamp = timestamp.slice(11, 16);
  const description = guest.manualAdmission
    ? `${guest.guestName} quedó listo para validación manual.`
    : `${guest.guestName} recibió su código y QR operativo.`;

  return {
    id: grant.id,
    eventId: guest.eventId,
    timestamp: eventTimestamp,
    kind: "timeline.note",
    icon: "guest",
    tone: grant.status === "used" ? "success" : grant.status === "blocked" || grant.status === "cancelled" || grant.status === "expired" ? "warning" : "info",
    title: "Acceso generado",
    description,
    reservationId: grant.reservationId,
    reservationCode: guest.reservationCode,
    reservationName: grant.reservationName,
    guestId: guest.id,
    guestName: guest.guestName,
    tableId: guest.tableId,
    tableName: guest.tableName,
    metadata: {
      entryType: "access.grant",
      accessGrantId: grant.id,
      accessType: grant.type,
      status: grant.status,
      code: grant.code,
      qrToken: grant.qrToken,
      usesAllowed: grant.usesAllowed,
      usesConsumed: grant.usesConsumed,
      reservationId: grant.reservationId,
      reservationName: grant.reservationName,
      reservationCode: guest.reservationCode,
      guestId: guest.id,
      guestName: guest.guestName,
      eventId: guest.eventId,
      eventName: guest.eventName,
      tableId: guest.tableId,
      tableName: guest.tableName,
      source: grant.source,
    },
  };
}

export function buildWhatsAppAccessMessage(
  guest: Pick<
    Guest,
    "guestName" | "reservationName" | "reservationCode" | "manualAdmission" | "accessCode" | "qrToken" | "eventName"
  >,
  venueName?: string,
  event?: Pick<Event, "name"> | null,
) {
  const code = guest.accessCode ?? guest.reservationCode;
  const qrToken = guest.qrToken ?? code;
  const eventName = event?.name ?? guest.eventName;
  const venueLabel = venueName ?? eventName;

  return [
    `Hola ${guest.guestName},`,
    `tu acceso para ${eventName} en ${venueLabel} ya está listo.`,
    `Código de acceso: ${code}`,
    `Presentá el código o el QR en la entrada.`,
    `QR: ${qrToken}`,
  ].join("\n");
}

export function resolveAccessGrantByQuery(params: {
  query: string;
  guests: Guest[];
  reservations: ReservationRecord[];
  event?: Event | null;
}) {
  const normalizedQuery = normalizeText(params.query);

  if (!normalizedQuery) {
    return {
      grant: null,
      guest: null,
      reservation: null,
      matches: [],
      reason: "Búsqueda vacía.",
      status: "not-found" as const,
    };
  }

  const guestSource = params.event ? params.guests.filter((guest) => guest.eventId === params.event?.id) : params.guests;
  const candidateEntries = guestSource.map((guest) => {
    const reservation = params.reservations.find((item) => item.id === guest.reservationId) ?? null;
    return {
      guest,
      reservation,
      grant: buildAccessGrantFromGuest(guest, reservation),
    };
  });

  const exactMatches = candidateEntries.filter(({ grant, guest }) => {
    const haystack = [
      grant.qrToken,
      grant.code,
      guest.guestName,
      guest.reservationName,
      guest.reservationCode,
      guest.carnet,
      guest.whatsapp,
      guest.tableName ?? "",
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean);

    return haystack.some((value) => value === normalizedQuery);
  });

  const fuzzyMatches = exactMatches.length
    ? exactMatches
    : candidateEntries.filter(({ grant, guest }) => {
        const haystack = [
          grant.qrToken,
          grant.code,
          guest.guestName,
          guest.reservationName,
          guest.reservationCode,
          guest.carnet,
          guest.whatsapp,
          guest.tableName ?? "",
        ]
          .map((value) => normalizeText(value))
          .join(" ");

        return haystack.includes(normalizedQuery);
      });

  if (!fuzzyMatches.length) {
    return {
      grant: null,
      guest: null,
      reservation: null,
      matches: [],
      reason: "No se encontró un acceso coincidente.",
      status: "not-found" as const,
    };
  }

  if (fuzzyMatches.length > 1) {
    return {
      grant: null,
      guest: null,
      reservation: null,
      matches: fuzzyMatches.map((entry) => entry.grant),
      reason: "La búsqueda coincide con más de un acceso.",
      status: "ambiguous" as const,
    };
  }

  const match = fuzzyMatches[0];

  return {
    grant: match.grant,
    guest: match.guest,
    reservation: match.reservation,
    matches: [match.grant],
    reason: "Acceso resuelto correctamente.",
    status: "found" as const,
  };
}

export function formatAccessGrantStatus(status: AccessGrantStatus) {
  if (status === "active") return "Activo";
  if (status === "used") return "Usado";
  if (status === "cancelled") return "Cancelado";
  if (status === "expired") return "Expirado";
  return "Bloqueado";
}
