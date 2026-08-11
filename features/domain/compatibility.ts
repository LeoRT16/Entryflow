import type {
  AccessGrant,
  AccessGrantStatus,
  AccessGrantType,
  AdmissionAttempt,
  AdmissionMethod,
  AdmissionResult,
  AdmissionStatus,
  ActivityColor,
  ActivityEntry,
  ActivityKind,
  Attendee,
  AttendeeStatus,
  Event,
  EventModule,
  EventStatus,
  EventType,
  OperationalModel,
  Resource,
  ResourceStatus,
  ResourceType,
} from "@/features/domain/types";
import type { Event as LegacyEvent } from "@/features/check-in/types";

export type LegacyReservationLike = {
  id: string;
  eventId?: string;
  status?: string;
  tableId?: string;
  tableName?: string;
  guestIds?: string[];
  createdAt?: string;
  updatedAt?: string;
  source?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type LegacyGuestLike = {
  id: string;
  eventId: string;
  guestName?: string;
  name?: string;
  reservationId?: string;
  reservationCode?: string;
  reservationName?: string;
  email?: string;
  whatsapp?: string;
  carnet?: string;
  admissionStatus?: string;
  reservationStatus?: string;
  manualAdmission?: boolean;
  attention?: string;
  internalNotes?: string;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type LegacyTableLike = {
  id: string;
  eventId?: string;
  name: string;
  capacity: number;
  status?: string;
  parentResourceId?: string;
  closed?: boolean;
  metadata?: Record<string, unknown>;
};

export type LegacyCheckInLike = {
  id: string;
  eventId: string;
  reservationId: string;
  guestId: string;
  method?: string;
  checkedInAt: string;
  operator?: string;
  status?: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

export type LegacyTimelineEntryLike = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone?: ActivityColor;
  reservationId?: string;
  attendeeId?: string;
  accessGrantId?: string;
  resourceId?: string;
  admissionAttemptId?: string;
  metadata?: Record<string, unknown>;
};

export type { AccessGrant, AccessGrantStatus, AccessGrantType, AdmissionAttempt, AdmissionMethod, AdmissionResult, AdmissionStatus, ActivityColor, ActivityEntry, ActivityKind, Attendee, AttendeeStatus, Event, EventModule, EventStatus, EventType, OperationalModel, Resource, ResourceStatus, ResourceType };

function normalizeActivityColor(color?: string): ActivityColor {
  if (color === "info" || color === "success" || color === "warning" || color === "danger") {
    return color;
  }

  return "neutral";
}

function inferAttendeeStatus(status?: string, manualAdmission?: boolean): AttendeeStatus {
  if (manualAdmission) {
    return "confirmed";
  }

  if (status === "Ingresó") {
    return "checked-in";
  }

  if (status === "Anulada") {
    return "cancelled";
  }

  if (status === "Bloqueada") {
    return "blocked";
  }

  if (status === "Confirmada" || status === "Confirmed") {
    return "confirmed";
  }

  return "pending";
}

function inferAccessGrantStatus(status?: string): AccessGrantStatus {
  if (status === "Confirmed" || status === "Ingresó" || status === "Checked In") {
    return "active";
  }

  if (status === "Checked In" || status === "Checked Out" || status === "Completed" || status === "Duplicate Attempt") {
    return "used";
  }

  if (status === "Cancelled" || status === "Anulada") {
    return "cancelled";
  }

  if (status === "No Show" || status === "Expired") {
    return "expired";
  }

  if (status === "Bloqueada" || status === "Blocked" || status === "Rejected") {
    return "blocked";
  }

  return "draft";
}

function inferResourceStatus(status?: string, closed?: boolean): ResourceStatus {
  if (closed) {
    return "Closed";
  }

  if (status === "Over Capacity") {
    return "Over Capacity";
  }

  if (status === "Full") {
    return "Full";
  }

  if (status === "Partially Occupied") {
    return "Partially Occupied";
  }

  if (status === "Reserved") {
    return "Reserved";
  }

  if (status === "Available") {
    return "Available";
  }

  return "Available";
}

function inferAdmissionStatus(status?: string, manualAdmission?: boolean): AdmissionStatus {
  if (manualAdmission) {
    return "manual";
  }

  if (status === "Ingresó" || status === "Checked In" || status === "Checked Out" || status === "Confirmed") {
    return "success";
  }

  if (status === "Anulada" || status === "Cancelled") {
    return "cancelled";
  }

  if (status === "Bloqueada" || status === "Blocked" || status === "Expired") {
    return "blocked";
  }

  if (status === "Usado" || status === "Duplicate Attempt") {
    return "already-used";
  }

  if (status === "No encontrado" || status === "Rejected") {
    return "invalid";
  }

  return "denied";
}

function inferActivityKind(title: string): ActivityKind {
  const normalized = title.toLowerCase();

  if (normalized.includes("reserva creada")) return "reservation.created";
  if (normalized.includes("cancel")) return "reservation.cancelled";
  if (normalized.includes("invitado agregado")) return "attendee.added";
  if (normalized.includes("invitado confirmado")) return "attendee.confirmed";
  if (normalized.includes("invitado cancelado") || normalized.includes("invitado rechazado")) return "attendee.cancelled";
  if (normalized.includes("check-out") || normalized.includes("checkout") || normalized.includes("salida")) return "access.used";
  if (normalized.includes("mesa asignada")) return "resource.assigned";
  if (normalized.includes("mesa cambiada")) return "resource.changed";
  if (normalized.includes("mesa liberada")) return "resource.released";
  if (normalized.includes("check-in manual")) return "admission.manual";
  if (normalized.includes("check-in exitoso") || normalized.includes("invitado ingresó")) return "admission.success";
  if (normalized.includes("código inválido")) return "admission.denied";
  if (normalized.includes("segundo intento")) return "admission.blocked";
  return "timeline.note";
}

function inferEventType(name: string): EventType {
  const normalized = name.toLowerCase();

  if (normalized.includes("conciert")) return "concert";
  if (normalized.includes("festival")) return "festival";
  if (normalized.includes("corpor")) return "corporate";
  if (normalized.includes("semin")) return "seminar";
  if (normalized.includes("taller")) return "workshop";
  if (normalized.includes("teatro") || normalized.includes("obra")) return "theatre";
  if (normalized.includes("deport")) return "sports";
  if (normalized.includes("priv")) return "private";
  return "nightlife";
}

function inferOperationalModel(eventType: EventType): OperationalModel {
  if (eventType === "concert" || eventType === "festival" || eventType === "sports") {
    return "general-admission";
  }

  if (eventType === "corporate" || eventType === "conference" || eventType === "seminar" || eventType === "workshop") {
    return "reserved";
  }

  if (eventType === "private") {
    return "guest-list";
  }

  return "mixed";
}

export function mapLegacyReservationToAccessGrant(reservation: LegacyReservationLike): AccessGrant {
  return {
    id: reservation.id,
    eventId: reservation.eventId ?? "legacy-event",
    type: "reservation",
    status: inferAccessGrantStatus(reservation.status),
    usesAllowed: Math.max(reservation.guestIds?.length ?? 0, 1),
    usesConsumed: 0,
    resourceAssignments: reservation.tableId ? [reservation.tableId] : [],
    admissionRules: [],
    source: "reservation",
    metadata: reservation.metadata ?? {
      legacyTableName: reservation.tableName,
      legacyStatus: reservation.status,
      legacyNotes: reservation.notes,
      legacyCreatedAt: reservation.createdAt,
      legacyUpdatedAt: reservation.updatedAt,
    },
  };
}

export function mapLegacyEventToEvent(
  event: {
    id: string;
    name: string;
    status: "En curso" | "Próximo";
    date: string;
    startsAt: string;
    expectedGuests: number;
    checkedIn: number;
    pending: number;
    reservations: number;
    attention: number;
  },
  organizationId = "la-rota-carlota",
): Event {
  const eventType = inferEventType(event.name);
  const operationalModel = inferOperationalModel(eventType);

  return {
    id: event.id,
    organizationId,
    name: event.name,
    description: `Evento de tipo ${eventType}.`,
    eventType,
    status: event.status === "En curso" ? "live" : "published",
    startAt: `${event.date} ${event.startsAt}`,
    endAt: undefined,
    timezone: "America/La_Paz",
    venue: "La Rota Carlota",
    capacity: event.expectedGuests,
    enabledModules:
      eventType === "concert"
        ? ["overview", "access", "attendees", "admission", "operations", "activity", "analytics", "notifications"]
        : eventType === "private"
          ? ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "notifications"]
          : ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "analytics", "notifications"],
    operationalModel,
    admissionMethods: eventType === "concert" || eventType === "festival" || eventType === "sports"
      ? ["qr", "code", "manual", "ticket", "credential"]
      : ["qr", "code", "manual", "list", "invitation"],
    resourceTypes:
      eventType === "concert"
        ? ["zone", "area"]
        : eventType === "theatre"
          ? ["seat", "zone", "box"]
          : eventType === "corporate"
            ? ["room", "table", "booth"]
            : eventType === "conference" || eventType === "seminar" || eventType === "workshop"
              ? ["room", "zone"]
              : eventType === "festival"
                ? ["zone", "area"]
                : eventType === "sports"
                  ? ["seat", "zone", "box"]
                  : eventType === "private"
                    ? ["table", "zone", "area"]
                    : ["table", "zone", "area"],
    icon:
      eventType === "concert"
        ? "music"
        : eventType === "festival"
          ? "spark"
          : eventType === "corporate"
            ? "briefcase"
            : eventType === "conference" || eventType === "seminar" || eventType === "workshop"
              ? "presentation"
              : eventType === "theatre"
                ? "theatre"
                : eventType === "sports"
                  ? "trophy"
                  : "moon",
    metadata: {
      legacyStatus: event.status,
      legacyCheckedIn: event.checkedIn,
      legacyPending: event.pending,
      legacyReservations: event.reservations,
      legacyAttention: event.attention,
    },
  };
}

export function mapEventToLegacyEvent(
  event: Event,
  metrics?: {
    expectedGuests?: number;
    checkedIn?: number;
    pending?: number;
    reservations?: number;
    attention?: number;
  },
): LegacyEvent {
  return {
    id: event.id,
    name: event.name,
    status: event.status === "live" ? "En curso" : "Próximo",
    date: event.startAt.split(" ")[0] ?? "",
    startsAt: event.startAt.split(" ").at(-1) ?? "21:00",
    expectedGuests: metrics?.expectedGuests ?? 0,
    checkedIn: metrics?.checkedIn ?? 0,
    pending: metrics?.pending ?? 0,
    reservations: metrics?.reservations ?? 0,
    attention: metrics?.attention ?? 0,
  };
}

export function mapLegacyGuestToAttendee(guest: LegacyGuestLike): Attendee {
  const name = guest.guestName ?? guest.name ?? "Invitado";

  return {
    id: guest.id,
    eventId: guest.eventId,
    name,
    firstName: name.split(" ")[0] ?? name,
    lastName: name.split(" ").slice(1).join(" ") || undefined,
    email: guest.email,
    phone: guest.whatsapp,
    document: guest.carnet,
    status: inferAttendeeStatus(guest.admissionStatus ?? guest.reservationStatus, guest.manualAdmission),
    tags: guest.tags ?? [],
    notes: guest.notes ?? guest.internalNotes,
    metadata: guest.metadata ?? {
      legacyReservationId: guest.reservationId,
      legacyReservationCode: guest.reservationCode,
      legacyReservationName: guest.reservationName,
      legacyManualAdmission: guest.manualAdmission ?? false,
      legacyAttention: guest.attention,
    },
  };
}

export function mapLegacyTableToResource(table: LegacyTableLike): Resource {
  const timestamp = typeof table.metadata?.createdAt === "string" ? table.metadata.createdAt : new Date().toISOString();

  return {
    id: table.id,
    venueId: typeof table.metadata?.venueId === "string" ? table.metadata.venueId : table.eventId ?? "legacy-venue",
    sectorId: typeof table.metadata?.sectorId === "string" ? table.metadata.sectorId : undefined,
    type: "table",
    name: table.name,
    capacity: table.capacity,
    status: inferResourceStatus(table.status, table.closed),
    order: typeof table.metadata?.order === "number" ? table.metadata.order : 0,
    notes: typeof table.metadata?.notes === "string" ? table.metadata.notes : undefined,
    metadata: table.metadata,
    createdAt: timestamp,
    updatedAt: typeof table.metadata?.updatedAt === "string" ? table.metadata.updatedAt : timestamp,
  };
}

export function mapLegacyCheckInToAdmissionAttempt(checkIn: LegacyCheckInLike): AdmissionAttempt {
  const status = inferAdmissionStatus(checkIn.status, checkIn.method === "Manual");

  return {
    id: checkIn.id,
    eventId: checkIn.eventId,
    accessGrantId: checkIn.reservationId,
    attendeeId: checkIn.guestId,
    method: (checkIn.method?.toLowerCase() as AdmissionMethod) ?? "qr",
    query: checkIn.guestId,
    timestamp: checkIn.checkedInAt,
    status,
    result: status,
    note: checkIn.note ?? checkIn.operator ?? "Ingreso registrado",
    metadata: checkIn.metadata,
  };
}

export function mapLegacyCheckInToAdmissionResult(checkIn: LegacyCheckInLike): AdmissionResult {
  const status = inferAdmissionStatus(checkIn.status, checkIn.method === "Manual");

  return {
    id: checkIn.id,
    eventId: checkIn.eventId,
    accessGrantId: checkIn.reservationId,
    attendeeId: checkIn.guestId,
    method: (checkIn.method?.toLowerCase() as AdmissionMethod) ?? "qr",
    status,
    performedAt: checkIn.checkedInAt,
    operator: checkIn.operator,
    note: checkIn.note,
    metadata: checkIn.metadata,
  };
}

export function mapLegacyTimelineEntryToActivity(
  entry: LegacyTimelineEntryLike,
  eventId: string,
): ActivityEntry {
  return {
    id: entry.id,
    eventId,
    timestamp: entry.time,
    kind: inferActivityKind(entry.title),
    icon:
      entry.title.toLowerCase().includes("mesa")
        ? "table"
        : entry.title.toLowerCase().includes("check-in") || entry.title.toLowerCase().includes("ingreso")
          ? "checkin"
          : entry.title.toLowerCase().includes("invit")
            ? "guest"
            : "reservation",
    color: normalizeActivityColor(entry.tone),
    title: entry.title,
    description: entry.detail,
    reservationId: entry.reservationId,
    attendeeId: entry.attendeeId,
    accessGrantId: entry.accessGrantId,
    resourceId: entry.resourceId,
    admissionAttemptId: entry.admissionAttemptId,
    metadata: entry.metadata,
  };
}
