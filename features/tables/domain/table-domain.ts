import type { CheckIn, Guest } from "@/features/check-in/types";
import type { ReservationRecord } from "@/features/reservations/types";
import { normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import type {
  TableMetrics,
  TableRecord,
  TableStatus,
  TableSummary,
  TableTone,
} from "@/features/tables/types";

function createTableTone(status: TableStatus): TableTone {
  if (status === "Full") return "warning";
  if (status === "Over Capacity" || status === "Blocked" || status === "Closed") return "danger";
  if (status === "Reserved") return "info";
  return "success";
}

function isActiveReservation(reservation: ReservationRecord) {
  const normalized = normalizeReservationStatus(reservation.status);
  return normalized !== "Cancelled" && normalized !== "No Show";
}

export function normalizeTableStatus(status: string): TableStatus {
  if (
    status === "Available" ||
    status === "Partially Occupied" ||
    status === "Full" ||
    status === "Over Capacity" ||
    status === "Reserved" ||
    status === "Blocked" ||
    status === "Closed"
  ) {
    return status;
  }

  if (status === "Reservada") {
    return "Reserved";
  }

  if (status === "Disponible") {
    return "Available";
  }

  return "Available";
}

export function formatTableStatus(status: TableStatus | string) {
  const normalized = normalizeTableStatus(status);

  if (normalized === "Available") return "Disponible";
  if (normalized === "Partially Occupied") return "Parcial";
  if (normalized === "Full") return "Completa";
  if (normalized === "Over Capacity") return "Sobrecapacidad";
  if (normalized === "Reserved") return "Reservada";
  if (normalized === "Blocked") return "Bloqueada";
  return "Cerrada";
}

function getTableReservations(table: TableRecord, reservations: ReservationRecord[], currentEventId?: string) {
  return reservations.filter((reservation) => {
    if (currentEventId && reservation.eventId !== currentEventId) {
      return false;
    }

    if (table.eventLayoutResourceId && reservation.eventLayoutResourceId === table.eventLayoutResourceId) {
      return true;
    }

    if (table.eventLayoutId && reservation.eventLayoutId === table.eventLayoutId) {
      return reservation.tableId === table.id || reservation.resourceId === table.id;
    }

    return reservation.resourceId === table.id || reservation.tableId === table.id;
  });
}

function getActiveTableReservations(table: TableRecord, reservations: ReservationRecord[], currentEventId?: string) {
  return getTableReservations(table, reservations, currentEventId).filter(isActiveReservation);
}

function sortReservationsByRecency(a: ReservationRecord, b: ReservationRecord) {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt < b.updatedAt ? 1 : -1;
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }

  return a.id.localeCompare(b.id);
}

function getPrimaryTableReservation(table: TableRecord, reservations: ReservationRecord[], currentEventId?: string) {
  return [...getActiveTableReservations(table, reservations, currentEventId)].sort(sortReservationsByRecency)[0] ?? null;
}

export function getPrimaryActiveTableReservation(table: TableRecord, reservations: ReservationRecord[], currentEventId?: string) {
  return getPrimaryTableReservation(table, reservations, currentEventId);
}

function dedupeGuestsById(guests: Guest[]) {
  return Array.from(new Map(guests.map((guest) => [guest.id, guest])).values());
}

function getTableGuests(table: TableRecord, reservations: ReservationRecord[], guests: Guest[], currentEventId?: string) {
  const activeReservations = getActiveTableReservations(table, reservations, currentEventId);
  const primaryReservation = getPrimaryTableReservation(table, reservations, currentEventId);

  if (!primaryReservation) {
    return [];
  }

  const reservationGuestIds = new Set((primaryReservation.guestIds ?? []).filter(Boolean));
  const reservationGuests = guests.filter(
    (guest) => guest.reservationId === primaryReservation.id || reservationGuestIds.has(guest.id),
  );

  if (reservationGuests.length > 0) {
    return dedupeGuestsById(reservationGuests);
  }

  if (activeReservations.length === 1) {
    // Legacy fallback: if the reservation has no guest rows yet, use the table-linked guests only when there is a single active reservation.
    return dedupeGuestsById(guests.filter((guest) => guest.tableId === table.id));
  }

  return [];
}

function deriveTableStatus(table: TableRecord, reservations: ReservationRecord[], guests: Guest[], currentEventId?: string) {
  if (table.closed) {
    return "Closed" as const;
  }

  if (table.status === "Blocked") {
    return "Blocked" as const;
  }

  const tableReservations = getActiveTableReservations(table, reservations, currentEventId);
  const tableGuests = getTableGuests(table, reservations, guests, currentEventId);
  const assignedGuests = tableGuests.length;

  if (!tableReservations.length && !assignedGuests) {
    return normalizeTableStatus(table.status);
  }

  if (!assignedGuests && tableReservations.length > 0) {
    return "Reserved" as const;
  }

  if (assignedGuests > table.capacity) {
    return "Over Capacity" as const;
  }

  if (assignedGuests === table.capacity) {
    return "Full" as const;
  }

  if (assignedGuests > 0) {
    return "Partially Occupied" as const;
  }

  return "Available" as const;
}

export function buildTableMetrics(
  table: TableRecord,
  reservations: ReservationRecord[],
  guests: Guest[],
  checkIns: CheckIn[],
  currentEventId?: string,
): TableMetrics {
  const tableReservations = getActiveTableReservations(table, reservations, currentEventId);
  const tableGuests = getTableGuests(table, reservations, guests, currentEventId);
  const assignedGuests = tableGuests.length;
  const checkedInGuests = tableGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const pendingGuests = tableGuests.filter((guest) => guest.admissionStatus === "Pendiente").length;
  const capacityRemaining = Math.max(table.capacity - assignedGuests, 0);
  const occupancyPercent = Math.round((assignedGuests / Math.max(table.capacity, 1)) * 100);
  const overCapacity = Math.max(assignedGuests - table.capacity, 0);
  const activeReservations = tableReservations.length;

  void checkIns;

  return {
    assignedGuests,
    checkedInGuests,
    pendingGuests,
    capacityRemaining,
    occupancyPercent,
    overCapacity,
    activeReservations,
  };
}

export function buildTableSummary(
  table: TableRecord,
  reservations: ReservationRecord[],
  guests: Guest[],
  checkIns: CheckIn[],
  currentEventId?: string,
): TableSummary {
  const tableReservations = getTableReservations(table, reservations, currentEventId);
  const tableGuests = getTableGuests(table, reservations, guests, currentEventId);
  const status = deriveTableStatus(table, reservations, guests, currentEventId);
  const metrics = buildTableMetrics(table, reservations, guests, checkIns, currentEventId);

  return {
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    location: table.location,
    status,
    statusTone: createTableTone(status),
    metrics,
    reservationIds: tableReservations.map((reservation) => reservation.id),
    guestIds: tableGuests.map((guest) => guest.id),
    reservations: tableReservations.map((reservation) => ({
      id: reservation.id,
      code: reservation.code,
      name: reservation.name,
      status: reservation.status,
    })),
    guests: tableGuests.map((guest) => ({
      id: guest.id,
      name: guest.guestName,
      reservationName: guest.reservationName,
      reservationCode: guest.reservationCode,
      tableId: guest.tableId,
      tableName: guest.tableName,
      admissionStatus: guest.admissionStatus,
      reservationStatus: guest.reservationStatus,
      checkInTime: guest.checkInTime,
      manualAdmission: guest.manualAdmission,
    })),
  };
}

export function buildTableSummaries(
  tables: TableRecord[],
  reservations: ReservationRecord[],
  guests: Guest[],
  checkIns: CheckIn[],
  currentEventId?: string,
) {
  return tables.map((table) => buildTableSummary(table, reservations, guests, checkIns, currentEventId));
}
