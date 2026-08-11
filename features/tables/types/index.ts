import type { Resource } from "@/features/domain/types";

export type TableStatus =
  | "Available"
  | "Partially Occupied"
  | "Full"
  | "Over Capacity"
  | "Reserved"
  | "Blocked"
  | "Closed";

export type TableTone = "success" | "warning" | "danger" | "info";

export type TableCapacity = number;

export type TableOption = {
  id: string;
  name: string;
  capacity: TableCapacity;
  location: string;
  status: TableStatus;
  assignedGuests?: number;
  activeReservations?: number;
  overCapacity?: number;
  venueId?: string;
  sectorId?: string;
  venueLayoutId?: string;
  venueLayoutSectorId?: string;
  venueLayoutResourceId?: string;
  eventLayoutId?: string;
  eventLayoutSectorId?: string;
  eventLayoutResourceId?: string;
  recommended?: boolean;
  tone: TableTone;
};

export type TableAssignment = {
  tableId: string;
  reservationId: string;
  reservationCode: string;
  reservationName: string;
  assignedAt: string;
};

export type SeatAssignment = {
  tableId: string;
  reservationId: string;
  guestId: string;
  guestName: string;
  assignedAt: string;
  checkedIn: boolean;
};

export type TableRecord = Resource & {
  eventId?: string;
  eventLayoutId?: string;
  eventLayoutResourceId?: string;
  location: string;
  reservationIds: string[];
  guestIds: string[];
  closed: boolean;
};

export type TableMetrics = {
  assignedGuests: number;
  checkedInGuests: number;
  pendingGuests: number;
  capacityRemaining: number;
  occupancyPercent: number;
  overCapacity: number;
  activeReservations: number;
};

export type TableSummary = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  status: TableStatus;
  statusTone: TableTone;
  metrics: TableMetrics;
  reservationIds: string[];
  guestIds: string[];
  reservations: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
  }>;
  guests: Array<{
    id: string;
    name: string;
    reservationName: string;
    reservationCode: string;
    tableId?: string;
    tableName?: string;
    admissionStatus: string;
    reservationStatus: string;
    checkInTime?: string;
    manualAdmission?: boolean;
  }>;
};
