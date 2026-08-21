import type { Event as PlatformEvent, Venue } from "@/features/domain/types";
import type { Guest } from "@/features/check-in/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";

function resolveCurrentVenueId(currentEvent: Pick<PlatformEvent, "venueId" | "id">, currentVenue?: Venue | null) {
  return currentVenue?.id ?? currentEvent.venueId ?? undefined;
}

export function isTableInCurrentEventContext(
  table: Pick<TableRecord, "id" | "eventId" | "venueId">,
  currentEvent: Pick<PlatformEvent, "id" | "venueId">,
  currentVenue?: Venue | null,
) {
  const currentVenueId = resolveCurrentVenueId(currentEvent, currentVenue);

  return (
    table.eventId === currentEvent.id ||
    (currentVenueId ? table.venueId === currentVenueId : false)
  );
}

export function assertTableInCurrentEventContext(
  table: TableRecord,
  currentEvent: Pick<PlatformEvent, "id" | "venueId">,
  currentVenue?: Venue | null,
) {
  if (!isTableInCurrentEventContext(table, currentEvent, currentVenue)) {
    throw new Error("La mesa seleccionada no pertenece al evento o venue actual.");
  }

  return table;
}

export function findTableInCurrentEventContext(
  tables: TableRecord[],
  tableId: string,
  currentEvent: Pick<PlatformEvent, "id" | "venueId">,
  currentVenue?: Venue | null,
) {
  const table = tables.find((item) => item.id === tableId);

  if (!table) {
    throw new Error("La mesa seleccionada no pertenece al evento o venue actual.");
  }

  return assertTableInCurrentEventContext(table, currentEvent, currentVenue);
}

export function assertEventWriteOwnership(
  event: Pick<PlatformEvent, "organizationId" | "venueId">,
  currentOrganizationId: string,
  venues: Venue[],
) {
  if (event.organizationId !== currentOrganizationId) {
    throw new Error("No puedes modificar eventos de otra organización.");
  }

  if (!event.venueId) {
    return null;
  }

  const venue = venues.find((item) => item.id === event.venueId);

  if (!venue || venue.organizationId !== currentOrganizationId) {
    throw new Error("El venue seleccionado no pertenece a la organización actual.");
  }

  return venue;
}

export function assertReservationInCurrentEvent(
  reservation: ReservationRecord,
  currentEvent: Pick<PlatformEvent, "id">,
) {
  if (reservation.eventId !== currentEvent.id) {
    throw new Error("La reserva no pertenece al evento activo.");
  }

  return reservation;
}

export function findReservationInCurrentEvent(
  reservations: ReservationRecord[],
  reservationId: string,
  currentEvent: Pick<PlatformEvent, "id">,
) {
  const reservation = reservations.find((item) => item.id === reservationId);

  if (!reservation) {
    throw new Error("La reserva no pertenece al evento activo.");
  }

  return assertReservationInCurrentEvent(reservation, currentEvent);
}

export function assertGuestInCurrentEvent(
  guest: Guest,
  currentEvent: Pick<PlatformEvent, "id">,
  reservations: ReservationRecord[],
) {
  if (guest.eventId !== currentEvent.id) {
    throw new Error("El invitado no pertenece al evento activo.");
  }

  const reservation = reservations.find((item) => item.id === guest.reservationId && item.eventId === currentEvent.id);

  if (!reservation) {
    throw new Error("La reserva del invitado no pertenece al evento activo.");
  }

  return { guest, reservation };
}
