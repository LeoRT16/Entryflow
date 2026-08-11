import type { Organization, Event as PlatformEvent } from "@/features/domain/types";
import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import type {
  ReservationCreationInput,
  ReservationGuestAction,
  ReservationGuestInput,
  ReservationRecord,
  ReservationStatus,
} from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import type { WorkspaceSetters, WorkspaceMutations, WorkspaceCollections } from "@/domain/workspace";
import { removeById, replaceById, type CrudRepository } from "@/repositories/workspace-repository-utils";
import { buildTimelineEvents } from "@/features/timeline/domain/timeline-domain";

type WorkspaceMemoryAdapter = WorkspaceCollections & WorkspaceSetters & WorkspaceMutations;

export type OrganizationRepository = CrudRepository<Organization> & {
  setActive(organizationId: string): void;
};

export type EventRepository = CrudRepository<PlatformEvent> & {
  setActive(eventId: string): void;
  setStatus(eventId: string, status: PlatformEvent["status"]): void;
};

export type ReservationRepository = CrudRepository<ReservationRecord, ReservationCreationInput> & {
  addGuest(reservationId: string, guest: ReservationGuestInput): void;
  updateGuest(params: { reservationId: string; guestId: string; action: ReservationGuestAction }): void;
  setStatus(reservationId: string, status: ReservationStatus): void;
  assignToTable(reservationId: string, tableId: string): void;
};

export type GuestRepository = CrudRepository<Guest> & {
  moveToTable(guestId: string, tableId: string): void;
  checkIn(query: string): Promise<CheckInAttempt | null>;
};

export type TableRepository = CrudRepository<TableRecord> & {
  assignReservation(reservationId: string, tableId: string): void;
  moveGuest(guestId: string, tableId: string): void;
  release(tableId: string): void;
  close(tableId: string): void;
};

export type CheckInRepository = CrudRepository<CheckIn> & {
  register(query: string, method: "QR" | "Manual", operator?: string): Promise<CheckInAttempt | null>;
};

export type TimelineRepository = {
  list(eventId?: string): TimelineEvent[];
  findById(id: string): TimelineEvent | undefined;
  getById(id: string): TimelineEvent | undefined;
  create(entry: TimelineEvent): TimelineEvent;
  update(id: string, patch: Partial<TimelineEvent>): TimelineEvent | undefined;
  delete(id: string): boolean;
};

export type OperationsRepository = {
  list(eventId?: string): TimelineEvent[];
  findById(id: string): TimelineEvent | undefined;
  getById(id: string): TimelineEvent | undefined;
  create(entry: TimelineEvent): TimelineEvent;
  update(id: string, patch: Partial<TimelineEvent>): TimelineEvent | undefined;
  delete(id: string): boolean;
};

export type WorkspaceRepositories = {
  organizations: OrganizationRepository;
  events: EventRepository;
  reservations: ReservationRepository;
  guests: GuestRepository;
  tables: TableRepository;
  checkIns: CheckInRepository;
  timeline: TimelineRepository;
  operations: OperationsRepository;
};

function buildCrudRepository<T extends { id: string }, TInput = T>(
  getItems: () => T[],
  setItems: (value: T[]) => void,
  createItem?: (input: TInput) => T,
): CrudRepository<T, TInput> {
  return {
    list: () => getItems(),
    findById: (id: string) => getItems().find((item) => item.id === id),
    getById: (id: string) => getItems().find((item) => item.id === id),
    create: (input: TInput) => {
      if (!createItem) {
        throw new Error("Create not supported.");
      }

      const next = createItem(input);
      setItems([next, ...getItems()]);
      return next;
    },
    update: (id: string, patch: Partial<T>) => {
      let updated: T | undefined;
      setItems(
        replaceById(getItems(), id, (item) => {
          updated = { ...item, ...patch };
          return updated;
        }),
      );
      return updated;
    },
    delete: (id: string) => {
      const before = getItems().length;
      setItems(removeById(getItems(), id));
      return getItems().length !== before;
    },
  };
}

export function createMemoryWorkspaceRepositories(adapter: WorkspaceMemoryAdapter): WorkspaceRepositories {
  const organizations = buildCrudRepository<Organization>(
    () => adapter.organizations,
    adapter.setOrganizationsState,
  ) as OrganizationRepository;

  const events = buildCrudRepository<PlatformEvent>(
    () => adapter.events,
    adapter.setEventsState,
  ) as EventRepository;

  const reservations = buildCrudRepository<ReservationRecord, ReservationCreationInput>(
    () => adapter.reservations,
    adapter.setReservationsState,
    (input: ReservationCreationInput) => adapter.createReservation(input),
  ) as ReservationRepository;

  const guests = buildCrudRepository<Guest>(
    () => adapter.guests,
    adapter.setGuestsState,
  ) as GuestRepository;

  const tables = buildCrudRepository<TableRecord>(
    () => adapter.tables,
    adapter.setTablesState,
  ) as TableRepository;

  const checkIns = buildCrudRepository<CheckIn>(
    () => adapter.checkIns,
    adapter.setCheckInsState,
  ) as CheckInRepository;

  const timeline = {
    list: (eventId?: string) => buildTimelineEvents({
      eventId,
      reservations: adapter.reservations,
      guests: adapter.guests,
      checkIns: adapter.checkIns,
      attempts: adapter.attempts,
    }),
    findById: (id: string) => buildTimelineEvents({
      eventId: undefined,
      reservations: adapter.reservations,
      guests: adapter.guests,
      checkIns: adapter.checkIns,
      attempts: adapter.attempts,
    }).find((item) => item.id === id),
    getById: (id: string) => buildTimelineEvents({
      eventId: undefined,
      reservations: adapter.reservations,
      guests: adapter.guests,
      checkIns: adapter.checkIns,
      attempts: adapter.attempts,
    }).find((item) => item.id === id),
    create: (entry: TimelineEvent) => entry,
    update: (id: string, patch: Partial<TimelineEvent>) => ({ id, ...patch } as TimelineEvent),
    delete: () => true,
  } satisfies TimelineRepository;

  const operations = {
    list: (eventId?: string) => timeline.list(eventId),
    findById: timeline.findById,
    getById: timeline.getById,
    create: timeline.create,
    update: timeline.update,
    delete: timeline.delete,
  } satisfies OperationsRepository;

  organizations.setActive = adapter.setCurrentOrganizationId;
  events.setActive = adapter.setCurrentEventId;
  events.setStatus = adapter.setEventStatus;
  reservations.addGuest = adapter.addReservationGuest;
  reservations.updateGuest = adapter.updateReservationGuest;
  reservations.setStatus = adapter.setReservationStatus;
  reservations.assignToTable = adapter.assignReservationToTable;
  guests.moveToTable = adapter.moveGuestToTable;
  guests.checkIn = async (query: string) => {
    const result = await adapter.registerCheckIn({ query, method: "QR" });
    return result.result ? adapter.attempts.find((attempt) => attempt.query === query) ?? null : null;
  };
  tables.assignReservation = adapter.assignReservationToTable;
  tables.moveGuest = adapter.moveGuestToTable;
  tables.release = adapter.releaseTable;
  tables.close = adapter.closeTable;
  checkIns.register = async (query: string, method: "QR" | "Manual", operator = method === "Manual" ? "Recepción" : "Escáner") => {
    await adapter.registerCheckIn({ query, method, operator });
    return adapter.attempts.find((attempt) => attempt.query === query && attempt.method === method) ?? null;
  };

  return {
    organizations,
    events,
    reservations,
    guests,
    tables,
    checkIns,
    timeline,
    operations,
  };
}

export function createSupabaseWorkspaceRepositories(): WorkspaceRepositories {
  const notImplemented = () => {
    throw new Error("Supabase repository not implemented yet.");
  };

  return {
    organizations: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      setActive: notImplemented,
    },
    events: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      setActive: notImplemented,
      setStatus: notImplemented,
    },
    reservations: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      addGuest: notImplemented,
      updateGuest: notImplemented,
      setStatus: notImplemented,
      assignToTable: notImplemented,
    },
    guests: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      moveToTable: notImplemented,
      checkIn: notImplemented,
    },
    tables: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      assignReservation: notImplemented,
      moveGuest: notImplemented,
      release: notImplemented,
      close: notImplemented,
    },
    checkIns: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      register: notImplemented,
    },
    timeline: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
    },
    operations: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
    },
  };
}
