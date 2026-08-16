import type { Event as LegacyEvent, Guest, CheckInMethod, EntryStatus } from "@/features/check-in/types";
import type { Event as PlatformEvent } from "@/features/domain/types";
import type { ReservationRecord } from "@/features/reservations/types";
import { resolveAccessGrantByQuery } from "@/features/access/domain/access-ledger";
import { normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import type { ReservationSummary } from "@/features/reservations/types";
import type { TableSummary } from "@/features/tables/types";
import { buildGuestSearchIndex, normalizeCheckInText } from "@/features/check-in/utils";

export function getEntryTone(status: EntryStatus | ReservationSummary["status"] | Guest["deliveryStatus"] | string) {
  const normalizedReservationStatus = normalizeReservationStatus(status);

  if (status === "Ingresó" || status === "Checked In" || status === "Checked Out" || status === "Enviada" || status === "Reenviada" || status === "Vista" || normalizedReservationStatus === "Confirmed" || normalizedReservationStatus === "Checked In" || normalizedReservationStatus === "Completed") {
    return "success" as const;
  }

  if (status === "Pendiente" || status === "Pending" || status === "Pendiente de envío" || normalizedReservationStatus === "Pending" || normalizedReservationStatus === "Draft") {
    return "warning" as const;
  }

  if (status === "Anulada" || status === "Cancelled" || status === "Bloqueada" || status === "Blocked" || status === "Rejected" || status === "Expired" || status === "Fallida" || normalizedReservationStatus === "Cancelled" || normalizedReservationStatus === "No Show") {
    return "danger" as const;
  }

  return "info" as const;
}

export function searchGuests(guests: Guest[], query: string) {
  const normalizedQuery = normalizeCheckInText(query);

  if (!normalizedQuery) {
    return guests;
  }

  return guests.filter((guest) => buildGuestSearchIndex(guest).includes(normalizedQuery));
}

type GuestQuickReadSource = {
  guestName: string;
  carnet: string;
  reservationName: string;
  reservationCode: string;
  tableName?: string;
  seat?: string;
  admissionStatus: string;
  deliveryStatus?: string;
  checkInTime?: string;
  accessCode?: string;
  invitationCode: string;
  qrStatus?: string;
};

export function buildGuestQuickReadSummary(guest: GuestQuickReadSource) {
  const space = guest.tableName ?? guest.seat ?? "Sin mesa";
  const visibleCode = guest.accessCode ?? guest.invitationCode;

  return {
    name: guest.guestName,
    carnet: guest.carnet,
    reservation: `${guest.reservationCode} · ${guest.reservationName}`,
    space,
    entryStatus: guest.admissionStatus,
    accessStatus:
      guest.qrStatus ??
      (guest.admissionStatus === "Ingresó"
        ? "Usado"
        : guest.admissionStatus === "Bloqueada"
          ? "Bloqueado"
          : guest.admissionStatus === "Anulada"
            ? "Anulado"
            : "Válido"),
    deliveryStatus: guest.deliveryStatus,
    checkInTime: guest.checkInTime,
    visibleCode,
  };
}

export function resolveCheckInGuestByQuery(params: {
  query: string;
  guests: Guest[];
  reservations: ReservationRecord[];
  event: PlatformEvent | null;
}) {
  const normalizedQuery = normalizeCheckInText(params.query);

  if (!normalizedQuery) {
    return null;
  }

  const accessResolution = resolveAccessGrantByQuery({
    query: params.query,
    guests: params.guests,
    reservations: params.reservations,
    event: params.event,
  });

  if (accessResolution.status === "found") {
    return accessResolution.guest;
  }

  const matches = searchGuests(params.guests, params.query);

  return matches.length === 1 ? matches[0] : null;
}

export function buildReservations(guests: Guest[], activeEvent: PlatformEvent): Array<{
  id: string;
  code: string;
  name: string;
  eventId: string;
  eventName: string;
  tableId?: string;
  tableName: string;
  guestIds: string[];
  guestCount: number;
  checkedInCount: number;
  pendingCount: number;
  status: string;
  source: string;
  time: string;
  tone: "success" | "warning" | "danger" | "info";
}> {
  const grouped = new Map<string, Guest[]>();

  for (const guest of guests.filter((item) => item.eventId === activeEvent.id)) {
    const key = guest.reservationCode;
    const current = grouped.get(key) ?? [];
    current.push(guest);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([code, reservationGuests]) => {
      const representative = reservationGuests[0];
      const checkedInCount = reservationGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
      const pendingCount = Math.max(reservationGuests.length - checkedInCount, 0);
      const status = representative?.reservationStatus ?? "Confirmed";
      const tone = getEntryTone(status);

      return {
        id: code,
        code,
        name: representative?.reservationName ?? code,
        eventId: activeEvent.id,
        eventName: activeEvent.name,
        tableId: representative?.tableId,
        tableName: representative?.tableName ?? "Sin mesa",
        guestIds: reservationGuests.map((guest) => guest.id),
        guestCount: reservationGuests.length,
        checkedInCount,
        pendingCount,
        status,
        source: representative?.manualAdmission ? "Recepción" : representative?.attention ? "Operación" : "WhatsApp",
        time: representative?.checkInTime ?? reservationGuests[0]?.deliveryHistory.at(-1)?.time ?? "18:53",
        tone,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildDashboardSnapshot(
  currentEvent: PlatformEvent,
  guests: Guest[],
  reservations: ReservationSummary[],
  tables: TableSummary[] = [],
) {
  const checkedIn = guests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const expectedGuests = guests.length;
  const pending = Math.max(expectedGuests - checkedIn, 0);
  const attention = guests.filter((guest) => Boolean(guest.attention)).length;
  const reservationsCount = reservations.length;
  const activeTables = tables.filter((table) => table.status !== "Closed").length;
  const fullTables = tables.filter((table) => table.status === "Full").length;
  const availableTables = tables.filter((table) => table.metrics.capacityRemaining > 0 && table.status !== "Closed").length;
  const overCapacityTables = tables.filter((table) => table.status === "Over Capacity").length;
  const occupancyGeneral = Math.round(
    tables.reduce((accumulator, table) => accumulator + table.metrics.occupancyPercent, 0) /
      Math.max(tables.length, 1),
  );

  const summaryMetrics = [
    {
      label: "Evento actual",
      value: currentEvent.name,
      detail: formatEventType(currentEvent.eventType),
      tone: "info" as const,
    },
    {
      label: "Reservas",
      value: `${reservationsCount}`,
      detail: "Agrupadas para el evento activo",
      tone: "warning" as const,
    },
    {
      label: "Ingresados",
      value: `${checkedIn}`,
      detail: `${Math.round((checkedIn / Math.max(expectedGuests, 1)) * 100)}% del total esperado`,
      tone: "success" as const,
    },
    {
      label: "Mesas activas",
      value: `${activeTables}`,
      detail: `${availableTables} con capacidad libre · ${fullTables} completas · ${overCapacityTables} con sobrecupo`,
      tone: "info" as const,
    },
    {
      label: "Capacidad disponible",
      value: `${tables.reduce((accumulator, table) => accumulator + table.metrics.capacityRemaining, 0)}`,
      detail: `Promedio de ocupación ${occupancyGeneral}%`,
      tone: "success" as const,
    },
    {
      label: "Atención",
      value: `${attention}`,
      detail: "Invitados o reservas que requieren seguimiento",
      tone: "danger" as const,
    },
  ];

  const recentReservations = [...reservations].slice(0, 6).map((reservation) => ({
    guest: reservation.name,
    event: reservation.eventName,
    time: reservation.time,
    guests: reservation.metrics.guestCount,
    status: reservation.metrics.checkedInGuests > 0 ? "Ingresado" : reservation.status,
    tone: reservation.metrics.checkedInGuests > 0 ? ("info" as const) : reservation.statusTone,
    source: reservation.paymentStatus,
  }));

  const currentEventSnapshot: LegacyEvent = {
    id: currentEvent.id,
    name: currentEvent.name,
    status: currentEvent.status === "live" ? "En curso" : "Próximo",
    date: currentEvent.startAt.split(" ")[0] ?? "",
    startsAt: currentEvent.startAt.split(" ").at(-1) ?? "21:00",
    expectedGuests,
    checkedIn,
    pending,
    reservations: reservationsCount,
    attention,
  };

  return {
    activeEvent: currentEventSnapshot,
    currentEvent: currentEventSnapshot,
    summaryMetrics,
    recentReservations,
    currentEventSummary: {
      name: currentEvent.name,
      date: currentEvent.startAt.split(" ")[0] ?? "",
      startsAt: currentEvent.startAt.split(" ").at(-1) ?? "21:00",
      reservations: reservationsCount,
      expectedGuests,
      checkedIn,
      pending,
    },
    eventStats: {
      [currentEvent.id]: {
        expectedGuests,
        checkedIn,
        pending,
        attention,
      },
      [currentEvent.name]: {
        expectedGuests,
        checkedIn,
        pending,
        attention,
      },
    },
  };
}

function formatEventType(eventType: PlatformEvent["eventType"]) {
  if (eventType === "nightlife") return "Boliche";
  if (eventType === "concert") return "Concierto";
  if (eventType === "festival") return "Festival";
  if (eventType === "corporate") return "Corporativo";
  if (eventType === "conference") return "Conferencia";
  if (eventType === "seminar") return "Seminario";
  if (eventType === "workshop") return "Taller";
  if (eventType === "theatre") return "Teatro / Obra";
  if (eventType === "sports") return "Deportivo";
  if (eventType === "private") return "Privado";
  return "Personalizado";
}

export function createCheckInAttemptNote(result: CheckInMethod, status: EntryStatus | null) {
  if (result === "Manual") {
    return status === "Ingresó" ? "Ingreso manual registrado" : "Registro manual pendiente";
  }

  return status === "Ingresó" ? "QR validado" : "Escaneo revisado";
}
