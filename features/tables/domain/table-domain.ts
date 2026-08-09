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
  if (status === "Over Capacity" || status === "Closed") return "danger";
  if (status === "Reserved") return "info";
  return "success";
}

export function normalizeTableStatus(status: string): TableStatus {
  if (
    status === "Available" ||
    status === "Partially Occupied" ||
    status === "Full" ||
    status === "Over Capacity" ||
    status === "Reserved" ||
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
  return "Cerrada";
}

function getTableReservations(table: TableRecord, reservations: ReservationRecord[]) {
  return reservations.filter((reservation) => reservation.tableId === table.id);
}

function getTableGuests(table: TableRecord, reservations: ReservationRecord[], guests: Guest[]) {
  const reservationIds = new Set(getTableReservations(table, reservations).map((reservation) => reservation.id));

  return guests.filter(
    (guest) =>
      guest.tableId === table.id ||
      (reservationIds.has(guest.reservationId) && !guest.tableId),
  );
}

function deriveTableStatus(
  table: TableRecord,
  reservations: ReservationRecord[],
  guests: Guest[],
) {
  if (table.closed) {
    return "Closed" as const;
  }

  const tableReservations = getTableReservations(table, reservations);
  const tableGuests = getTableGuests(table, reservations, guests);
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
): TableMetrics {
  const tableReservations = getTableReservations(table, reservations);
  const tableGuests = getTableGuests(table, reservations, guests);
  const assignedGuests = tableGuests.length;
  const checkedInGuests = tableGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const pendingGuests = tableGuests.filter((guest) => guest.admissionStatus === "Pendiente").length;
  const capacityRemaining = Math.max(table.capacity - assignedGuests, 0);
  const occupancyPercent = Math.round((assignedGuests / Math.max(table.capacity, 1)) * 100);
  const overCapacity = Math.max(assignedGuests - table.capacity, 0);
  const activeReservations = tableReservations.filter(
    (reservation) =>
      normalizeReservationStatus(reservation.status) !== "Cancelled" &&
      normalizeReservationStatus(reservation.status) !== "No Show",
  ).length;

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
): TableSummary {
  const tableReservations = getTableReservations(table, reservations);
  const tableGuests = getTableGuests(table, reservations, guests);
  const status = deriveTableStatus(table, reservations, guests);
  const metrics = buildTableMetrics(table, reservations, guests, checkIns);

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
) {
  return tables.map((table) => buildTableSummary(table, reservations, guests, checkIns));
}
