import { guestRecords as customerGuestRecords } from "@/features/customers/mock/customers";
import { todayEvent } from "@/lib/mock-data";
import type { Event, Guest, QrStatus } from "@/features/check-in/types";

function toEventId(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function toQrStatus(guest: (typeof customerGuestRecords)[number]): QrStatus {
  if (guest.admissionStatus === "Ingresó") {
    return "Usado";
  }

  if (guest.admissionStatus === "Bloqueada") {
    return "Bloqueado";
  }

  if (guest.admissionStatus === "Anulada") {
    return "Anulado";
  }

  if (guest.noInvitationSent || guest.deliveryStatus === "Fallida") {
    return "Inexistente";
  }

  return "Válido";
}

export const checkInEvents: Event[] = [
  {
    id: toEventId(todayEvent.name),
    name: todayEvent.name,
    status: "En curso",
    date: todayEvent.date,
    startsAt: todayEvent.startsAt,
    expectedGuests: todayEvent.expectedGuests,
    checkedIn: todayEvent.checkedIn,
    pending: Math.max(todayEvent.expectedGuests - todayEvent.checkedIn, 0),
    reservations: todayEvent.reservations,
    attention: 6,
  },
  {
    id: "viernes-retro",
    name: "Viernes Retro",
    status: "Próximo",
    date: "15 de agosto de 2026",
    startsAt: "21:30",
    expectedGuests: 180,
    checkedIn: 0,
    pending: 180,
    reservations: 0,
    attention: 4,
  },
  {
    id: "fiesta-blanca",
    name: "Fiesta Blanca",
    status: "Próximo",
    date: "22 de agosto de 2026",
    startsAt: "22:00",
    expectedGuests: 220,
    checkedIn: 0,
    pending: 220,
    reservations: 0,
    attention: 2,
  },
];

export const checkInGuests: Guest[] = customerGuestRecords.map((guest) => {
  const eventId = toEventId(guest.eventName);

  return {
    ...guest,
    reservationId: guest.reservationCode,
    eventId,
    qrStatus: toQrStatus(guest),
  };
});

