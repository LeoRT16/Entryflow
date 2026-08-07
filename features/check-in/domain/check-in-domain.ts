import type { Event, Guest, Reservation, CheckInMethod, EntryStatus } from "@/features/check-in/types";
import { buildGuestSearchIndex, normalizeCheckInText } from "@/features/check-in/utils";

export function getEntryTone(status: EntryStatus | Reservation["status"] | Guest["deliveryStatus"] | string) {
  if (status === "Ingresó" || status === "Enviada" || status === "Reenviada" || status === "Vista" || status === "Confirmada") {
    return "success" as const;
  }

  if (status === "Pendiente" || status === "Pendiente de envío" || status === "Pendientes de pago" || status === "Pago parcial") {
    return "warning" as const;
  }

  if (status === "Anulada" || status === "Bloqueada" || status === "Fallida" || status === "Cancelada") {
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

export function buildReservations(guests: Guest[], activeEvent: Event): Reservation[] {
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
      const status = representative?.reservationStatus ?? "Confirmada";
      const tone = getEntryTone(status);

      return {
        id: code,
        code,
        name: representative?.reservationName ?? code,
        eventId: activeEvent.id,
        eventName: activeEvent.name,
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

export function buildDashboardSnapshot(guests: Guest[], events: Event[], activeEventId = events[0]?.id ?? "") {
  const activeEvent = events.find((event) => event.id === activeEventId) ?? events[0];
  const activeGuests = guests.filter((guest) => guest.eventId === activeEvent.id);
  const checkedIn = activeGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const expectedGuests = activeGuests.length;
  const pending = Math.max(expectedGuests - checkedIn, 0);
  const attention = activeGuests.filter((guest) => Boolean(guest.attention)).length;

  const summaryMetrics = [
    {
      label: "Próximos eventos",
      value: `${Math.max(events.length - 1, 0)}`,
      detail: "Contexto operativo compartido en memoria",
      tone: "info" as const,
    },
    {
      label: "Reservas de hoy",
      value: `${buildReservations(guests, activeEvent).length}`,
      detail: "Agrupadas por reserva y evento activo",
      tone: "warning" as const,
    },
    {
      label: "Invitados esperados",
      value: `${expectedGuests}`,
      detail: `En ${activeEvent.name}`,
      tone: "success" as const,
    },
    {
      label: "Ingresados",
      value: `${checkedIn}`,
      detail: `${Math.round((checkedIn / Math.max(expectedGuests, 1)) * 100)}% del total esperado`,
      tone: "success" as const,
    },
  ];

  const recentReservations = buildReservations(guests, activeEvent).slice(0, 6).map((reservation) => ({
    guest: reservation.name,
    event: reservation.eventName,
    time: reservation.time,
    guests: reservation.guestCount,
    status:
      reservation.checkedInCount > 0
        ? "Ingresado"
        : reservation.status,
    tone: reservation.checkedInCount > 0 ? "info" as const : reservation.tone,
    source: reservation.source,
  }));

  const todayEvent = {
    name: activeEvent.name,
    date: activeEvent.date,
    startsAt: activeEvent.startsAt,
    reservations: buildReservations(guests, activeEvent).length,
    expectedGuests,
    checkedIn,
    pending,
  };

  return {
    activeEvent: {
      ...activeEvent,
      checkedIn,
      pending,
      reservations: todayEvent.reservations,
      attention,
      expectedGuests,
    },
    summaryMetrics,
    recentReservations,
    todayEvent,
    eventStats: {
      [activeEvent.name]: {
        expectedGuests,
        checkedIn,
        pending,
        attention,
      },
    },
  };
}

export function createCheckInAttemptNote(result: CheckInMethod, status: EntryStatus | null) {
  if (result === "Manual") {
    return status === "Ingresó" ? "Ingreso manual registrado" : "Registro manual pendiente";
  }

  return status === "Ingresó" ? "QR validado" : "Escaneo revisado";
}
