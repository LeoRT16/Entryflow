export type TableStatus =
  | "Available"
  | "Partially Occupied"
  | "Full"
  | "Over Capacity"
  | "Reserved"
  | "Closed";

export type TableTone = "success" | "warning" | "danger" | "info";

export type TableCapacity = number;

export type TableOption = {
  id: string;
  name: string;
  capacity: TableCapacity;
  location: string;
  status: TableStatus;
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

export type TableRecord = {
  id: string;
  name: string;
  capacity: TableCapacity;
  location: string;
  status: TableStatus;
  eventId: string;
  reservationIds: string[];
  guestIds: string[];
  closed: boolean;
  notes?: string;
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
