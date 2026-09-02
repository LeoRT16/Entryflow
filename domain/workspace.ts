import type { Dispatch, SetStateAction } from "react";

import type { Event as PlatformEvent, Organization } from "@/features/domain/types";
import { buildDashboardSnapshot } from "@/features/check-in/domain/check-in-domain";
import type {
  CheckIn,
  CheckInAttempt,
  CheckInMethod,
  Event as LegacyEvent,
  Guest,
} from "@/features/check-in/types";
import type { WorkspaceIntelligence } from "@/domain/workspace-intelligence";
import type {
  ReservationCreationInput,
  ReservationGuestAction,
  ReservationGuestInput,
  ReservationRecord,
  ReservationStatus,
  ReservationSummary,
} from "@/features/reservations/types";
import type { ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";
import type { TableRecord, TableSummary } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";

export type DashboardSnapshot = ReturnType<typeof buildDashboardSnapshot>;

export type WorkspaceCollections = {
  organizations: Organization[];
  events: PlatformEvent[];
  guests: Guest[];
  reservations: ReservationRecord[];
  extraWristbandSales: ExtraWristbandSale[];
  reservationSummaries: ReservationSummary[];
  tables: TableRecord[];
  tableSummaries: TableSummary[];
  checkIns: CheckIn[];
  attempts: CheckInAttempt[];
  dashboard: DashboardSnapshot;
};

export type WorkspaceSetters = {
  setOrganizationsState: Dispatch<SetStateAction<Organization[]>>;
  setEventsState: Dispatch<SetStateAction<PlatformEvent[]>>;
  setGuestsState: Dispatch<SetStateAction<Guest[]>>;
  setReservationsState: Dispatch<SetStateAction<ReservationRecord[]>>;
  setTablesState: Dispatch<SetStateAction<TableRecord[]>>;
  setCheckInsState: Dispatch<SetStateAction<CheckIn[]>>;
  setAttemptsState: Dispatch<SetStateAction<CheckInAttempt[]>>;
};

export type WorkspaceMutations = {
  setCurrentOrganizationId: (organizationId: string) => void;
  setCurrentEventId: (eventId: string) => void;
  setActiveEventId: (eventId: string) => void;
  registerCheckIn: (params: {
    query: string;
    method: CheckInMethod;
    operator?: string;
    manual?: boolean;
  }) => Promise<{
    result: CheckInAttempt["result"];
    guest?: Guest;
    note: string;
  }>;
  createReservation: (input: ReservationCreationInput) => ReservationRecord;
  createOrganization: (organization: Organization) => Organization;
  createEvent: (event: PlatformEvent) => void;
  setEventStatus: (eventId: string, status: PlatformEvent["status"]) => void;
  addReservationGuest: (reservationId: string, guest: ReservationGuestInput) => Promise<void>;
  updateReservationGuest: (params: {
    reservationId: string;
    guestId: string;
    action: ReservationGuestAction;
  }) => void;
  setReservationStatus: (reservationId: string, status: ReservationStatus) => void;
  assignReservationToTable: (reservationId: string, tableId: string) => void;
  moveGuestToTable: (guestId: string, tableId: string) => void;
  releaseTable: (tableId: string) => void;
  closeTable: (tableId: string) => void;
};

export type WorkspaceSnapshot = WorkspaceCollections & WorkspaceSetters & WorkspaceMutations & {
  currentOrganizationId: string;
  currentEventId: string;
  currentOrganization: Organization;
  currentEvent: PlatformEvent;
  activeEvent: LegacyEvent;
  workspaceIntelligence: WorkspaceIntelligence;
  findGuestByQuery: (query: string) => Guest | null;
  searchGuests: (query: string) => Guest[];
  customers: {
    eventOptions: Array<{ id: string; name: string; status: PlatformEvent["status"] }>;
    eventStats: Record<string, { expectedGuests: number; checkedIn: number; pending: number; attention: number }>;
    guestRecords: Guest[];
  };
  timelineEvents: TimelineEvent[];
};
