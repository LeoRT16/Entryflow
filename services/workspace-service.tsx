"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";

import { useFeedback } from "@/components/premium-feedback";
import { admissionFilters, deliveryFilters, quickFilters, reservationFilters } from "@/features/customers/domain/customer-filters";
import { searchGuests } from "@/features/check-in/domain/check-in-domain";
import type { Event as PlatformEvent, Organization } from "@/features/domain/types";
import { mapEventToLegacyEvent } from "@/features/domain/compatibility";
import { getAdmissionsForEvent, getAttendeesForEvent, getReservationsForEvent, getResourcesForEvent } from "@/features/domain/selectors";
import { buildReservationSummaries, createReservationBundle, normalizeReservationStatus, updateReservationStatusFromGuests } from "@/features/reservations/domain/reservation-domain";
import type {
  ReservationCreationInput,
  ReservationGuestAction,
  ReservationGuestInput,
  ReservationRecord,
  ReservationStatus,
  ReservationSummary,
} from "@/features/reservations/types";
import { buildTableSummaries } from "@/features/tables/domain/table-domain";
import type { TableRecord, TableSummary } from "@/features/tables/types";
import type { CheckIn, CheckInAttempt, CheckInMethod, Event as LegacyEvent, Guest } from "@/features/check-in/types";
import type { TimelineEvent } from "@/features/timeline/types";
import {
  createAdmissionTimelineEntry,
  createTicketFromGuest,
  evaluateAdmission,
  type AdmissionResult,
  type Ticket,
} from "@/features/access/domain/access-domain";
import { buildWorkspaceIntelligence, type WorkspaceIntelligence } from "@/domain/workspace-intelligence";
import { buildWorkspacePrioritySnapshot, type WorkspacePrioritySnapshot } from "@/domain/workspace-priority";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createUuid, nowIso } from "@/lib/supabase/helpers";
import { createSupabaseWorkspaceRepositories, type SupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";

type WorkspaceServiceStatus = "loading" | "ready" | "empty" | "error";

type WorkspaceServiceValue = {
  organizations: Organization[];
  currentOrganizationId: string;
  currentOrganization: Organization;
  events: PlatformEvent[];
  currentEventId: string;
  currentEvent: PlatformEvent;
  activeEventId: string;
  activeEvent: LegacyEvent;
  guests: Guest[];
  reservations: ReservationRecord[];
  reservationSummaries: ReservationSummary[];
  tables: TableRecord[];
  tableSummaries: TableSummary[];
  checkIns: CheckIn[];
  attempts: CheckInAttempt[];
  timelineEvents: TimelineEvent[];
  workspaceIntelligence: WorkspaceIntelligence;
  workspacePriority: WorkspacePrioritySnapshot;
  dashboard: WorkspaceIntelligence["dashboard"];
  customers: {
    eventOptions: Array<{ id: string; name: string; status: PlatformEvent["status"] }>;
    eventStats: Record<string, { expectedGuests: number; checkedIn: number; pending: number; attention: number }>;
    guestRecords: Guest[];
    admissionFilters: typeof admissionFilters;
    deliveryFilters: typeof deliveryFilters;
    reservationFilters: typeof reservationFilters;
    quickFilters: typeof quickFilters;
  };
  setCurrentOrganizationId: (organizationId: string) => void;
  setCurrentEventId: (eventId: string) => void;
  setActiveEventId: (eventId: string) => void;
  findGuestByQuery: (query: string) => Guest | null;
  searchGuests: (query: string) => Guest[];
  registerCheckIn: (params: {
    query: string;
    method: CheckInMethod;
    operator?: string;
    manual?: boolean;
  }) => {
    result: CheckInAttempt["result"];
    guest?: Guest;
    note: string;
  };
  createReservation: (input: ReservationCreationInput) => ReservationRecord;
  createOrganization: (organization: Organization) => Organization;
  addReservationGuest: (reservationId: string, guest: ReservationGuestInput) => void;
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
  createEvent: (event: PlatformEvent) => void;
  setEventStatus: (eventId: string, status: PlatformEvent["status"]) => void;
  setOrganizationsState: Dispatch<SetStateAction<Organization[]>>;
  setEventsState: Dispatch<SetStateAction<PlatformEvent[]>>;
  setGuestsState: Dispatch<SetStateAction<Guest[]>>;
  setReservationsState: Dispatch<SetStateAction<ReservationRecord[]>>;
  setTablesState: Dispatch<SetStateAction<TableRecord[]>>;
  setCheckInsState: Dispatch<SetStateAction<CheckIn[]>>;
  setAttemptsState: Dispatch<SetStateAction<CheckInAttempt[]>>;
  repositories: SupabaseWorkspaceRepositories;
  status: WorkspaceServiceStatus;
  error: Error | null;
  reloadWorkspace: () => Promise<void>;
};

const WorkspaceServiceContext = createContext<WorkspaceServiceValue | null>(null);

function getEventFallback(events: PlatformEvent[], organizationId: string) {
  const current = events.find((event) => event.organizationId === organizationId && event.status === "live")
    ?? events.find((event) => event.organizationId === organizationId)
    ?? events[0];

  return current ?? {
    id: "",
    organizationId,
    name: "",
    eventType: "nightlife",
    status: "draft",
    startAt: "",
    timezone: "America/La_Paz",
    venue: "",
    capacity: 0,
    enabledModules: [],
    operationalModel: "mixed",
    admissionMethods: [],
    resourceTypes: [],
  };
}

function getOrganizationFallback(organizations: Organization[]) {
  return organizations.find((organization) => organization.status === "active") ?? organizations[0] ?? {
    id: "",
    name: "",
    slug: "",
    status: "active",
    timezone: "America/La_Paz",
    branding: {},
    settings: {},
  };
}

function clone<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildAttemptTimelineEvent(attempt: CheckInAttempt, guest?: Guest): TimelineEvent {
  const kind = attempt.result === "Encontrado"
    ? attempt.method === "Manual"
      ? "checkin.manual"
      : "checkin.success"
    : attempt.result === "No encontrado"
      ? "checkin.invalid"
      : "checkin.blocked";

  return {
    id: attempt.id,
    timestamp: attempt.timestamp,
    kind,
    icon: kind === "checkin.invalid" || kind === "checkin.blocked" ? "alert" : "checkin",
    tone: kind === "checkin.invalid" ? "danger" : kind === "checkin.blocked" ? "warning" : "success",
    title:
      kind === "checkin.invalid"
        ? "Código inválido"
        : kind === "checkin.blocked"
          ? attempt.result === "Usado"
            ? "Segundo intento bloqueado"
            : "Ingreso bloqueado"
          : attempt.method === "Manual"
            ? "Check-in manual"
            : "Check-in exitoso",
    description: attempt.note,
    reservationId: guest?.reservationId,
    reservationCode: guest?.reservationCode,
    reservationName: guest?.reservationName,
    guestId: guest?.id ?? attempt.guestId,
    guestName: guest?.guestName ?? attempt.guestName,
    tableId: guest?.tableId,
    tableName: guest?.tableName,
    metadata: {
      query: attempt.query,
      method: attempt.method,
      result: attempt.result,
      note: attempt.note,
    },
  };
}

function mapAdmissionResultToAttemptResult(result: AdmissionResult): CheckInAttempt["result"] {
  if (result === "Valid") {
    return "Encontrado";
  }

  if (result === "Already Checked In" || result === "Duplicate") {
    return "Usado";
  }

  if (result === "Cancelled") {
    return "Anulado";
  }

  if (result === "Unknown") {
    return "No encontrado";
  }

  return "Bloqueado";
}

function buildAccessTicketFromGuest(guest: Guest, timestampIso: string): Ticket {
  const status: Ticket["status"] =
    guest.admissionStatus === "Ingresó"
      ? "Checked In"
      : guest.admissionStatus === "Anulada"
        ? "Cancelled"
        : guest.admissionStatus === "Bloqueada"
          ? "Blocked"
          : normalizeReservationStatus(guest.reservationStatus) === "No Show"
            ? "No Show"
            : guest.deliveryStatus === "Vista"
              ? "Viewed"
              : guest.deliveryStatus === "Enviada" || guest.deliveryStatus === "Reenviada"
                ? "Delivered"
                : guest.deliveryStatus === "Pendiente de envío"
                  ? "Sent"
                  : "Created";

  return {
    ...createTicketFromGuest({
      id: guest.id,
      reservationId: guest.reservationId,
      guestId: guest.id,
      eventId: guest.eventId,
      code: guest.invitationCode,
      qrToken: guest.invitationCode,
      accessType: guest.manualAdmission ? "manual" : "invitation",
      createdAt: timestampIso,
      status,
      notes: guest.attention,
      gate: guest.gate,
      zone: guest.seat,
      reentryAllowed: guest.admissionStatus !== "Ingresó",
      maxEntries: 1,
    }),
    entryCount: guest.admissionStatus === "Ingresó" ? 1 : 0,
    attemptCount: guest.checkInTime ? 1 : 0,
    lastAttemptAt: guest.checkInTime ? timestampIso : undefined,
    source: guest.manualAdmission ? "manual" : "qr",
    lastAction: guest.checkInTime ? "Validated" : "Created",
  };
}

async function loadWorkspaceFromRepositories(repositories: SupabaseWorkspaceRepositories) {
  const [organizations, events, guests, reservations, tables, checkIns, timelineEvents, operations] = await Promise.all([
    repositories.organizations.list(),
    repositories.events.list(),
    repositories.guests.list(),
    repositories.reservations.list(),
    repositories.tables.list(),
    repositories.checkIns.list(),
    repositories.timeline.list(),
    repositories.operations.list(),
  ]);

  const currentOrganizationId = organizations.find((organization) => organization.status === "active")?.id ?? organizations[0]?.id ?? "";
  const currentEventId = events.find((event) => event.organizationId === currentOrganizationId && event.status === "live")?.id
    ?? events.find((event) => event.organizationId === currentOrganizationId)?.id
    ?? events[0]?.id
    ?? "";

  const attempts = [
    ...timelineEvents.filter((item) => item.kind === "checkin.invalid" || item.kind === "checkin.blocked"),
    ...operations.filter((item) => item.kind === "checkin.invalid" || item.kind === "checkin.blocked"),
  ].map((item) => ({
    id: item.id,
    eventId: String(item.metadata?.eventId ?? currentEventId),
    query: String(item.metadata?.query ?? item.description),
    method: String(item.metadata?.method ?? "QR") as CheckInAttempt["method"],
    timestamp: item.timestamp,
    result: String(item.metadata?.result ?? "No encontrado") as CheckInAttempt["result"],
    guestId: item.guestId,
    guestName: item.guestName,
    note: String(item.metadata?.note ?? item.description),
  }));

  return {
    organizations,
    events,
    guests,
    reservations,
    tables,
    checkIns,
    attempts,
    currentOrganizationId,
    currentEventId,
  };
}

export function WorkspaceServiceProvider({
  children,
  initialWorkspace,
}: {
  children: ReactNode;
  initialWorkspace?: WorkspaceBootstrap | null;
}) {
  const { notify } = useFeedback();
  const repositories = useMemo(() => createSupabaseWorkspaceRepositories(getSupabaseBrowserClient()), []);

  const [organizations, setOrganizations] = useState<Organization[]>(initialWorkspace?.organizations ?? []);
  const [events, setEvents] = useState<PlatformEvent[]>(initialWorkspace?.events ?? []);
  const [guests, setGuests] = useState<Guest[]>(initialWorkspace?.guests ?? []);
  const [reservations, setReservations] = useState<ReservationRecord[]>(initialWorkspace?.reservations ?? []);
  const [tables, setTables] = useState<TableRecord[]>(initialWorkspace?.tables ?? []);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialWorkspace?.checkIns ?? []);
  const [attempts, setAttempts] = useState<CheckInAttempt[]>(initialWorkspace?.attempts ?? []);
  const [currentOrganizationId, setCurrentOrganizationIdState] = useState(() => {
    if (initialWorkspace?.currentOrganizationId) {
      return initialWorkspace.currentOrganizationId;
    }

    if (typeof window !== "undefined") {
      return window.localStorage.getItem("entryflow.currentOrganizationId") ?? "";
    }

    return "";
  });
  const [currentEventId, setCurrentEventIdState] = useState(() => {
    if (initialWorkspace?.currentEventId) {
      return initialWorkspace.currentEventId;
    }

    if (typeof window !== "undefined") {
      return window.localStorage.getItem("entryflow.currentEventId") ?? "";
    }

    return "";
  });
  const [status, setStatus] = useState<WorkspaceServiceStatus>(initialWorkspace ? "ready" : "loading");
  const [error, setError] = useState<Error | null>(null);
  const hydratedRef = useRef(Boolean(initialWorkspace));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("entryflow.currentOrganizationId", currentOrganizationId);
    window.localStorage.setItem("entryflow.currentEventId", currentEventId);
  }, [currentEventId, currentOrganizationId]);

  const reloadWorkspace = useCallback(async () => {
    try {
      setStatus("loading");
      const snapshot = await loadWorkspaceFromRepositories(repositories);
      setOrganizations(snapshot.organizations);
      setEvents(snapshot.events);
      setGuests(snapshot.guests);
      setReservations(snapshot.reservations);
      setTables(snapshot.tables);
      setCheckIns(snapshot.checkIns);
      setAttempts(snapshot.attempts);
      setCurrentOrganizationIdState(snapshot.currentOrganizationId);
      setCurrentEventIdState(snapshot.currentEventId);
      setStatus(snapshot.organizations.length && snapshot.events.length ? "ready" : "empty");
      setError(null);
    } catch (exception) {
      setError(exception as Error);
      setStatus("error");
    }
  }, [repositories]);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserClient();

    if (!client) {
      return;
    }

    const channel = client
      .channel("entryflow-workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "organizations" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "tables" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "timeline_events" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "operations" }, () => void reloadWorkspace())
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [reloadWorkspace]);

  const currentOrganization = useMemo(() => getOrganizationFallback(organizations), [organizations]);
  const currentEvent = useMemo(() => getEventFallback(events, currentOrganization.id), [currentOrganization.id, events]);

  const currentEventGuests = useMemo(() => getAttendeesForEvent(currentEvent.id, guests), [currentEvent.id, guests]);
  const currentEventReservations = useMemo(() => getReservationsForEvent(currentEvent.id, reservations), [currentEvent.id, reservations]);
  const currentEventTables = useMemo(() => getResourcesForEvent(currentEvent.id, tables), [currentEvent.id, tables]);
  const currentEventCheckIns = useMemo(() => getAdmissionsForEvent(currentEvent.id, checkIns), [checkIns, currentEvent.id]);
  const currentEventAttempts = useMemo(() => attempts.filter((attempt) => attempt.eventId === currentEvent.id), [attempts, currentEvent.id]);
  const currentEventMetrics = useMemo(() => {
    const checkedIn = currentEventGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
    const expectedGuests = currentEventGuests.length;
    const pending = Math.max(expectedGuests - checkedIn, 0);
    const attention = currentEventGuests.filter((guest) => Boolean(guest.attention)).length;

    return {
      expectedGuests,
      checkedIn,
      pending,
      reservations: currentEventReservations.length,
      attention,
    };
  }, [currentEventGuests, currentEventReservations]);

  const activeEvent = useMemo(() => mapEventToLegacyEvent(currentEvent, currentEventMetrics), [currentEvent, currentEventMetrics]);

  const reservationSummaries = useMemo(
    () => buildReservationSummaries(currentEventReservations, currentEventGuests, currentEventCheckIns),
    [currentEventCheckIns, currentEventGuests, currentEventReservations],
  );
  const tableSummaries = useMemo(
    () => buildTableSummaries(currentEventTables, currentEventReservations, currentEventGuests, currentEventCheckIns),
    [currentEventCheckIns, currentEventGuests, currentEventReservations, currentEventTables],
  );
  const timelineEvents = useMemo<TimelineEvent[]>(
    () =>
      [
        ...currentEventReservations.flatMap((reservation) =>
          reservation.timeline.map(
            (entry) =>
              ({
                id: `${reservation.id}-${entry.id}`,
                timestamp: entry.time,
                kind: entry.title.toLowerCase().includes("agregado")
                  ? "guest.added"
                  : entry.title.toLowerCase().includes("confirm")
                    ? "guest.confirmed"
                    : entry.title.toLowerCase().includes("cancel")
                      ? "guest.cancelled"
                      : entry.title.toLowerCase().includes("mesa asignada")
                        ? "table.assigned"
                        : entry.title.toLowerCase().includes("mesa cambiada")
                          ? "table.changed"
                          : entry.title.toLowerCase().includes("mesa liberada")
                            ? "table.released"
                            : entry.title.toLowerCase().includes("mesa cerrada")
                              ? "table.closed"
                              : "reservation.updated",
                icon: entry.title.toLowerCase().includes("mesa") ? "table" : entry.title.toLowerCase().includes("ingreso") ? "checkin" : "reservation",
                tone: entry.tone,
                title: entry.title,
                description: entry.detail,
                reservationId: reservation.id,
                reservationCode: reservation.code,
                reservationName: reservation.name,
                tableId: reservation.tableId,
                tableName: reservation.tableName,
              }) as TimelineEvent,
          ),
        ),
        ...currentEventCheckIns.map(
          (checkIn) =>
            ({
              id: `checkin-${checkIn.id}`,
              timestamp: checkIn.checkedInAt,
              kind: checkIn.method === "Manual" ? "checkin.manual" : "checkin.success",
              icon: "checkin",
              tone: "success",
              title: checkIn.method === "Manual" ? "Check-in manual" : "Check-in exitoso",
              description:
                checkIn.method === "Manual"
                  ? `${currentEventGuests.find((guest) => guest.id === checkIn.guestId)?.guestName ?? "El invitado"} ingresó manualmente en ${checkIn.operator}.`
                  : `${currentEventGuests.find((guest) => guest.id === checkIn.guestId)?.guestName ?? "El invitado"} validó su ingreso con QR.`,
              reservationId: checkIn.reservationId,
              guestId: checkIn.guestId,
              guestName: currentEventGuests.find((guest) => guest.id === checkIn.guestId)?.guestName,
            }) as TimelineEvent,
        ),
        ...currentEventAttempts.map((attempt) => buildAttemptTimelineEvent(attempt, currentEventGuests.find((guest) => guest.id === attempt.guestId))),
      ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [currentEventAttempts, currentEventCheckIns, currentEventGuests, currentEventReservations],
  );

  const workspaceIntelligence = useMemo(
    () =>
      buildWorkspaceIntelligence({
        event: currentEvent,
        events,
        reservations,
        reservationSummaries,
        guests,
        tableSummaries,
        checkIns,
        attempts,
        timelineEvents,
      }),
    [attempts, checkIns, currentEvent, events, guests, reservationSummaries, reservations, tableSummaries, timelineEvents],
  );
  const workspacePriority = useMemo(() => buildWorkspacePrioritySnapshot(workspaceIntelligence), [workspaceIntelligence]);

  const dashboard = workspaceIntelligence.dashboard;
  const customers = useMemo(
    () => ({
      eventOptions: events.map((event) => ({ id: event.id, name: event.name, status: event.status })),
      eventStats: workspaceIntelligence.customers.eventStats,
      guestRecords: currentEventGuests,
      admissionFilters,
      deliveryFilters,
      reservationFilters,
      quickFilters,
    }),
    [currentEventGuests, events, workspaceIntelligence.customers.eventStats],
  );

  const findGuestByQuery = useCallback(
    (query: string) => searchGuests(currentEventGuests, query)[0] ?? null,
    [currentEventGuests],
  );

  const searchGuestList = useCallback((query: string) => searchGuests(currentEventGuests, query), [currentEventGuests]);

  const setCurrentOrganizationId = useCallback(
    (organizationId: string) => {
      setCurrentOrganizationIdState(organizationId);
      const organizationEvents = events.filter((event) => event.organizationId === organizationId);
      const nextEvent = organizationEvents.find((event) => event.status === "live") ?? organizationEvents[0] ?? events[0];
      if (nextEvent) {
        setCurrentEventIdState(nextEvent.id);
      }
    },
    [events],
  );

  const setCurrentEventId = useCallback((eventId: string) => {
    setCurrentEventIdState(eventId);
  }, []);

  const setActiveEventId = setCurrentEventId;

  const persist = useCallback(
    async (kind: "organization" | "event" | "guest" | "reservation" | "table" | "checkin" | "attempt", value: unknown) => {
      try {
        if (kind === "organization") {
          await repositories.organizations.upsert(value as Organization);
        } else if (kind === "event") {
          await repositories.events.upsert(value as PlatformEvent);
        } else if (kind === "guest") {
          await repositories.guests.upsert(value as Guest);
        } else if (kind === "reservation") {
          await repositories.reservations.upsert(value as ReservationRecord);
        } else if (kind === "table") {
          await repositories.tables.upsert(value as TableRecord);
        } else if (kind === "checkin") {
          await repositories.checkIns.upsert(value as CheckIn);
        } else if (kind === "attempt") {
          await repositories.timeline.upsert(value as TimelineEvent);
        }
      } catch (exception) {
        setError(exception as Error);
        setStatus("error");
      }
    },
    [repositories],
  );

  const captureSnapshot = useCallback(
    () => ({
      organizations: clone(organizations),
      events: clone(events),
      guests: clone(guests),
      reservations: clone(reservations),
      tables: clone(tables),
      checkIns: clone(checkIns),
      attempts: clone(attempts),
      currentOrganizationId,
      currentEventId,
    }),
    [attempts, checkIns, currentEventId, currentOrganizationId, events, guests, organizations, reservations, tables],
  );

  const restoreSnapshot = useCallback((snapshot: ReturnType<typeof captureSnapshot>) => {
    setOrganizations(snapshot.organizations);
    setEvents(snapshot.events);
    setGuests(snapshot.guests);
    setReservations(snapshot.reservations);
    setTables(snapshot.tables);
    setCheckIns(snapshot.checkIns);
    setAttempts(snapshot.attempts);
    setCurrentOrganizationIdState(snapshot.currentOrganizationId);
    setCurrentEventIdState(snapshot.currentEventId);
  }, []);

  const createEvent = useCallback(
    (event: PlatformEvent) => {
      const snapshot = captureSnapshot();
      setEvents((current) => (current.some((item) => item.id === event.id) ? current.map((item) => (item.id === event.id ? event : item)) : [event, ...current]));
      setCurrentOrganizationIdState(event.organizationId);
      setCurrentEventIdState(event.id);
      void persist("event", event).catch(() => restoreSnapshot(snapshot));
    },
    [captureSnapshot, persist, restoreSnapshot],
  );

  const createOrganization = useCallback(
    (organization: Organization) => {
      const snapshot = captureSnapshot();
      setOrganizations((current) => (current.some((item) => item.id === organization.id) ? current.map((item) => (item.id === organization.id ? organization : item)) : [organization, ...current]));
      void persist("organization", organization).catch(() => restoreSnapshot(snapshot));
      return organization;
    },
    [captureSnapshot, persist, restoreSnapshot],
  );

  const setEventStatus = useCallback(
    (eventId: string, status: PlatformEvent["status"]) => {
      const snapshot = captureSnapshot();
      const targetEvent = events.find((event) => event.id === eventId);
      if (!targetEvent) return;
      setEvents((current) => current.map((event) => (event.id === eventId ? { ...event, status } : event)));
      void repositories.events.setStatus(eventId, status).catch(() => restoreSnapshot(snapshot));
      notify({
        title: status === "published" ? "Evento publicado" : status === "finished" ? "Evento cerrado" : "Evento actualizado",
        description:
          status === "published"
            ? `${targetEvent.name} quedó listo para operar.`
            : status === "finished"
              ? `${targetEvent.name} quedó cerrado.`
              : `${targetEvent.name} se actualizó a ${status}.`,
        tone: status === "finished" ? "warning" : "success",
        icon: "bell",
        href: "/events",
        undo: {
          label: "Deshacer",
          timeoutMs: 6000,
          onUndo: () => restoreSnapshot(snapshot),
        },
      });
    },
    [captureSnapshot, events, notify, repositories.events, restoreSnapshot],
  );

  const createReservation = useCallback(
    (input: ReservationCreationInput) => {
      const snapshot = captureSnapshot();
      const bundle = createReservationBundle(input);
      const event = currentEvent;
      const tableId = bundle.reservation.tableId ?? input.selectedTable.id;
      const tableName = bundle.reservation.tableName ?? input.selectedTable.name;
      const reservation: ReservationRecord = {
        ...bundle.reservation,
        eventId: event.id,
        eventName: event.name,
        tableId,
        tableName,
      };
      const reservationGuests = bundle.guests.map((guest) => ({
        ...guest,
        eventId: event.id,
        eventName: event.name,
        tableId,
        tableName,
      }));

      setReservations((current) => [reservation, ...current]);
      setGuests((current) => [...reservationGuests, ...current]);

      void repositories.reservations.upsert(reservation).catch(() => restoreSnapshot(snapshot));
      reservationGuests.forEach((guest) => void repositories.guests.upsert(guest).catch(() => restoreSnapshot(snapshot)));

      notify({
        title: "Reserva creada",
        description: `${reservation.name} quedó registrada en el estado compartido.`,
        tone: "success",
        icon: "reservation",
        href: "/reservations",
        undo: {
          label: "Deshacer",
          timeoutMs: 6000,
          onUndo: () => restoreSnapshot(snapshot),
        },
      });

      return reservation;
    },
    [captureSnapshot, currentEvent, notify, repositories.guests, repositories.reservations, restoreSnapshot],
  );

  const addReservationGuest = useCallback(
    (reservationId: string, guestInput: ReservationGuestInput) => {
      const snapshot = captureSnapshot();
      const reservation = reservations.find((item) => item.id === reservationId);
      if (!reservation) return;
      const reservationGuests = guests.filter((guest) => guest.reservationId === reservationId);
      const guestIndex = reservationGuests.length + 1;
      const guestId = `guest-${reservation.id}-${guestIndex}`;
      const nextGuest: Guest = {
        id: guestId,
        guestName: guestInput.guestName,
        reservationName: reservation.name,
        reservationCode: reservation.code,
        reservationId: reservation.id,
        eventId: reservation.eventId,
        eventName: reservation.eventName,
        tableId: reservation.tableId,
        tableName: reservation.tableName,
        eventStatus: currentEvent.status === "live" ? "En curso" : "Próximo",
        invitationSequence: `${guestIndex} de ${guestIndex}`,
        invitationCode: `${reservation.code}-${String(guestIndex).padStart(2, "0")}`,
        carnet: guestInput.carnet,
        whatsapp: guestInput.whatsapp,
        deliveryStatus: "Enviada",
        admissionStatus: "Pendiente",
        reservationStatus: reservation.status,
        deliveryHistory: [{ time: nowIso().slice(11, 16), title: "Enviada", detail: "Invitación generada desde el panel operativo" }],
        operatorActivity: [{ time: nowIso().slice(11, 16), action: "Invitado agregado", operator: "Recepción", reason: "Alta manual en Reservations" }],
        qrStatus: "Válido",
        manualAdmission: false,
      } as Guest;

      setGuests((current) => [nextGuest, ...current]);
      setReservations((current) =>
        current.map((item) =>
          item.id === reservationId
            ? {
                ...item,
                guestIds: [...item.guestIds, guestId],
                timeline: [
                  ...item.timeline,
                  { id: `reservation-${item.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Invitado agregado", detail: `${guestInput.guestName} se sumó a la reserva.`, tone: "info" },
                ],
                updatedAt: nowIso().slice(11, 16),
              }
            : item,
        ),
      );

      void repositories.guests.upsert(nextGuest).catch(() => restoreSnapshot(snapshot));
      void repositories.reservations.upsert({
        ...reservation,
        guestIds: [...reservation.guestIds, guestId],
      }).catch(() => restoreSnapshot(snapshot));

      notify({
        title: "Invitado agregado",
        description: `${guestInput.guestName} se sumó a ${reservation.name}.`,
        tone: "info",
        icon: "guest",
        href: "/reservations",
        undo: {
          label: "Deshacer",
          timeoutMs: 6000,
          onUndo: () => restoreSnapshot(snapshot),
        },
      });
    },
    [captureSnapshot, currentEvent.status, guests, notify, repositories.guests, repositories.reservations, reservations, restoreSnapshot],
  );

  const updateReservationGuest = useCallback(
    ({
      reservationId,
      guestId,
      action,
    }: {
      reservationId: string;
      guestId: string;
      action: ReservationGuestAction;
    }) => {
      const snapshot = captureSnapshot();
      const reservation = reservations.find((item) => item.id === reservationId);
      if (!reservation) return;

      const nextGuests: Guest[] =
        action === "remove"
          ? guests.filter((guest) => guest.id !== guestId)
          : guests.map((guest): Guest => {
              if (guest.id !== guestId) return guest;
              if (action === "confirm") {
                return {
                  ...guest,
                  reservationStatus: "Confirmed",
                  admissionStatus: guest.admissionStatus === "Ingresó" ? guest.admissionStatus : "Pendiente",
                  qrStatus: guest.admissionStatus === "Ingresó" ? guest.qrStatus : "Válido",
                  tableId: guest.tableId ?? reservation.tableId,
                  tableName: guest.tableName ?? reservation.tableName,
                };
              }
              if (action === "cancel") {
                return {
                  ...guest,
                  reservationStatus: "Cancelled",
                  admissionStatus: guest.admissionStatus === "Ingresó" ? guest.admissionStatus : "Anulada",
                  qrStatus: guest.admissionStatus === "Ingresó" ? guest.qrStatus : "Anulado",
                  checkInTime: guest.admissionStatus === "Ingresó" ? guest.checkInTime : undefined,
                  checkInMethod: guest.admissionStatus === "Ingresó" ? guest.checkInMethod : undefined,
                  gate: guest.admissionStatus === "Ingresó" ? guest.gate : undefined,
                  tableId: guest.admissionStatus === "Ingresó" ? guest.tableId : undefined,
                  tableName: guest.admissionStatus === "Ingresó" ? guest.tableName : undefined,
                };
              }
              if (action === "revert") {
                return {
                  ...guest,
                  reservationStatus: "Confirmed",
                  admissionStatus: "Pendiente",
                  qrStatus: "Válido",
                  checkInTime: undefined,
                  checkInMethod: undefined,
                  gate: undefined,
                  manualAdmission: false,
                  tableId: reservation.tableId,
                  tableName: reservation.tableName,
                };
              }
              return guest;
            });

      setGuests(nextGuests);

      if (action === "remove") {
        void repositories.guests.delete(guestId).catch(() => restoreSnapshot(snapshot));
      } else {
        const nextGuest = nextGuests.find((guest) => guest.id === guestId);
        if (nextGuest) {
          void repositories.guests.upsert(nextGuest).catch(() => restoreSnapshot(snapshot));
        }
      }

      setReservations((current) =>
        current.map((item) =>
          item.id === reservationId
            ? {
                ...updateReservationStatusFromGuests({
                  ...item,
                  guestIds: nextGuests.filter((guest) => guest.reservationId === reservationId).map((guest) => guest.id),
                }, nextGuests),
                timeline: [
                  ...item.timeline,
                  {
                    id: `reservation-${item.id}-${createUuid()}`,
                    time: nowIso().slice(11, 16),
                    title:
                      action === "confirm"
                        ? "Invitado confirmado"
                        : action === "cancel"
                          ? "Invitado cancelado"
                          : action === "revert"
                            ? "Ingreso revertido"
                            : "Invitado eliminado",
                    detail:
                      action === "confirm"
                        ? "La invitación quedó confirmada."
                        : action === "cancel"
                          ? "La invitación fue anulada."
                          : action === "revert"
                            ? "El ingreso volvió a estado pendiente."
                            : "Se retiró un invitado del grupo.",
                    tone: action === "cancel" ? "danger" : action === "confirm" ? "info" : "warning",
                  },
                ],
              }
            : item,
        ),
      );

      if (action === "remove") {
        void repositories.reservations.update(reservationId, {
          guestIds: nextGuests.filter((guest) => guest.reservationId === reservationId).map((guest) => guest.id),
        } as never).catch(() => restoreSnapshot(snapshot));
      }

      notify({
        title:
          action === "confirm"
            ? "Invitado confirmado"
            : action === "cancel"
              ? "Invitado cancelado"
              : action === "revert"
                ? "Ingreso revertido"
                : "Invitado eliminado",
        description:
          action === "confirm"
            ? "La invitación quedó confirmada."
            : action === "cancel"
              ? "La invitación fue anulada."
              : action === "revert"
                ? "El ingreso volvió a estado pendiente."
                : "Se retiró un invitado del grupo.",
        tone: action === "confirm" ? "info" : action === "cancel" ? "danger" : "warning",
        icon: "guest",
        href: "/reservations",
        undo: {
          label: "Deshacer",
          timeoutMs: 6000,
          onUndo: () => restoreSnapshot(snapshot),
        },
      });
    },
    [captureSnapshot, guests, notify, repositories.guests, repositories.reservations, reservations, restoreSnapshot],
  );

  const setReservationStatus = useCallback(
    (reservationId: string, status: ReservationStatus) => {
      const snapshot = captureSnapshot();
      const reservation = reservations.find((item) => item.id === reservationId);
      if (!reservation) return;
      const affectedGuests = guests.filter((guest) => guest.reservationId === reservationId);
      setReservations((current) =>
        current.map((item) =>
          item.id === reservationId
            ? {
                ...item,
                status,
                tableId: status === "Cancelled" || status === "No Show" ? undefined : item.tableId,
                tableName: status === "Cancelled" || status === "No Show" ? "Sin mesa" : item.tableName,
                timeline: [
                  ...item.timeline,
                  {
                    id: `reservation-${item.id}-${createUuid()}`,
                    time: nowIso().slice(11, 16),
                    title:
                      status === "Confirmed"
                        ? "Reserva confirmada"
                        : status === "Pending"
                          ? "Reserva pendiente"
                          : status === "Completed"
                            ? "Reserva completada"
                            : status === "Cancelled"
                              ? "Reserva cancelada"
                              : status === "No Show"
                                ? "No show registrado"
                                : "Reserva en borrador",
                    detail: status === "Cancelled" || status === "No Show" ? "Restado al ciclo operativo" : "Estado sincronizado con el flujo",
                    tone: status === "Cancelled" || status === "No Show" ? "danger" : status === "Pending" || status === "Draft" ? "warning" : "success",
                  },
                ],
              }
            : item,
        ),
      );
      setGuests((current) =>
        current.map((guest): Guest => {
          if (guest.reservationId !== reservationId) {
            return guest;
          }

          if (status === "Cancelled") {
            return {
              ...guest,
              reservationStatus: status,
              admissionStatus: guest.admissionStatus === "Ingresó" ? guest.admissionStatus : "Anulada",
              qrStatus: guest.admissionStatus === "Ingresó" ? guest.qrStatus : "Anulado",
              tableId: guest.admissionStatus === "Ingresó" ? guest.tableId : undefined,
              tableName: guest.admissionStatus === "Ingresó" ? guest.tableName : undefined,
            };
          }

          if (status === "No Show") {
            return {
              ...guest,
              reservationStatus: status,
              admissionStatus: guest.admissionStatus === "Ingresó" ? guest.admissionStatus : "Bloqueada",
              qrStatus: guest.admissionStatus === "Ingresó" ? guest.qrStatus : "Bloqueado",
              tableId: guest.admissionStatus === "Ingresó" ? guest.tableId : undefined,
              tableName: guest.admissionStatus === "Ingresó" ? guest.tableName : undefined,
            };
          }

          return {
            ...guest,
            reservationStatus: status,
            tableId: guest.tableId,
            tableName: guest.tableName,
          };
        }),
      );
      affectedGuests.forEach((guest) => {
        const nextGuest: Guest = {
          ...guest,
          reservationStatus: status,
          admissionStatus:
            status === "Cancelled"
              ? guest.admissionStatus === "Ingresó"
                ? guest.admissionStatus
                : "Anulada"
              : status === "No Show"
                ? guest.admissionStatus === "Ingresó"
                  ? guest.admissionStatus
                  : "Bloqueada"
                : guest.admissionStatus,
          qrStatus:
            status === "Cancelled"
              ? guest.admissionStatus === "Ingresó"
                ? guest.qrStatus
                : "Anulado"
              : status === "No Show"
                ? guest.admissionStatus === "Ingresó"
                  ? guest.qrStatus
                  : "Bloqueado"
                : guest.qrStatus,
          tableId: status === "Cancelled" || status === "No Show" ? (guest.admissionStatus === "Ingresó" ? guest.tableId : undefined) : guest.tableId,
          tableName: status === "Cancelled" || status === "No Show" ? (guest.admissionStatus === "Ingresó" ? guest.tableName : undefined) : guest.tableName,
        };

        void repositories.guests
          .upsert(nextGuest)
          .catch(() => restoreSnapshot(snapshot));
      });
      void repositories.reservations.setStatus(reservationId, status).catch(() => restoreSnapshot(snapshot));
      notify({
        title: status === "Confirmed" ? "Reserva confirmada" : status === "Pending" ? "Reserva pendiente" : status === "Completed" ? "Reserva completada" : status === "Cancelled" ? "Reserva cancelada" : status === "No Show" ? "No show registrado" : "Reserva actualizada",
        description: `${reservation.name} quedó sincronizada con el estado ${status}.`,
        tone: status === "Cancelled" || status === "No Show" ? "danger" : status === "Pending" || status === "Draft" ? "warning" : "success",
        icon: "reservation",
        href: "/reservations",
        undo: status === "Cancelled" || status === "No Show" ? { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } : undefined,
      });
    },
    [captureSnapshot, guests, notify, repositories.guests, repositories.reservations, reservations, restoreSnapshot],
  );

  const assignReservationToTable = useCallback(
    (reservationId: string, tableId: string) => {
      const snapshot = captureSnapshot();
      const reservation = reservations.find((item) => item.id === reservationId);
      const table = tables.find((item) => item.id === tableId);
      if (!reservation || !table) return;
      setReservations((current) =>
        current.map((item) =>
          item.id === reservationId
            ? { ...item, tableId: table.id, tableName: table.name, timeline: [...item.timeline, { id: `reservation-${item.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Mesa asignada", detail: `${table.name} quedó vinculada a la reserva.`, tone: "info" }] }
            : item,
        ),
      );
      setGuests((current) => current.map((guest) => (guest.reservationId === reservationId ? { ...guest, tableId: table.id, tableName: table.name } : guest)));
      setTables((current) => current.map((item) => (item.id === table.id ? { ...item, status: "Reserved", closed: false } : item)));
      void repositories.reservations.assignToTable(reservationId, tableId).catch(() => restoreSnapshot(snapshot));
      void repositories.tables.update(tableId, { status: "Reserved", closed: false } as never).catch(() => restoreSnapshot(snapshot));
      notify({ title: "Mesa asignada", description: `${table.name} quedó vinculada a la reserva.`, tone: "info", icon: "table", href: "/tables", undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } });
    },
    [captureSnapshot, notify, repositories.reservations, repositories.tables, reservations, restoreSnapshot, tables],
  );

  const moveGuestToTable = useCallback(
    (guestId: string, tableId: string) => {
      const snapshot = captureSnapshot();
      const table = tables.find((item) => item.id === tableId);
      const guest = guests.find((item) => item.id === guestId);
      if (!table || !guest) return;
      setGuests((current) => current.map((item) => (item.id === guestId ? { ...item, tableId: table.id, tableName: table.name } : item)));
      setReservations((current) =>
        current.map((reservation) =>
          reservation.id === guest.reservationId
            ? { ...reservation, timeline: [...reservation.timeline, { id: `reservation-${reservation.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Mesa cambiada", detail: `${guest.guestName} pasó a ${table.name}.`, tone: "warning" }] }
            : reservation,
        ),
      );
      void repositories.guests.moveToTable(guestId, tableId).catch(() => restoreSnapshot(snapshot));
      notify({ title: "Mesa cambiada", description: `${guest.guestName} pasó a ${table.name}.`, tone: "warning", icon: "table", href: "/tables", undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } });
    },
    [captureSnapshot, guests, notify, repositories.guests, restoreSnapshot, tables],
  );

  const releaseTable = useCallback(
    (tableId: string) => {
      const snapshot = captureSnapshot();
      const table = tables.find((item) => item.id === tableId);
      if (!table) return;
      setTables((current) => current.map((item) => (item.id === tableId ? { ...item, status: "Available", closed: false } : item)));
      setReservations((current) =>
        current.map((reservation) =>
          reservation.tableId === tableId
            ? { ...reservation, tableId: undefined, tableName: "Sin mesa", timeline: [...reservation.timeline, { id: `reservation-${reservation.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Mesa liberada", detail: `${table.name} quedó disponible nuevamente.`, tone: "warning" }] }
            : reservation,
        ),
      );
      setGuests((current) => current.map((guest) => (guest.tableId === tableId ? { ...guest, tableId: undefined, tableName: undefined } : guest)));
      void repositories.tables.release(tableId).catch(() => restoreSnapshot(snapshot));
      notify({ title: "Mesa liberada", description: `${table.name} quedó disponible nuevamente.`, tone: "warning", icon: "table", href: "/tables", undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } });
    },
    [captureSnapshot, notify, repositories.tables, restoreSnapshot, tables],
  );

  const closeTable = useCallback(
    (tableId: string) => {
      const snapshot = captureSnapshot();
      const table = tables.find((item) => item.id === tableId);
      if (!table) return;
      setTables((current) => current.map((item) => (item.id === tableId ? { ...item, status: "Closed", closed: true } : item)));
      setReservations((current) =>
        current.map((reservation) =>
          reservation.tableId === tableId
            ? { ...reservation, timeline: [...reservation.timeline, { id: `reservation-${reservation.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Mesa cerrada", detail: `${table.name} quedó fuera de servicio temporalmente.`, tone: "danger" }] }
            : reservation,
        ),
      );
      void repositories.tables.close(tableId).catch(() => restoreSnapshot(snapshot));
      notify({ title: "Mesa cerrada", description: `${table.name} quedó fuera de servicio temporalmente.`, tone: "danger", icon: "table", href: "/tables", undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } });
    },
    [captureSnapshot, notify, repositories.tables, restoreSnapshot, tables],
  );

  const registerCheckIn = useCallback(
    ({ query, method, operator = method === "Manual" ? "Recepción" : "Escáner" }: { query: string; method: CheckInMethod; operator?: string; manual?: boolean }) => {
      const snapshot = captureSnapshot();
      const guest = findGuestByQuery(query);
      const timestampIso = nowIso();
      const timestamp = timestampIso.slice(11, 16);
      const admissionMethod = method === "Manual" ? "manual" : "qr";
      const ticket = guest ? buildAccessTicketFromGuest(guest, timestampIso) : null;
      const result = evaluateAdmission({
        ticket,
        query,
        method: admissionMethod,
        operator,
        gate: method === "Manual" ? "Recepción" : guest?.gate ?? "Principal",
        timestamp: timestampIso,
      });

      const attempt: CheckInAttempt = {
        id: createUuid(),
        eventId: currentEvent.id,
        query,
        method,
        timestamp,
        result: mapAdmissionResultToAttemptResult(result.result),
        guestId: guest?.id,
        guestName: guest?.guestName,
        note: result.note,
      };

      setAttempts((current) => [attempt, ...current].slice(0, 12));

      const timelineEntry = createAdmissionTimelineEntry(result, ticket);
      void repositories.timeline.upsert(timelineEntry).catch(() => restoreSnapshot(snapshot));

      if (!guest) {
        notify({
          title: result.title,
          description: result.note,
          tone: result.tone,
          icon: "alert",
          href: "/check-in",
        });
        return { result: attempt.result, note: attempt.note };
      }

      if (result.result !== "Valid") {
        notify({
          title: result.title,
          description: result.note,
          tone: result.tone,
          icon: result.tone === "success" ? "checkin" : "alert",
          href: "/check-in",
        });
        return { result: attempt.result, guest, note: attempt.note };
      }

      const nextGuest: Guest = {
        ...guest,
        admissionStatus: "Ingresó",
        qrStatus: "Usado",
        reservationStatus: "Checked In",
        checkInTime: timestamp,
        checkInMethod: method,
        gate: method === "Manual" ? "Recepción" : guest.gate ?? "Principal",
        manualAdmission: method === "Manual" ? true : guest.manualAdmission,
      };
      const checkIn: CheckIn = {
        id: `${guest.id}-${timestamp}`,
        accessType: method === "Manual" ? "manual" : "qr",
        guestId: guest.id,
        reservationId: guest.reservationId,
        eventId: guest.eventId,
        accessGrantId: guest.reservationId,
        method,
        checkedInAt: timestamp,
        checkedOutAt: undefined,
        operator,
        gate: method === "Manual" ? "Recepción" : guest.gate ?? "Principal",
        notes: result.note,
        auditTrail: [
          {
            id: createUuid(),
            timestamp,
            kind: "access.checked_in",
            title: result.title,
            description: result.note,
            tone: "success",
            operator,
            gate: method === "Manual" ? "Recepción" : guest.gate ?? "Principal",
            metadata: { method: admissionMethod, query, result: result.result },
          },
        ],
        reentryAllowed: true,
        maxEntries: 1,
        reentryWindowMinutes: undefined,
        attemptCount: 1,
        lastAttemptAt: timestamp,
        status: "Checked In",
        source: method === "Manual" ? "manual" : "qr",
      };

      setGuests((current) => current.map((item) => (item.id === guest.id ? nextGuest : item)));
      setCheckIns((current) => [checkIn, ...current].slice(0, 12));
      void repositories.checkIns.upsert(checkIn).catch(() => restoreSnapshot(snapshot));
      void repositories.guests.upsert(nextGuest).catch(() => restoreSnapshot(snapshot));
      notify({
        title: result.title,
        description: result.note,
        tone: result.tone,
        icon: "checkin",
        href: "/check-in",
        undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) },
      });
      return { result: attempt.result, guest: nextGuest, note: attempt.note };
    },
    [captureSnapshot, currentEvent.id, findGuestByQuery, notify, repositories.checkIns, repositories.guests, repositories.timeline, restoreSnapshot],
  );

  const value = useMemo<WorkspaceServiceValue>(
    () => ({
      organizations,
      currentOrganizationId,
      currentOrganization,
      events,
      currentEventId,
      currentEvent,
      activeEventId: currentEventId,
      activeEvent,
      guests,
      reservations,
      reservationSummaries,
      tables,
      tableSummaries,
      checkIns,
      attempts,
      timelineEvents,
      workspaceIntelligence,
      workspacePriority,
      dashboard,
      customers,
      setCurrentOrganizationId,
      setCurrentEventId,
      setActiveEventId,
      setReservationStatus,
      findGuestByQuery,
      searchGuests: searchGuestList,
      registerCheckIn,
      createReservation,
      createOrganization,
      addReservationGuest,
      updateReservationGuest,
      assignReservationToTable,
      moveGuestToTable,
      releaseTable,
      closeTable,
      createEvent,
      setEventStatus,
      setOrganizationsState: setOrganizations,
      setEventsState: setEvents,
      setGuestsState: setGuests,
      setReservationsState: setReservations,
      setTablesState: setTables,
      setCheckInsState: setCheckIns,
      setAttemptsState: setAttempts,
      repositories,
      status,
      error,
      reloadWorkspace,
    }),
    [
      addReservationGuest,
      activeEvent,
      assignReservationToTable,
      attempts,
      checkIns,
      closeTable,
      createEvent,
      createOrganization,
      createReservation,
      currentEvent,
      currentEventId,
      currentOrganization,
      currentOrganizationId,
      customers,
      dashboard,
      error,
      events,
      findGuestByQuery,
      guests,
      moveGuestToTable,
      organizations,
      registerCheckIn,
      releaseTable,
      reloadWorkspace,
      workspaceIntelligence,
      workspacePriority,
      reservationSummaries,
      reservations,
      repositories,
      searchGuestList,
      setEventStatus,
      setCurrentEventId,
      setCurrentOrganizationId,
      setActiveEventId,
      setReservationStatus,
      status,
      tableSummaries,
      tables,
      updateReservationGuest,
      timelineEvents,
    ],
  );

  return <WorkspaceServiceContext.Provider value={value}>{children}</WorkspaceServiceContext.Provider>;
}

export function useWorkspaceServices() {
  const context = useContext(WorkspaceServiceContext);

  if (!context) {
    throw new Error("useWorkspaceServices must be used within a WorkspaceServiceProvider");
  }

  return context;
}

export function useWorkspaceData() {
  return useWorkspaceServices();
}

export function useCheckInStore() {
  return useWorkspaceData();
}

export function createWorkspaceRepositoriesForMode(mode: "memory" | "supabase") {
  void mode;
  return createSupabaseWorkspaceRepositories;
}
