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
  activate(eventId: string): Promise<{ activatedEventId: string; previousLiveEventId: string | null }>;
  setVenueAtomic(eventId: string, venueId: string | null): Promise<EventVenueAtomicResult>;
};

export type EventActivationResult = { activatedEventId: string; previousLiveEventId: string | null };

export function applyEventActivation(events: PlatformEvent[], eventId: string): { events: PlatformEvent[]; result: EventActivationResult } {
  const target = events.find((event) => event.id === eventId);
  if (!target) throw new Error("Evento no encontrado.");
  if (target.status !== "published") throw new Error("Solo se puede activar un evento publicado.");
  const previous = events.find((event) => event.organizationId === target.organizationId && event.status === "live" && event.id !== eventId);
  return {
    events: events.map((event) => event.organizationId === target.organizationId
      ? event.id === eventId ? { ...event, status: "live" } : event.status === "live" ? { ...event, status: "finished" } : event
      : event),
    result: { activatedEventId: eventId, previousLiveEventId: previous?.id ?? null },
  };
}

export type EventVenueAtomicResult = {
  changed: boolean;
  event_id: string;
  previous_venue_id: string | null;
  venue_id: string | null;
  event_layout_id: string | null;
  materialized: boolean;
  previous_layout_archived: boolean;
};

export type ReservationRepository = CrudRepository<ReservationRecord, ReservationCreationInput> & {
  createPhysicalAtomic(input: { reservation: ReservationRecord; guests: Guest[] }): Promise<{ reservation: ReservationRecord; guests: Guest[] }>;
  createPresaleAtomic(input: { reservation: ReservationRecord; guests: Guest[] }): Promise<{ reservation: ReservationRecord; guests: Guest[] }>;
  createCourtesyAtomic(input: { reservation: ReservationRecord; guests: Guest[] }): Promise<{ reservation: ReservationRecord; guests: Guest[] }>;
  addGuest(reservationId: string, guest: ReservationGuestInput): void;
  addGuestAtomic(input: { reservationId: string; guest: Guest; courtesyEvent?: TimelineEvent; accessEvent: TimelineEvent }): Promise<Guest>;
  addPresaleGuestAtomic(input: { reservationId: string; guest: Guest; accessEvent: TimelineEvent }): Promise<Guest>;
  addCourtesyGuestAtomic(input: { reservationId: string; guest: Guest; accessEvent: TimelineEvent }): Promise<Guest>;
  cancelGuestAtomic(input: { reservationId: string; guestId: string; reason: string }): Promise<{ guest: Guest; timelineEvent: TimelineEvent }>;
  updateGuest(params: { reservationId: string; guestId: string; action: ReservationGuestAction }): void;
  setStatus(reservationId: string, status: ReservationStatus): void;
  setStatusAtomic(reservationId: string, status: ReservationStatus): Promise<{ reservationId: string; previousStatus: ReservationStatus; status: ReservationStatus; changed: boolean }>;
  assignToTable(reservationId: string, tableId: string): void;
  assignReservationTableAtomic(input: { reservationId: string; resourceId: string }): Promise<ReservationTableAtomicResult>;
  swapResourceReservationsAtomic(input: { reservationAId: string; reservationBId?: string; resourceAId: string; resourceBId: string; idempotencyKey: string }): Promise<Record<string, unknown>>;
  releaseReservationTableAtomic(input: { reservationId: string; expectedResourceId: string }): Promise<ReleaseReservationTableAtomicResult>;
};

export type ReservationTableAtomicResult = { reservation_id: string; source_table_id: string | null; destination_table_id: string; guest_ids: string[]; changed: boolean; reservation?: { resource_id: string | null; table_id: string | null; table_name?: string; table_capacity?: number | null } };
export type ReleaseReservationTableAtomicResult = { reservation_id: string; released_table_id: string; guest_ids: string[]; changed: boolean; reservation?: { resource_id: string | null; table_id: string | null; table_capacity?: number | null } };

export type GuestRepository = CrudRepository<Guest> & {
  createWithAccessOrdinal(guest: Guest): Promise<Guest>;
  prepareAuthoritativeAccess(guest: Guest): Promise<Guest>;
  rotateGuestAccessCredential(guestId: string): Promise<{ guestId: string; accessGrantId: string; accessCode: string; qrToken: string }>;
  replaceReservationGuest(input: { reservationId: string; guestId: string; replacement: Pick<Guest, "guestName" | "carnet" | "whatsapp">; reason?: string }): Promise<{ guest: Guest; accessGrantId: string; accessCode: string; qrToken: string; sourceGuestId: string }>;
  moveToTable(guestId: string, tableId: string): void;
  moveGuestToResourceAtomic(input: { guestId: string; destinationResourceId: string }): Promise<GuestMoveAtomicResult>;
  checkIn(query: string): Promise<CheckInAttempt | null>;
};

export type GuestMoveAtomicResult = {
  changed: boolean;
  guest_id: string;
  reservation_id: string;
  source_resource_id: string | null;
  destination_resource_id: string;
  destination_resource_name: string;
  table_id: string | null;
  table_name: string | null;
};

export type TableRepository = CrudRepository<TableRecord> & {
  assignReservation(reservationId: string, tableId: string): void;
  moveGuest(guestId: string, tableId: string): void;
  release(tableId: string): void;
  close(tableId: string): void;
  closeTableAtomic(input: { resourceId: string }): Promise<{ table_id: string; status: string; closed: boolean; changed: boolean }>;
};

export type CheckInRepository = CrudRepository<CheckIn> & {
  register(query: string, method: "QR" | "Manual", operator?: string): Promise<CheckInAttempt | null>;
  isAuthoritativeConsumed?(accessGrantId: string): Promise<boolean>;
  persistCompletedAtomic?(input: { guestId: string; accessGrantId: string; operatorProfileId: string; source: string; method: string; operator: string; gate: string; checkedInAt: string; notes: string; auditTrail: unknown; timeline: unknown; presentedCredential: string; credentialKind: "qr_token" | "access_code" | "manual" | "invalid" }): Promise<void>;
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
  events.activate = async (eventId) => {
    const next = applyEventActivation(adapter.events, eventId);
    adapter.setEventsState(next.events);
    return next.result;
  };
  events.setVenueAtomic = async (eventId, venueId) => {
    const event = adapter.events.find((item) => item.id === eventId);
    if (!event) throw new Error("Event not found.");
    if ((event.venueId ?? null) === venueId) {
      return { changed: false, event_id: eventId, previous_venue_id: event.venueId ?? null, venue_id: venueId, event_layout_id: null, materialized: false, previous_layout_archived: false };
    }
    adapter.setEventsState(adapter.events.map((item) => item.id === eventId ? { ...item, venueId: venueId ?? undefined } : item));
    return { changed: true, event_id: eventId, previous_venue_id: event.venueId ?? null, venue_id: venueId, event_layout_id: null, materialized: false, previous_layout_archived: false };
  };

  const reservations = buildCrudRepository<ReservationRecord, ReservationCreationInput>(
    () => adapter.reservations,
    adapter.setReservationsState,
    (input: ReservationCreationInput) => adapter.createReservation(input),
  ) as ReservationRepository;

  const guests = buildCrudRepository<Guest>(
    () => adapter.guests,
    adapter.setGuestsState,
  ) as GuestRepository;

  guests.createWithAccessOrdinal = async (guest) => {
    const reservation = adapter.reservations.find((item) => item.id === guest.reservationId);
    if (!reservation) {
      throw new Error("Reservation not found.");
    }

    const reservationGuests = adapter.guests.filter((item) => item.reservationId === guest.reservationId);
    const accessOrdinal = Math.max(0, ...reservationGuests.map((item) => item.accessOrdinal ?? 0)) + 1;
    return guests.create({
      ...guest,
      accessOrdinal,
      invitationCode: `${reservation.code}-${String(accessOrdinal).padStart(2, "0")}`,
    });
  };

  reservations.addGuestAtomic = async ({ reservationId, guest, accessEvent }) => {
    const reservation = adapter.reservations.find((item) => item.id === reservationId);
    if (!reservation) throw new Error("Reservation not found.");
    const persistedGuest = await guests.createWithAccessOrdinal(guest);
    adapter.setReservationsState(
      adapter.reservations.map((item) => item.id === reservationId
        ? { ...item, guestIds: [...item.guestIds, persistedGuest.id], updatedAt: new Date().toISOString() }
        : item),
    );
    void accessEvent;
    return persistedGuest;
  };

  reservations.cancelGuestAtomic = async ({ reservationId, guestId, reason }) => {
    const guest = adapter.guests.find((item) => item.id === guestId && item.reservationId === reservationId);
    if (!guest) throw new Error("Guest not found.");
    const nextGuest: Guest = { ...guest, reservationStatus: "Cancelled", admissionStatus: "Anulada", qrStatus: "Anulado" };
    adapter.setGuestsState(adapter.guests.map((item) => item.id === guestId ? nextGuest : item));
    void reason;
    return {
      guest: nextGuest,
      timelineEvent: {
        id: "local-cancelled-guest",
        eventId: guest.eventId,
        timestamp: new Date().toISOString(),
        kind: "guest.cancelled",
        icon: "guest",
        tone: "danger",
        title: "Invitado cancelado",
        description: `${guest.guestName} fue anulado.`,
        reservationId,
        guestId,
        guestName: guest.guestName,
      } as TimelineEvent,
    };
  };

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
  reservations.setStatusAtomic = async (reservationId, status) => {
    adapter.setReservationStatus(reservationId, status);
    return { reservationId, previousStatus: status, status, changed: true };
  };
  reservations.assignToTable = adapter.assignReservationToTable;
  reservations.assignReservationTableAtomic = async ({ reservationId, resourceId }) => {
    adapter.assignReservationToTable(reservationId, resourceId);
    return { reservation_id: reservationId, source_table_id: null, destination_table_id: resourceId, guest_ids: [], changed: true };
  };
  reservations.createPhysicalAtomic = async ({ reservation, guests: inputGuests }) => {
    return { reservation, guests: inputGuests };
  };
  reservations.createPresaleAtomic = async ({ reservation, guests: inputGuests }) => {
    return { reservation, guests: inputGuests };
  };
  reservations.createCourtesyAtomic = async ({ reservation, guests: inputGuests }) => {
    return { reservation, guests: inputGuests };
  };
  reservations.addPresaleGuestAtomic = async ({ guest }) => {
    adapter.addReservationGuest(guest.reservationId, guest as never);
    return guest;
  };
  reservations.addCourtesyGuestAtomic = async ({ guest }) => {
    adapter.addReservationGuest(guest.reservationId, guest as never);
    return guest;
  };
  reservations.releaseReservationTableAtomic = async ({ reservationId, expectedResourceId }) => {
    adapter.releaseTable(expectedResourceId);
    return { reservation_id: reservationId, released_table_id: expectedResourceId, guest_ids: [], changed: true };
  };
  guests.moveToTable = adapter.moveGuestToTable;
  guests.moveGuestToResourceAtomic = async ({ guestId, destinationResourceId }) => {
    const guest = adapter.guests.find((item) => item.id === guestId);
    const destination = adapter.tables.find((item) => item.id === destinationResourceId);
    if (!guest || !destination) throw new Error("Guest or destination resource not found.");
    const sourceResourceId = guest.tableId ?? null;
    adapter.moveGuestToTable(guestId, destinationResourceId);
    return {
      changed: sourceResourceId !== destinationResourceId,
      guest_id: guest.id,
      reservation_id: guest.reservationId,
      source_resource_id: sourceResourceId,
      destination_resource_id: destinationResourceId,
      destination_resource_name: destination.name,
      table_id: destinationResourceId,
      table_name: destination.name,
    };
  };
  guests.checkIn = async (query: string) => {
    const result = await adapter.registerCheckIn({ query, method: "QR" });
    return result.result ? adapter.attempts.find((attempt) => attempt.query === query) ?? null : null;
  };
  tables.assignReservation = adapter.assignReservationToTable;
  tables.moveGuest = adapter.moveGuestToTable;
  tables.release = adapter.releaseTable;
  tables.close = adapter.closeTable;
  tables.closeTableAtomic = async ({ resourceId }) => {
    adapter.closeTable(resourceId);
    return { table_id: resourceId, status: "Closed", closed: true, changed: true };
  };
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
      activate: notImplemented,
      setVenueAtomic: notImplemented,
    },
    reservations: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      createPhysicalAtomic: notImplemented,
      createPresaleAtomic: notImplemented,
      createCourtesyAtomic: notImplemented,
      addPresaleGuestAtomic: notImplemented,
      addCourtesyGuestAtomic: notImplemented,
      addGuest: notImplemented,
      addGuestAtomic: notImplemented,
      cancelGuestAtomic: notImplemented,
      updateGuest: notImplemented,
      setStatus: notImplemented,
      setStatusAtomic: notImplemented,
      assignToTable: notImplemented,
      assignReservationTableAtomic: notImplemented,
      swapResourceReservationsAtomic: notImplemented,
      releaseReservationTableAtomic: notImplemented,
    },
    guests: {
      list: notImplemented,
      findById: notImplemented,
      getById: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
      createWithAccessOrdinal: notImplemented,
      prepareAuthoritativeAccess: async (guest) => guest,
      rotateGuestAccessCredential: async () => { throw new Error("Credential rotation is not supported by the memory repository."); },
      replaceReservationGuest: async () => { throw new Error("Guest replacement is not supported by the memory repository."); },
      moveToTable: notImplemented,
      moveGuestToResourceAtomic: notImplemented,
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
      closeTableAtomic: notImplemented,
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
