import type { Guest } from "@/features/check-in/types";
import type { ReservationRecord } from "@/features/reservations/types";
import { tableOptions, tableReservationSeeds } from "@/features/tables/mock/tables";
import type { TableRecord } from "@/features/tables/types";

type BuildTableStateInput = {
  reservations: ReservationRecord[];
  guests: Guest[];
  activeEventId: string;
};

function cloneTables(activeEventId: string) {
  const timestamp = new Date().toISOString();

  return tableOptions.map<TableRecord>((table, index) => ({
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    location: table.location,
    status: table.status,
    venueId: table.venueId ?? "venue-la-rota-carlota",
    sectorId: table.sectorId ?? undefined,
    type: "table",
    order: index + 1,
    notes: undefined,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    eventId: activeEventId,
    reservationIds: [],
    guestIds: [],
    closed: table.status === "Closed",
  }));
}

export function buildInitialTableState({ reservations, guests, activeEventId }: BuildTableStateInput) {
  const tables = cloneTables(activeEventId);
  const reservationMap = new Map(reservations.map((reservation) => [reservation.code, reservation] as const));
  const nextReservations = reservations.map((reservation) => ({ ...reservation }));
  const nextGuests = guests.map((guest) => ({ ...guest }));

  for (const seed of tableReservationSeeds) {
    const table = tables.find((item) => item.id === seed.tableId);
    const reservation = reservationMap.get(seed.reservationCode);

    if (!table || !reservation) {
      continue;
    }

    table.reservationIds.push(reservation.id);
    reservation.tableId = table.id;
    reservation.tableName = table.name;

    nextGuests.forEach((guest) => {
      if (guest.reservationCode !== reservation.code) {
        return;
      }

      guest.tableId = table.id;
      guest.tableName = table.name;
      table.guestIds.push(guest.id);
    });
  }

  return {
    tables,
    reservations: nextReservations,
    guests: nextGuests,
  };
}
