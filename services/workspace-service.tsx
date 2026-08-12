"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";

import { useFeedback } from "@/components/premium-feedback";
import {
  getEffectivePermissions,
  getRolePresetBySlug,
  isOwnerAccount,
  normalizeAccountPermissions,
} from "@/features/accounts/domain/accounts-domain";
import type { AccountPermissionKey, AccountRolePreset, AccountUser, OrganizationAccount, OrganizationMembership } from "@/features/accounts/types";
import { admissionFilters, deliveryFilters, quickFilters, reservationFilters } from "@/features/customers/domain/customer-filters";
import { searchGuests } from "@/features/check-in/domain/check-in-domain";
import type {
  Event as PlatformEvent,
  EventLayout,
  EventLayoutResource,
  EventLayoutSector,
  Organization,
  Resource,
  Sector,
  Venue,
  VenueLayout,
  VenueLayoutResource,
  VenueLayoutSector,
} from "@/features/domain/types";
import { mapEventToLegacyEvent } from "@/features/domain/compatibility";
import { getAdmissionsForEvent, getAttendeesForEvent, getReservationsForEvent } from "@/features/domain/selectors";
import { buildReservationSummaries, createReservationBundle, normalizeReservationStatus, updateReservationStatusFromGuests } from "@/features/reservations/domain/reservation-domain";
import type {
  ReservationCreationInput,
  ReservationGuestAction,
  ReservationGuestInput,
  ReservationRecord,
  ReservationStatus,
  ReservationSummary,
  ReservationUpdateInput,
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
import {
  buildAccessGrantFromGuest,
  buildAccessGrantTimelineEvent,
  resolveAccessGrantByQuery,
} from "@/features/access/domain/access-ledger";
import {
  buildCompletedCheckInBundle,
  isAccessGrantAlreadyConsumed,
  buildRejectedCheckInTimelineEntry,
  persistCompletedCheckInBundle,
} from "@/features/check-in/domain/check-in-persistence";
import { buildWorkspaceIntelligence, type WorkspaceIntelligence } from "@/domain/workspace-intelligence";
import { buildWorkspacePrioritySnapshot, type WorkspacePrioritySnapshot } from "@/domain/workspace-priority";
import { clearInvalidSupabaseBrowserSession, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/helpers";
import { createUuid, nowIso } from "@/lib/supabase/helpers";
import { createSupabaseWorkspaceRepositories, type SupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";
import {
  resolveCurrentEventLayout,
  resolveCurrentEventLayoutResource,
  resolveCurrentVenueLayout,
  resolveCurrentVenueResources,
  resolveCurrentVenueSectors,
} from "@/services/workspace-layout-resolution";

type WorkspaceServiceStatus = "loading" | "ready" | "empty" | "error";
type WorkspaceSnapshot = Omit<WorkspaceBootstrap, "timelineEvents"> & {
  timelineEvents?: TimelineEvent[];
};

type WorkspaceServiceValue = {
  users: AccountUser[];
  profiles: OrganizationMembership[];
  roles: AccountRolePreset[];
  accounts: OrganizationAccount[];
  currentUser: AccountUser | null;
  currentProfile: OrganizationMembership | null;
  currentAccount: OrganizationAccount;
  effectivePermissions: AccountPermissionKey[];
  hasPermission: (permission: AccountPermissionKey) => boolean;
  can: (permission: AccountPermissionKey) => boolean;
  organizations: Organization[];
  venues: Venue[];
  sectors: Sector[];
  resources: Resource[];
  venueLayouts: VenueLayout[];
  venueLayoutSectors: VenueLayoutSector[];
  venueLayoutResources: VenueLayoutResource[];
  eventLayouts: EventLayout[];
  eventLayoutSectors: EventLayoutSector[];
  eventLayoutResources: EventLayoutResource[];
  currentVenue: Venue | null;
  currentVenueSectors: Sector[];
  currentVenueResources: Resource[];
  currentOrganizationId: string;
  currentOrganization: Organization;
  events: PlatformEvent[];
  currentEventId: string;
  currentEvent: PlatformEvent;
  currentProfileId: string;
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
  setCurrentProfileId: (profileId: string) => void;
  createAccount: (params: {
    userId?: string;
    email: string;
    displayName: string;
    organizationId: string;
    roleSlug: string;
    area?: string;
    permissions?: AccountPermissionKey[];
  }) => Promise<OrganizationAccount>;
  updateAccount: (account: OrganizationAccount) => Promise<OrganizationAccount>;
  setAccountStatus: (profileId: string, status: "active" | "inactive") => Promise<void>;
  createVenue: (venue: Venue) => Promise<Venue>;
  updateVenue: (venue: Venue) => Promise<Venue>;
  setVenueStatus: (venueId: string, status: Venue["status"]) => Promise<void>;
  createSector: (sector: Sector) => Promise<Sector>;
  updateSector: (sector: Sector) => Promise<Sector>;
  setSectorStatus: (sectorId: string, status: Sector["status"]) => Promise<void>;
  createResource: (resource: Resource) => Promise<Resource>;
  updateResource: (resource: Resource) => Promise<Resource>;
  setResourceStatus: (resourceId: string, status: Resource["status"]) => Promise<void>;
  moveResourceToSector: (resourceId: string, sectorId: string) => Promise<void>;
  findGuestByQuery: (query: string) => Guest | null;
  searchGuests: (query: string) => Guest[];
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
  createReservation: (input: ReservationCreationInput) => Promise<ReservationRecord>;
  updateReservation: (input: ReservationUpdateInput) => Promise<ReservationRecord>;
  createOrganization: (organization: Organization) => Promise<Organization>;
  addReservationGuest: (reservationId: string, guest: ReservationGuestInput) => void;
  appendReservationGuests: (reservationId: string, guests: ReservationGuestInput[]) => Promise<ReservationRecord | undefined>;
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
  createEvent: (event: PlatformEvent) => Promise<PlatformEvent>;
  setEventStatus: (eventId: string, status: PlatformEvent["status"]) => void;
  setOrganizationsState: Dispatch<SetStateAction<Organization[]>>;
  setVenuesState: Dispatch<SetStateAction<Venue[]>>;
  setSectorsState: Dispatch<SetStateAction<Sector[]>>;
  setResourcesState: Dispatch<SetStateAction<Resource[]>>;
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

function getOrganizationSelection(organizations: Organization[], currentOrganizationId: string) {
  return organizations.find((organization) => organization.id === currentOrganizationId)
    ?? organizations.find((organization) => organization.status === "active")
    ?? {
      id: "",
      name: "",
      slug: "",
      status: "active",
      timezone: "America/La_Paz",
      branding: {},
      settings: {},
    };
}

function getEventSelection(events: PlatformEvent[], organizationId: string, currentEventId: string) {
  const current = events.find((event) => event.id === currentEventId && (!organizationId || event.organizationId === organizationId))
    ?? events.find((event) => event.id === currentEventId)
    ?? events.find((event) => event.organizationId === organizationId && event.status === "live")
    ?? events.find((event) => event.organizationId === organizationId);

  return current ?? {
    id: "",
    organizationId,
    name: "",
    eventType: "custom",
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

function getAccountSelection({
  users,
  profiles,
  roles,
  currentOrganizationId,
  currentProfileId,
}: {
  users: AccountUser[];
  profiles: OrganizationMembership[];
  roles: AccountRolePreset[];
  currentOrganizationId: string;
  currentProfileId: string;
}) {
  const activeProfiles = profiles.filter((profile) => profile.organizationId === currentOrganizationId && !profile.deletedAt);
  const selectedProfile = activeProfiles.find((profile) => profile.id === currentProfileId)
    ?? activeProfiles.find((profile) => (profile.metadata?.bootstrap as boolean | undefined) === true || (profile.metadata?.bootstrapOwner as boolean | undefined) === true)
    ?? activeProfiles[0];
  const selectedUser = selectedProfile ? users.find((user) => user.id === selectedProfile.userId && !user.deletedAt) ?? null : null;
  const role = selectedProfile ? roles.find((item) => item.id === selectedProfile.roleId) ?? getRolePresetBySlug("administrator") : getRolePresetBySlug("owner");

  if (!selectedProfile || !selectedUser) {
    const permissions = getEffectivePermissions({
      permissions: role.permissions,
      rolePermissions: role.permissions,
    });

    return {
      account: {
        id: "bootstrap-account",
        organizationId: currentOrganizationId,
        userId: "",
        userEmail: "",
        userDisplayName: "Cuenta principal",
        displayName: "Cuenta principal",
        roleId: role.id,
        roleSlug: role.slug,
        roleName: role.name,
        rolePermissions: role.permissions,
        permissions,
        attributes: {
          area: "dirección",
          status: "active",
          bootstrap: true,
        },
        status: "active" as const,
        isOwner: true,
        createdAt: "",
        updatedAt: "",
        metadata: { bootstrap: true },
      } satisfies OrganizationAccount,
      user: null,
      profile: null,
    };
  }

  const profilePermissions = normalizeAccountPermissions(
      selectedProfile.metadata?.permissions,
    role.permissions,
  );
  const permissions = profilePermissions.length ? profilePermissions : role.permissions;
  const isOwner = selectedProfile.roleId === role.id && role.slug === "owner";
  const accountStatus: "active" | "inactive" = selectedProfile.deletedAt ? "inactive" : selectedProfile.attributes.status === "inactive" ? "inactive" : "active";
  const attributes = {
    area: typeof selectedProfile.attributes.area === "string" ? selectedProfile.attributes.area : undefined,
    title: typeof selectedProfile.attributes.title === "string" ? selectedProfile.attributes.title : undefined,
    status: accountStatus,
    permissions,
    bootstrap: Boolean(selectedProfile.metadata?.bootstrap ?? selectedProfile.metadata?.bootstrapOwner),
    notes: typeof selectedProfile.attributes.notes === "string" ? selectedProfile.attributes.notes : undefined,
  };

  return {
    account: {
      id: selectedProfile.id,
      organizationId: selectedProfile.organizationId,
      userId: selectedProfile.userId,
      userEmail: selectedUser.email,
      userDisplayName: selectedUser.displayName,
      displayName: selectedProfile.displayName,
      roleId: role.id,
      roleSlug: role.slug,
      roleName: role.name,
      rolePermissions: role.permissions,
      permissions,
      attributes,
      status: accountStatus,
      isOwner,
      createdAt: selectedProfile.createdAt,
      updatedAt: selectedProfile.updatedAt,
      deletedAt: selectedProfile.deletedAt,
      metadata: selectedProfile.metadata,
    } satisfies OrganizationAccount,
    user: selectedUser,
    profile: selectedProfile,
  };
}

function clone<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasWorkspaceData(snapshot?: WorkspaceBootstrap | WorkspaceSnapshot | null) {
  if (!snapshot) {
    return false;
  }

  return Boolean(
    snapshot.users.length ||
      snapshot.profiles.length ||
      snapshot.roles.length ||
      snapshot.organizations.length ||
      snapshot.venues.length ||
      snapshot.sectors.length ||
      snapshot.resources.length ||
      snapshot.venueLayouts.length ||
      snapshot.venueLayoutSectors.length ||
      snapshot.venueLayoutResources.length ||
      snapshot.eventLayouts.length ||
      snapshot.eventLayoutSectors.length ||
      snapshot.eventLayoutResources.length ||
      snapshot.events.length ||
      snapshot.guests.length ||
      snapshot.reservations.length ||
      snapshot.tables.length ||
      snapshot.checkIns.length ||
      snapshot.attempts.length ||
      (snapshot.timelineEvents?.length ?? 0),
  );
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
    eventId: guest?.eventId ?? attempt.eventId,
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
  const accessGrant = buildAccessGrantFromGuest(guest);
  const status: Ticket["status"] =
    accessGrant.status === "used"
      ? "Checked In"
      : accessGrant.status === "cancelled"
        ? "Cancelled"
        : accessGrant.status === "blocked"
          ? "Blocked"
          : accessGrant.status === "expired"
            ? "Expired"
            : guest.deliveryStatus === "Vista"
              ? "Viewed"
              : guest.deliveryStatus === "Enviada" || guest.deliveryStatus === "Reenviada"
                ? "Delivered"
                : guest.deliveryStatus === "Pendiente de envío"
                  ? "Sent"
                  : "Created";

  return {
    ...createTicketFromGuest({
      id: accessGrant.id,
      reservationId: accessGrant.reservationId,
      guestId: accessGrant.guestId,
      eventId: accessGrant.eventId,
      code: accessGrant.code,
      qrToken: accessGrant.qrToken,
      accessType: guest.manualAdmission ? "manual" : "invitation",
      createdAt: timestampIso,
      status,
      notes: guest.attention,
      gate: guest.gate,
      zone: guest.seat,
      reentryAllowed: guest.admissionStatus !== "Ingresó",
      maxEntries: accessGrant.usesAllowed,
    }),
    entryCount: accessGrant.usesConsumed,
    attemptCount: guest.checkInTime ? 1 : 0,
    lastAttemptAt: guest.checkInTime ? timestampIso : undefined,
    source: accessGrant.source,
    lastAction: guest.checkInTime ? "Validated" : "Created",
  };
}

function hydrateGuestAccessGrant(guest: Guest): Guest {
  const accessGrant = buildAccessGrantFromGuest(guest);

  return {
    ...guest,
    accessGrantId: accessGrant.id,
    accessCode: accessGrant.code,
    qrToken: accessGrant.qrToken,
  };
}

async function loadWorkspaceFromRepositories(repositories: SupabaseWorkspaceRepositories) {
  const [
    users,
    roles,
    profiles,
    organizations,
    venues,
    sectors,
    resources,
    venueLayouts,
    venueLayoutSectors,
    venueLayoutResources,
    eventLayouts,
    eventLayoutSectors,
    eventLayoutResources,
    events,
    guests,
    reservations,
    tables,
    checkIns,
    timelineEvents,
  ] = await Promise.all([
    repositories.users.list(),
    repositories.roles.list(),
    repositories.profiles.list(),
    repositories.organizations.list(),
    repositories.venues.list(),
    repositories.sectors.list(),
    repositories.resources.list(),
    repositories.venueLayouts.list(),
    repositories.venueLayoutSectors.list(),
    repositories.venueLayoutResources.list(),
    repositories.eventLayouts.list(),
    repositories.eventLayoutSectors.list(),
    repositories.eventLayoutResources.list(),
    repositories.events.list(),
    repositories.guests.list(),
    repositories.reservations.list(),
    repositories.tables.list(),
    repositories.checkIns.list(),
    repositories.timeline.list(),
  ]);

  const currentOrganizationId = organizations.find((organization) => organization.status === "active")?.id ?? "";
  const currentEventId = events.find((event) => event.organizationId === currentOrganizationId && event.status === "live")?.id
    ?? events.find((event) => event.organizationId === currentOrganizationId)?.id
    ?? "";
  const ownerRole = roles.find((role) => role.slug === "owner") ?? roles[0];
  const currentProfileId =
    profiles.find((profile) => profile.organizationId === currentOrganizationId && profile.roleId === ownerRole?.id && !profile.deletedAt)?.id
    ?? profiles.find((profile) => profile.organizationId === currentOrganizationId && !profile.deletedAt)?.id
    ?? profiles.find((profile) => !profile.deletedAt)?.id
    ?? "";

  const attempts = [
    ...timelineEvents.filter((item) => item.kind === "checkin.invalid" || item.kind === "checkin.blocked"),
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
    users,
    roles,
    profiles,
    organizations,
    venues,
    sectors,
    resources,
    venueLayouts,
    venueLayoutSectors,
    venueLayoutResources,
    eventLayouts,
    eventLayoutSectors,
    eventLayoutResources,
    events,
    guests,
    reservations,
    tables,
    checkIns,
    attempts,
    timelineEvents: [
      ...timelineEvents,
    ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    currentOrganizationId,
    currentEventId,
    currentProfileId,
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
  const [venues, setVenues] = useState<Venue[]>(initialWorkspace?.venues ?? []);
  const [sectors, setSectors] = useState<Sector[]>(initialWorkspace?.sectors ?? []);
  const [resources, setResources] = useState<Resource[]>(initialWorkspace?.resources ?? []);
  const [venueLayouts, setVenueLayouts] = useState<VenueLayout[]>(initialWorkspace?.venueLayouts ?? []);
  const [venueLayoutSectors, setVenueLayoutSectors] = useState<VenueLayoutSector[]>(initialWorkspace?.venueLayoutSectors ?? []);
  const [venueLayoutResources, setVenueLayoutResources] = useState<VenueLayoutResource[]>(initialWorkspace?.venueLayoutResources ?? []);
  const [eventLayouts, setEventLayouts] = useState<EventLayout[]>(initialWorkspace?.eventLayouts ?? []);
  const [eventLayoutSectors, setEventLayoutSectors] = useState<EventLayoutSector[]>(initialWorkspace?.eventLayoutSectors ?? []);
  const [eventLayoutResources, setEventLayoutResources] = useState<EventLayoutResource[]>(initialWorkspace?.eventLayoutResources ?? []);
  const [users, setUsers] = useState<AccountUser[]>(initialWorkspace?.users ?? []);
  const [profiles, setProfiles] = useState<OrganizationMembership[]>(initialWorkspace?.profiles ?? []);
  const [roles, setRoles] = useState<AccountRolePreset[]>(initialWorkspace?.roles ?? []);
  const [events, setEvents] = useState<PlatformEvent[]>(initialWorkspace?.events ?? []);
  const [guests, setGuests] = useState<Guest[]>(initialWorkspace?.guests ?? []);
  const [reservations, setReservations] = useState<ReservationRecord[]>(initialWorkspace?.reservations ?? []);
  const [tables, setTables] = useState<TableRecord[]>(initialWorkspace?.tables ?? []);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialWorkspace?.checkIns ?? []);
  const [attempts, setAttempts] = useState<CheckInAttempt[]>(initialWorkspace?.attempts ?? []);
  const [persistedTimelineEvents, setPersistedTimelineEvents] = useState<TimelineEvent[]>(initialWorkspace?.timelineEvents ?? []);
  const consumedAccessGrantIdsRef = useRef<Set<string>>(new Set());
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
  const [currentProfileId, setCurrentProfileIdState] = useState(() => {
    if (initialWorkspace?.currentProfileId) {
      return initialWorkspace.currentProfileId;
    }

    if (typeof window !== "undefined") {
      return window.localStorage.getItem("entryflow.currentProfileId") ?? "";
    }

    return "";
  });
  const [status, setStatus] = useState<WorkspaceServiceStatus>(
    hasWorkspaceData(initialWorkspace) ? "ready" : hasSupabaseConfig() ? "loading" : "empty",
  );
  const [error, setError] = useState<Error | null>(null);
  const [browserAuthReady, setBrowserAuthReady] = useState(() => !hasSupabaseConfig());
  const hydratedRef = useRef(hasWorkspaceData(initialWorkspace) || !hasSupabaseConfig());
  const checkInSubmissionInFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("entryflow.currentOrganizationId", currentOrganizationId);
    window.localStorage.setItem("entryflow.currentEventId", currentEventId);
    window.localStorage.setItem("entryflow.currentProfileId", currentProfileId);
  }, [currentEventId, currentOrganizationId, currentProfileId]);

  useEffect(() => {
    consumedAccessGrantIdsRef.current = new Set(
      checkIns
        .map((checkIn) => checkIn.accessGrantId ?? checkIn.id)
        .filter((value): value is string => Boolean(value)),
    );
  }, [checkIns]);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    let cancelled = false;

    void clearInvalidSupabaseBrowserSession(getSupabaseBrowserClient())
      .catch((exception) => {
        if (!cancelled) {
          setError(exception as Error);
          setStatus("error");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBrowserAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const captureSnapshot = useCallback(
    () => ({
      users: clone(users),
      profiles: clone(profiles),
      roles: clone(roles),
      organizations: clone(organizations),
      venues: clone(venues),
      sectors: clone(sectors),
      resources: clone(resources),
      venueLayouts: clone(venueLayouts),
      venueLayoutSectors: clone(venueLayoutSectors),
      venueLayoutResources: clone(venueLayoutResources),
      eventLayouts: clone(eventLayouts),
      eventLayoutSectors: clone(eventLayoutSectors),
      eventLayoutResources: clone(eventLayoutResources),
      events: clone(events),
      guests: clone(guests),
      reservations: clone(reservations),
      tables: clone(tables),
      checkIns: clone(checkIns),
      attempts: clone(attempts),
      timelineEvents: clone(persistedTimelineEvents),
      currentOrganizationId,
      currentEventId,
      currentProfileId,
    }),
    [attempts, checkIns, currentEventId, currentOrganizationId, currentProfileId, eventLayoutResources, eventLayoutSectors, eventLayouts, events, guests, organizations, persistedTimelineEvents, profiles, reservations, resources, roles, sectors, tables, users, venueLayoutResources, venueLayoutSectors, venueLayouts, venues],
  );

  const restoreSnapshot = useCallback((snapshot: ReturnType<typeof captureSnapshot>) => {
    setUsers(snapshot.users);
    setRoles(snapshot.roles);
    setProfiles(snapshot.profiles);
    setOrganizations(snapshot.organizations);
    setVenues(snapshot.venues);
    setSectors(snapshot.sectors);
    setResources(snapshot.resources);
    setVenueLayouts(snapshot.venueLayouts);
    setVenueLayoutSectors(snapshot.venueLayoutSectors);
    setVenueLayoutResources(snapshot.venueLayoutResources);
    setEventLayouts(snapshot.eventLayouts);
    setEventLayoutSectors(snapshot.eventLayoutSectors);
    setEventLayoutResources(snapshot.eventLayoutResources);
    setEvents(snapshot.events);
    setGuests(snapshot.guests);
    setReservations(snapshot.reservations);
    setTables(snapshot.tables);
    setCheckIns(snapshot.checkIns);
    setAttempts(snapshot.attempts);
    setPersistedTimelineEvents(snapshot.timelineEvents);
    setCurrentOrganizationIdState(snapshot.currentOrganizationId);
    setCurrentEventIdState(snapshot.currentEventId);
    setCurrentProfileIdState(snapshot.currentProfileId);
  }, []);

  const upsertPersistedTimelineEvent = useCallback((entry: TimelineEvent) => {
    setPersistedTimelineEvents((current) => {
      const next = current.some((item) => item.id === entry.id)
        ? current.map((item) => (item.id === entry.id ? entry : item))
        : [entry, ...current];

      return next.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    });
  }, []);

  const reloadWorkspace = useCallback(async () => {
    try {
      setStatus("loading");
      const snapshot = await loadWorkspaceFromRepositories(repositories);
      const nextCurrentOrganizationId =
        snapshot.organizations.find((organization) => organization.id === currentOrganizationId)?.id
        ?? snapshot.organizations.find((organization) => organization.id === snapshot.currentOrganizationId)?.id
        ?? snapshot.organizations.find((organization) => organization.status === "active")?.id
        ?? "";
      const nextCurrentEventId =
        snapshot.events.find((event) => event.id === currentEventId && (!nextCurrentOrganizationId || event.organizationId === nextCurrentOrganizationId))?.id
        ?? snapshot.events.find((event) => event.id === snapshot.currentEventId && (!nextCurrentOrganizationId || event.organizationId === nextCurrentOrganizationId))?.id
        ?? snapshot.events.find((event) => event.organizationId === nextCurrentOrganizationId && event.status === "live")?.id
        ?? snapshot.events.find((event) => event.organizationId === nextCurrentOrganizationId)?.id
        ?? "";
      const nextCurrentProfileId =
      snapshot.profiles.find((profile) => profile.id === currentProfileId && (!nextCurrentOrganizationId || profile.organizationId === nextCurrentOrganizationId) && !profile.deletedAt)?.id
        ?? snapshot.profiles.find((profile) => profile.id === snapshot.currentProfileId && (!nextCurrentOrganizationId || profile.organizationId === nextCurrentOrganizationId) && !profile.deletedAt)?.id
        ?? snapshot.profiles.find((profile) => profile.organizationId === nextCurrentOrganizationId && !profile.deletedAt)?.id
        ?? snapshot.profiles.find((profile) => !profile.deletedAt)?.id
        ?? "";
      setUsers(snapshot.users);
      setRoles(snapshot.roles);
      setProfiles(snapshot.profiles);
      setOrganizations(snapshot.organizations);
      setVenues(snapshot.venues);
      setSectors(snapshot.sectors);
      setResources(snapshot.resources);
      setVenueLayouts(snapshot.venueLayouts);
      setVenueLayoutSectors(snapshot.venueLayoutSectors);
      setVenueLayoutResources(snapshot.venueLayoutResources);
      setEventLayouts(snapshot.eventLayouts);
      setEventLayoutSectors(snapshot.eventLayoutSectors);
      setEventLayoutResources(snapshot.eventLayoutResources);
      setEvents(snapshot.events);
      setGuests(snapshot.guests);
      setReservations(snapshot.reservations);
      setTables(snapshot.tables);
      setCheckIns(snapshot.checkIns);
      setAttempts(snapshot.attempts);
      setPersistedTimelineEvents(snapshot.timelineEvents);
      setCurrentOrganizationIdState(nextCurrentOrganizationId);
      setCurrentEventIdState(nextCurrentEventId);
      setCurrentProfileIdState(nextCurrentProfileId);
      setStatus(
        snapshot.users.length ||
          snapshot.roles.length ||
          snapshot.profiles.length ||
          snapshot.organizations.length ||
          snapshot.venues.length ||
          snapshot.sectors.length ||
          snapshot.resources.length ||
          snapshot.venueLayouts.length ||
          snapshot.venueLayoutSectors.length ||
          snapshot.venueLayoutResources.length ||
          snapshot.eventLayouts.length ||
          snapshot.eventLayoutSectors.length ||
          snapshot.eventLayoutResources.length ||
          snapshot.events.length ||
          snapshot.guests.length ||
          snapshot.reservations.length ||
          snapshot.tables.length ||
          snapshot.checkIns.length ||
          snapshot.attempts.length ||
          snapshot.timelineEvents.length
          ? "ready"
          : "empty",
      );
      setError(null);
    } catch (exception) {
      setError(exception as Error);
      setStatus("error");
    }
  }, [currentEventId, currentOrganizationId, currentProfileId, repositories]);

  useEffect(() => {
    if (hydratedRef.current || !browserAuthReady) {
      return;
    }

    hydratedRef.current = true;

    if (hasWorkspaceData(initialWorkspace)) {
      return;
    }

    if (hasSupabaseConfig()) {
      const timeout = window.setTimeout(() => {
        void reloadWorkspace();
      }, 0);

      return () => {
        window.clearTimeout(timeout);
      };
    }
  }, [browserAuthReady, initialWorkspace, reloadWorkspace]);

  useEffect(() => {
    if (!browserAuthReady) {
      return;
    }

    const client = getSupabaseBrowserClient();

    if (!client || !hasSupabaseConfig()) {
      return;
    }

    const channel = client
      .channel("entryflow-workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "organizations" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "sectors" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "resources" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "tables" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "timeline_events" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_layouts" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_layout_sectors" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_layout_resources" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_layouts" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_layout_sectors" }, () => void reloadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_layout_resources" }, () => void reloadWorkspace())
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [browserAuthReady, reloadWorkspace]);

  const currentOrganization = useMemo(
    () => getOrganizationSelection(organizations, currentOrganizationId),
    [currentOrganizationId, organizations],
  );
  const currentEvent = useMemo(
    () => getEventSelection(events, currentOrganization.id, currentEventId),
    [currentEventId, currentOrganization.id, events],
  );
  const accountSelection = useMemo(
    () =>
      getAccountSelection({
        users,
        profiles,
        roles,
        currentOrganizationId: currentOrganization.id,
        currentProfileId,
      }),
    [currentOrganization.id, currentProfileId, profiles, roles, users],
  );
  const currentAccount = accountSelection.account;
  const currentUser = accountSelection.user;
  const currentProfile = accountSelection.profile;
  const effectivePermissions = useMemo(() => getEffectivePermissions(currentAccount), [currentAccount]);
  const hasPermission = useCallback(
    (permission: AccountPermissionKey) => effectivePermissions.includes(permission),
    [effectivePermissions],
  );
  const can = hasPermission;
  const buildAccountFromEntities = useCallback(
    (user: AccountUser, membership: OrganizationMembership, role: AccountRolePreset): OrganizationAccount => {
      const permissions = normalizeAccountPermissions(membership.metadata?.permissions, role.permissions);

      return {
        id: membership.id,
        organizationId: membership.organizationId,
        userId: user.id,
        userEmail: user.email,
        userDisplayName: user.displayName,
        displayName: membership.displayName,
        roleId: role.id,
        roleSlug: role.slug,
        roleName: role.name,
        rolePermissions: role.permissions,
        permissions: permissions.length ? permissions : role.permissions,
        attributes: {
          ...membership.attributes,
          permissions: permissions.length ? permissions : role.permissions,
        },
        status: membership.deletedAt ? "inactive" : "active",
        isOwner: isOwnerAccount({ roleSlug: role.slug, metadata: membership.metadata, rolePermissions: role.permissions }),
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
        deletedAt: membership.deletedAt,
        metadata: membership.metadata,
      };
    },
    [],
  );
  const currentVenue = useMemo(
    () =>
      venues.find((venue) => venue.id === currentEvent.venueId && venue.status === "active") ??
      venues.find((venue) => venue.id === currentEvent.venueId) ??
      venues.find((venue) => venue.status === "active") ??
      venues[0] ??
      null,
    [currentEvent.venueId, venues],
  );
  const currentEventLayout = useMemo(
    () => resolveCurrentEventLayout({ currentEventId: currentEvent.id, currentVenueId: currentVenue?.id ?? currentEvent.venueId, eventLayouts }),
    [currentEvent.id, currentEvent.venueId, currentVenue?.id, eventLayouts],
  );
  const currentVenueLayout = useMemo(
    () => resolveCurrentVenueLayout({ currentVenueId: currentVenue?.id ?? currentEvent.venueId, currentEventLayout, venueLayouts }),
    [currentEvent.venueId, currentEventLayout, currentVenue?.id, venueLayouts],
  );
  const currentVenueSectors = useMemo(
    () =>
      resolveCurrentVenueSectors({
        currentVenueId: currentVenue?.id ?? currentEvent.venueId,
        currentEventLayout,
        venueLayout: currentVenueLayout,
        sectors,
        venueLayoutSectors,
        eventLayoutSectors,
      }),
    [currentEvent.venueId, currentEventLayout, currentVenue?.id, eventLayoutSectors, sectors, currentVenueLayout, venueLayoutSectors],
  );
  const currentVenueResources = useMemo(
    () =>
      resolveCurrentVenueResources({
        currentVenueId: currentVenue?.id ?? currentEvent.venueId,
        currentEventLayout,
        venueLayout: currentVenueLayout,
        resources,
        venueLayoutResources,
        eventLayoutResources,
      }),
    [currentEvent.venueId, currentEventLayout, currentVenue?.id, eventLayoutResources, currentVenueLayout, resources, venueLayoutResources],
  );
  const currentEventLayoutResourcesBySourceResourceId = useMemo(() => {
    const venueLayoutResourcesById = new Map(venueLayoutResources.map((layoutResource) => [layoutResource.id, layoutResource]));

    return new Map(
      eventLayoutResources
        .filter((layoutResource) => layoutResource.eventLayoutId === currentEventLayout?.id)
        .map((layoutResource) => {
          const sourceResourceId = layoutResource.sourceVenueLayoutResourceId
            ? venueLayoutResourcesById.get(layoutResource.sourceVenueLayoutResourceId)?.sourceResourceId
            : undefined;

          return sourceResourceId ? ([sourceResourceId, layoutResource.id] as const) : null;
        })
        .filter((entry): entry is readonly [string, string] => Boolean(entry)),
    );
  }, [currentEventLayout?.id, eventLayoutResources, venueLayoutResources]);

  const currentEventGuests = useMemo(() => getAttendeesForEvent(currentEvent.id, guests), [currentEvent.id, guests]);
  const currentEventReservations = useMemo(() => getReservationsForEvent(currentEvent.id, reservations), [currentEvent.id, reservations]);
  const currentEventTables = useMemo(
    () =>
      currentVenueResources.map<TableRecord>((resource, index) => {
        const eventLayoutResourceId = currentEventLayoutResourcesBySourceResourceId.get(resource.id);
        const reservationMatches = currentEventReservations.filter((reservation) => {
          if (eventLayoutResourceId && reservation.eventLayoutResourceId === eventLayoutResourceId) {
            return true;
          }

          return reservation.tableId === resource.id || reservation.resourceId === resource.id;
        });
        const guestMatches = currentEventGuests.filter((guest) =>
          reservationMatches.some((reservation) => reservation.id === guest.reservationId) || guest.tableId === resource.id,
        );

        return {
          id: resource.id,
          name: resource.name,
          capacity: resource.capacity,
          location: currentVenueSectors.find((sector) => sector.id === resource.sectorId)?.name ?? resource.sectorId ?? currentVenue?.name ?? resource.venueId,
          status: resource.status,
          venueId: resource.venueId,
          sectorId: resource.sectorId,
          eventLayoutId: eventLayoutResourceId ? currentEventLayout?.id : undefined,
          eventLayoutResourceId,
          type: resource.type,
          order: resource.order ?? index + 1,
          notes: resource.notes,
          metadata: resource.metadata,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          eventId: currentEvent.id,
          reservationIds: reservationMatches.map((reservation) => reservation.id),
          guestIds: guestMatches.map((guest) => guest.id),
          closed: resource.status === "Closed" || resource.status === "Blocked",
        };
      }),
    [currentEvent.id, currentEventGuests, currentEventLayout?.id, currentEventLayoutResourcesBySourceResourceId, currentEventReservations, currentVenue, currentVenueResources, currentVenueSectors],
  );
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
  const syntheticTimelineEvents = useMemo<TimelineEvent[]>(
    () => [
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
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const currentReservationIds = new Set(currentEventReservations.map((reservation) => reservation.id));
    const currentGuestIds = new Set(currentEventGuests.map((guest) => guest.id));
    const persistedScoped = persistedTimelineEvents.filter((entry) => {
      if (entry.eventId) {
        return entry.eventId === currentEvent.id;
      }

      if (entry.reservationId) {
        return currentReservationIds.has(entry.reservationId);
      }

      if (entry.guestId) {
        return currentGuestIds.has(entry.guestId);
      }

      return false;
    });
    const combined = [...persistedScoped, ...syntheticTimelineEvents];
    const deduped = new Map<string, TimelineEvent>();

    for (const entry of combined) {
      if (!deduped.has(entry.id)) {
        deduped.set(entry.id, entry);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }, [currentEvent.id, currentEventGuests, currentEventReservations, persistedTimelineEvents, syntheticTimelineEvents]);

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
      const nextEvent = organizationEvents.find((event) => event.status === "live") ?? organizationEvents[0];
      const organizationProfiles = profiles.filter((profile) => profile.organizationId === organizationId && !profile.deletedAt);
      const nextProfile =
        organizationProfiles.find((profile) => {
          const role = roles.find((item) => item.id === profile.roleId);
          return role?.slug === "owner" || Boolean(profile.metadata?.bootstrap || profile.metadata?.bootstrapOwner);
        })
        ?? organizationProfiles[0];

      setCurrentProfileIdState(nextProfile?.id ?? "");
      if (nextEvent) {
        setCurrentEventIdState(nextEvent.id);
      } else {
        setCurrentEventIdState("");
      }
    },
    [events, profiles, roles],
  );

  const setCurrentEventId = useCallback((eventId: string) => {
    setCurrentEventIdState(eventId);
  }, []);

  const setCurrentProfileId = useCallback(
    (profileId: string) => {
      setCurrentProfileIdState(profileId);
      const profile = profiles.find((item) => item.id === profileId && !item.deletedAt);
      if (profile) {
        setCurrentOrganizationId(profile.organizationId);
      }
    },
    [profiles, setCurrentOrganizationId],
  );

  const setActiveEventId = setCurrentEventId;

  const requirePermission = useCallback(
    (permission: AccountPermissionKey) => {
      if (!can(permission)) {
        throw new Error("No tienes permiso para realizar esta acción.");
      }
    },
    [can],
  );

  const createAccount = useCallback(
    async (params: {
      userId?: string;
      email: string;
      displayName: string;
      organizationId: string;
      roleSlug: string;
      area?: string;
      permissions?: AccountPermissionKey[];
    }) => {
      requirePermission("accounts.manage");
      const snapshot = captureSnapshot();
      try {
        const role = roles.find((item) => item.slug === params.roleSlug) ?? getRolePresetBySlug(params.roleSlug);
        const desiredPermissions = normalizeAccountPermissions(params.permissions, role.permissions);
        const existingUser = users.find((user) => user.email.toLowerCase() === params.email.trim().toLowerCase() && !user.deletedAt);
        const persistedUser = existingUser
          ? await repositories.users.update(existingUser.id, {
              ...existingUser,
              email: params.email.trim(),
              displayName: params.displayName.trim() || existingUser.displayName,
            })
          : await repositories.users.create({
              id: params.userId ?? createUuid(),
              email: params.email.trim(),
              displayName: params.displayName.trim(),
              avatarUrl: undefined,
              metadata: { source: "settings-account" },
              deletedAt: null,
            } as Partial<AccountUser>);

        if (!persistedUser) {
          throw new Error("No se pudo guardar el usuario.");
        }

        const existingMembership = profiles.find(
          (profile) => profile.organizationId === params.organizationId && profile.userId === persistedUser.id && !profile.deletedAt,
        );
        const membershipPayload: OrganizationMembership = {
          id: existingMembership?.id ?? createUuid(),
          organizationId: params.organizationId,
          userId: persistedUser.id,
          roleId: role.id,
          displayName: params.displayName.trim() || persistedUser.displayName,
          attributes: {
            area: params.area?.trim() || existingMembership?.attributes.area || "",
            status: "active" as const,
            permissions: desiredPermissions,
          },
          metadata: {
            ...(existingMembership?.metadata ?? {}),
            attributes: {
              ...(existingMembership?.attributes ?? {}),
              area: params.area?.trim() || existingMembership?.attributes.area || "",
              status: "active" as const,
            },
            permissions: desiredPermissions,
          },
          status: "active",
          createdAt: existingMembership?.createdAt ?? nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        const persistedMembership = existingMembership
          ? await repositories.profiles.update(existingMembership.id, membershipPayload)
          : await repositories.profiles.create(membershipPayload);

        if (!persistedMembership) {
          throw new Error("No se pudo guardar la membresía.");
        }

        const nextUsers = existingUser
          ? users.map((user) => (user.id === persistedUser.id ? persistedUser : user))
          : [persistedUser, ...users];
        const nextProfiles = existingMembership
          ? profiles.map((profile) => (profile.id === persistedMembership.id ? persistedMembership : profile))
          : [persistedMembership, ...profiles];

        setUsers(nextUsers);
        setProfiles(nextProfiles);
        if (!currentProfile || currentAccount.id === "bootstrap-account") {
          setCurrentProfileIdState(persistedMembership.id);
        }
        return buildAccountFromEntities(persistedUser, persistedMembership, role);
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [buildAccountFromEntities, captureSnapshot, currentAccount.id, currentProfile, profiles, repositories.profiles, repositories.users, requirePermission, restoreSnapshot, roles, users],
  );

  const updateAccount = useCallback(
    async (account: OrganizationAccount) => {
      requirePermission("accounts.manage");
      const snapshot = captureSnapshot();
      try {
        const existingMembership = profiles.find((profile) => profile.id === account.id);
        if (!existingMembership) {
          throw new Error("La cuenta no existe.");
        }

        const existingRole = roles.find((role) => role.id === existingMembership.roleId) ?? getRolePresetBySlug("administrator");
        const targetRole = roles.find((role) => role.id === account.roleId || role.slug === account.roleSlug) ?? getRolePresetBySlug(account.roleSlug);
        const ownerCount = profiles.filter((profile) => {
          const profileRole = roles.find((role) => role.id === profile.roleId);
          return profile.organizationId === existingMembership.organizationId && !profile.deletedAt && profileRole?.slug === "owner";
        }).length;

        if (existingRole.slug === "owner" && targetRole.slug !== "owner" && ownerCount <= 1) {
          throw new Error("No puedes retirar el único Owner activo de la organización.");
        }

        const existingUser = users.find((user) => user.id === existingMembership.userId);
        if (!existingUser) {
          throw new Error("El usuario de la cuenta no existe.");
        }

        const desiredPermissions = normalizeAccountPermissions(account.permissions, targetRole.permissions);
        const persistedUser = await repositories.users.update(existingUser.id, {
          ...existingUser,
          email: account.userEmail.trim() || existingUser.email,
          displayName: account.userDisplayName.trim() || existingUser.displayName,
        });
        if (!persistedUser) {
          throw new Error("No se pudo actualizar el usuario.");
        }

        const persistedMembership = await repositories.profiles.update(existingMembership.id, {
          ...existingMembership,
          roleId: targetRole.id,
          displayName: account.displayName.trim() || existingMembership.displayName,
          attributes: {
            ...existingMembership.attributes,
            area: account.attributes.area?.trim() || "",
            status: account.status,
            permissions: desiredPermissions,
          },
          metadata: {
            ...(existingMembership.metadata ?? {}),
            attributes: {
              ...(existingMembership.attributes ?? {}),
              area: account.attributes.area?.trim() || "",
              status: account.status,
            },
            permissions: desiredPermissions,
          },
          deletedAt: account.status === "inactive" ? nowIso() : null,
        });

        if (!persistedMembership) {
          throw new Error("No se pudo actualizar la membresía.");
        }

        setUsers((current) => current.map((user) => (user.id === persistedUser.id ? persistedUser : user)));
        setProfiles((current) => current.map((profile) => (profile.id === persistedMembership.id ? persistedMembership : profile)));
        if (currentProfile?.id === persistedMembership.id && account.status === "inactive") {
          const fallbackProfile = profiles.find((profile) => profile.organizationId === persistedMembership.organizationId && profile.id !== persistedMembership.id && !profile.deletedAt);
          setCurrentProfileIdState(fallbackProfile?.id ?? "");
        }
        return buildAccountFromEntities(persistedUser, persistedMembership, targetRole);
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [buildAccountFromEntities, captureSnapshot, currentProfile, profiles, repositories.profiles, repositories.users, requirePermission, restoreSnapshot, roles, users],
  );

  const setAccountStatus = useCallback(
    async (profileId: string, status: "active" | "inactive") => {
      requirePermission("accounts.manage");
      const snapshot = captureSnapshot();
      try {
        const membership = profiles.find((profile) => profile.id === profileId);
        if (!membership) {
          return;
        }

        const role = roles.find((item) => item.id === membership.roleId) ?? getRolePresetBySlug("administrator");
        const ownerCount = profiles.filter((profile) => {
          const profileRole = roles.find((item) => item.id === profile.roleId);
          return profile.organizationId === membership.organizationId && !profile.deletedAt && profileRole?.slug === "owner";
        }).length;

        if (role.slug === "owner" && status === "inactive" && ownerCount <= 1) {
          throw new Error("No puedes desactivar el único Owner activo.");
        }

        const persistedMembership = await repositories.profiles.update(profileId, {
          ...membership,
          deletedAt: status === "inactive" ? nowIso() : null,
          attributes: {
            ...membership.attributes,
            status,
          },
          metadata: {
            ...(membership.metadata ?? {}),
            attributes: {
              ...(membership.attributes ?? {}),
              status,
            },
          },
        });
        if (!persistedMembership) {
          throw new Error("No se pudo actualizar la membresía.");
        }
        setProfiles((current) => current.map((profile) => (profile.id === persistedMembership.id ? persistedMembership : profile)));
        if (currentProfile?.id === profileId && status === "inactive") {
          const fallbackProfile = profiles.find((profile) => profile.organizationId === membership.organizationId && profile.id !== profileId && !profile.deletedAt);
          setCurrentProfileIdState(fallbackProfile?.id ?? "");
        }
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [captureSnapshot, currentProfile, profiles, repositories.profiles, requirePermission, restoreSnapshot, roles],
  );

  const persist = useCallback(
    async (
      kind: "organization" | "venue" | "sector" | "resource" | "event" | "guest" | "reservation" | "table" | "checkin" | "attempt",
      value: unknown,
    ) => {
      try {
        if (kind === "organization") {
          await repositories.organizations.upsert(value as Organization);
        } else if (kind === "venue") {
          await repositories.venues.upsert(value as Venue);
        } else if (kind === "sector") {
          await repositories.sectors.upsert(value as Sector);
        } else if (kind === "resource") {
          await repositories.resources.upsert(value as Resource);
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
        throw exception;
      }
    },
    [repositories],
  );

  const createEvent = useCallback(
    async (event: PlatformEvent) => {
      requirePermission(events.some((item) => item.id === event.id) ? "event.edit" : "event.create");
      const snapshot = captureSnapshot();
      try {
        setEvents((current) => (current.some((item) => item.id === event.id) ? current.map((item) => (item.id === event.id ? event : item)) : [event, ...current]));
        await persist("event", event);
        setCurrentOrganizationIdState(event.organizationId);
        setCurrentEventIdState(event.id);
        return event;
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [captureSnapshot, events, persist, requirePermission, restoreSnapshot],
  );

  const createOrganization = useCallback(
    async (organization: Organization) => {
      requirePermission("organization.manage");
      const snapshot = captureSnapshot();
      try {
        setOrganizations((current) => (current.some((item) => item.id === organization.id) ? current.map((item) => (item.id === organization.id ? organization : item)) : [organization, ...current]));
        await persist("organization", organization);
        setCurrentOrganizationIdState(organization.id);
        setCurrentEventIdState("");
        return organization;
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [captureSnapshot, persist, requirePermission, restoreSnapshot],
  );

  const createVenue = useCallback(
    async (venue: Venue) => {
      requirePermission("venue.manage");
      const snapshot = captureSnapshot();
      setVenues((current) => (current.some((item) => item.id === venue.id) ? current.map((item) => (item.id === venue.id ? venue : item)) : [venue, ...current]));
      await persist("venue", venue).catch(() => restoreSnapshot(snapshot));
      return venue;
    },
    [captureSnapshot, persist, requirePermission, restoreSnapshot],
  );

  const updateVenue = useCallback(
    async (venue: Venue) => {
      requirePermission("venue.manage");
      const snapshot = captureSnapshot();
      setVenues((current) => current.map((item) => (item.id === venue.id ? venue : item)));
      await persist("venue", venue).catch(() => restoreSnapshot(snapshot));
      return venue;
    },
    [captureSnapshot, persist, requirePermission, restoreSnapshot],
  );

  const setVenueStatus = useCallback(
    async (venueId: string, status: Venue["status"]) => {
      requirePermission("venue.manage");
      const snapshot = captureSnapshot();
      setVenues((current) => current.map((venue) => (venue.id === venueId ? { ...venue, status, updatedAt: nowIso() } : venue)));
      await repositories.venues.setStatus(venueId, status).catch(() => restoreSnapshot(snapshot));
    },
    [captureSnapshot, repositories.venues, requirePermission, restoreSnapshot],
  );

  const createSector = useCallback(
    async (sector: Sector) => {
      requirePermission("venue.manage");
      const snapshot = captureSnapshot();
      setSectors((current) => (current.some((item) => item.id === sector.id) ? current.map((item) => (item.id === sector.id ? sector : item)) : [sector, ...current]));
      await persist("sector", sector).catch(() => restoreSnapshot(snapshot));
      return sector;
    },
    [captureSnapshot, persist, requirePermission, restoreSnapshot],
  );

  const updateSector = useCallback(
    async (sector: Sector) => {
      requirePermission("venue.manage");
      const snapshot = captureSnapshot();
      setSectors((current) => current.map((item) => (item.id === sector.id ? sector : item)));
      await persist("sector", sector).catch(() => restoreSnapshot(snapshot));
      return sector;
    },
    [captureSnapshot, persist, requirePermission, restoreSnapshot],
  );

  const setSectorStatus = useCallback(
    async (sectorId: string, status: Sector["status"]) => {
      requirePermission("venue.manage");
      const snapshot = captureSnapshot();
      setSectors((current) => current.map((sector) => (sector.id === sectorId ? { ...sector, status, updatedAt: nowIso() } : sector)));
      await repositories.sectors.setStatus(sectorId, status).catch(() => restoreSnapshot(snapshot));
    },
    [captureSnapshot, repositories.sectors, requirePermission, restoreSnapshot],
  );

  const createResource = useCallback(
    async (resource: Resource) => {
      requirePermission("resource.manage");
      const snapshot = captureSnapshot();
      setResources((current) => (current.some((item) => item.id === resource.id) ? current.map((item) => (item.id === resource.id ? resource : item)) : [resource, ...current]));
      await persist("resource", resource).catch(() => restoreSnapshot(snapshot));
      return resource;
    },
    [captureSnapshot, persist, requirePermission, restoreSnapshot],
  );

  const updateResource = useCallback(
    async (resource: Resource) => {
      requirePermission("resource.manage");
      const snapshot = captureSnapshot();
      setResources((current) => current.map((item) => (item.id === resource.id ? resource : item)));
      await persist("resource", resource).catch(() => restoreSnapshot(snapshot));
      return resource;
    },
    [captureSnapshot, persist, requirePermission, restoreSnapshot],
  );

  const setResourceStatus = useCallback(
    async (resourceId: string, status: Resource["status"]) => {
      requirePermission("resource.manage");
      const snapshot = captureSnapshot();
      setResources((current) => current.map((resource) => (resource.id === resourceId ? { ...resource, status, updatedAt: nowIso() } : resource)));
      await repositories.resources.setStatus(resourceId, status).catch(() => restoreSnapshot(snapshot));
    },
    [captureSnapshot, repositories.resources, requirePermission, restoreSnapshot],
  );

  const moveResourceToSector = useCallback(
    async (resourceId: string, sectorId: string) => {
      requirePermission("resource.manage");
      const snapshot = captureSnapshot();
      setResources((current) => current.map((resource) => (resource.id === resourceId ? { ...resource, sectorId, updatedAt: nowIso() } : resource)));
      await repositories.resources.moveToSector(resourceId, sectorId).catch(() => restoreSnapshot(snapshot));
    },
    [captureSnapshot, repositories.resources, requirePermission, restoreSnapshot],
  );

  const setEventStatus = useCallback(
    (eventId: string, status: PlatformEvent["status"]) => {
      requirePermission("event.edit");
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
    [captureSnapshot, events, notify, repositories.events, requirePermission, restoreSnapshot],
  );

  const createReservation = useCallback(
    async (input: ReservationCreationInput) => {
      requirePermission("reservation.create");
      const snapshot = captureSnapshot();
      try {
        const bundle = createReservationBundle(input);
        const event = currentEvent;
        const selectedResource = input.selectedResource ?? input.selectedTable;

        if (!selectedResource) {
          throw new Error("A resource is required to create a reservation.");
        }

        const selectedEventLayoutResource = resolveCurrentEventLayoutResource({
          currentEventLayout,
          resourceId: selectedResource.id,
          venueLayoutResources,
          eventLayoutResources,
        });
        const tableId = bundle.reservation.tableId ?? selectedResource.id;
        const tableName = bundle.reservation.tableName ?? selectedResource.name;
        const reservation: ReservationRecord = {
          ...bundle.reservation,
          eventId: event.id,
          eventName: event.name,
          eventLayoutId: selectedEventLayoutResource?.eventLayoutId ?? currentEventLayout?.id ?? undefined,
          eventLayoutResourceId: selectedEventLayoutResource?.id ?? undefined,
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
        const reservationGuestsWithAccess = reservationGuests.map(hydrateGuestAccessGrant);
        const grantTimestamp = nowIso();

        await repositories.reservations.upsert(reservation);
        for (const guest of reservationGuestsWithAccess) {
          await repositories.guests.upsert(guest);
          const timelineEntry = buildAccessGrantTimelineEvent(guest, reservation, grantTimestamp);
          upsertPersistedTimelineEvent(timelineEntry);
          await repositories.timeline.upsert(timelineEntry);
        }

        setReservations((current) => [reservation, ...current]);
        setGuests((current) => [...reservationGuestsWithAccess, ...current]);

        notify({
          title: "Reserva creada",
          description: `${reservation.name} quedó registrada en Supabase.`,
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
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [captureSnapshot, currentEvent, currentEventLayout, eventLayoutResources, notify, repositories.guests, repositories.reservations, repositories.timeline, requirePermission, restoreSnapshot, upsertPersistedTimelineEvent, venueLayoutResources],
  );

  const updateReservation = useCallback(
    async (input: ReservationUpdateInput) => {
      requirePermission("reservation.edit");
      const snapshot = captureSnapshot();
      const reservation = reservations.find((item) => item.id === input.reservationId);

      if (!reservation) {
        throw new Error("Reservation not found.");
      }

      const selectedResource = input.selectedResource ?? input.selectedTable;

      if (!selectedResource) {
        throw new Error("A resource is required to update a reservation.");
      }

      try {
        const selectedEventLayoutResource = resolveCurrentEventLayoutResource({
          currentEventLayout,
          resourceId: selectedResource.id,
          venueLayoutResources,
          eventLayoutResources,
        });
        const timestamp = nowIso();
        const currentStatus = normalizeReservationStatus(reservation.status);
        const nextStatus: ReservationStatus =
          currentStatus === "Cancelled" || currentStatus === "No Show" || currentStatus === "Completed" || currentStatus === "Checked In"
            ? currentStatus
            : input.paymentStatus === "Pagado"
              ? "Confirmed"
              : "Pending";
        const nextName = `${selectedResource.name} · ${input.holderName} ${input.holderLastName}`.trim();
        const existingGuests = guests
          .filter((guest) => guest.reservationId === reservation.id)
          .sort((a, b) => a.id.localeCompare(b.id));
        const nextGuestCount = input.guests.length;

        const nextGuests: Guest[] = input.guests.map((guestDraft, index) => {
          const currentGuest = existingGuests[index];
          const invitationSequence = `${index + 1} de ${nextGuestCount}`;
          const invitationCode = currentGuest?.invitationCode ?? `${reservation.code}-${String(index + 1).padStart(2, "0")}`;

          if (currentGuest) {
            return {
              ...currentGuest,
              guestName: guestDraft.name.trim() || currentGuest.guestName || `Invitado ${index + 1}`,
              reservationName: nextName,
              reservationCode: reservation.code,
              reservationId: reservation.id,
              eventId: input.eventId,
              eventName: input.eventName,
              tableId: selectedResource.id,
              tableName: selectedResource.name,
              eventStatus: currentEvent.status === "live" ? "En curso" : "Próximo",
              invitationSequence,
              invitationCode,
              carnet: guestDraft.document || currentGuest.carnet,
              whatsapp: guestDraft.whatsapp || currentGuest.whatsapp || input.whatsapp,
              reservationStatus: nextStatus,
              attention: guestDraft.vip ? currentGuest.attention ?? "Invitado VIP" : currentGuest.attention,
              recentChange: true,
            };
          }

          const createdAt = timestamp;

          return {
            id: createUuid(),
            guestName: guestDraft.name.trim() || `Invitado ${index + 1}`,
            reservationName: nextName,
            reservationCode: reservation.code,
            reservationId: reservation.id,
            eventId: input.eventId,
            eventName: input.eventName,
            tableId: selectedResource.id,
            tableName: selectedResource.name,
            eventStatus: currentEvent.status === "live" ? "En curso" : "Próximo",
            invitationSequence,
            invitationCode,
            carnet: guestDraft.document || `Pendiente ${index + 1}`,
            whatsapp: guestDraft.whatsapp || input.whatsapp,
            deliveryStatus: "Enviada",
            admissionStatus: "Pendiente",
            reservationStatus: nextStatus,
            deliveryHistory: [{ time: createdAt, title: "Enviada", detail: "Invitación generada desde el editor" }],
            operatorActivity: [{ time: createdAt, action: "Invitado agregado", operator: "Recepción", reason: "Edición de reserva" }],
            qrStatus: "Válido",
            manualAdmission: false,
            attention: guestDraft.vip ? "Invitado VIP" : undefined,
            recentChange: true,
          } as Guest;
        });
        const nextGuestsWithAccess = nextGuests.map(hydrateGuestAccessGrant);

        const nextGuestIds = nextGuestsWithAccess.map((guest) => guest.id);
        const removedGuests = existingGuests.slice(nextGuestCount);
        const nextReservation: ReservationRecord = {
          ...reservation,
          eventId: input.eventId,
          eventName: input.eventName,
          date: input.date,
          time: input.time,
          eventLayoutId: selectedEventLayoutResource?.eventLayoutId ?? currentEventLayout?.id ?? reservation.eventLayoutId,
          eventLayoutResourceId: selectedEventLayoutResource?.id ?? reservation.eventLayoutResourceId,
          resourceId: selectedResource.id,
          resourceName: selectedResource.name,
          sectorId: selectedResource.sectorId,
          sectorName: selectedResource.location,
          venueId: selectedResource.venueId,
          tableName: selectedResource.name,
          tableId: selectedResource.id,
          tableCapacity: selectedResource.capacity,
          holderName: `${input.holderName} ${input.holderLastName}`.trim(),
          holderDocument: input.documentValue,
          holderWhatsapp: input.whatsapp,
          holderEmail: input.email,
          reservationType: input.reservationType,
          paymentStatus: input.paymentStatus,
          amount: input.amount,
          advance: input.advance,
          notes: [input.observations, input.preferences, input.notes].filter(Boolean).join(" · "),
          guestIds: nextGuestIds,
          status: nextStatus,
          timeline: [
            ...reservation.timeline,
            {
              id: `reservation-${reservation.id}-${createUuid()}`,
              time: timestamp.slice(11, 16),
              title: "Reserva actualizada",
              detail: `${nextGuestCount} invitados quedan vinculados a ${selectedResource.name}.`,
              tone: "info",
            },
          ],
          updatedAt: timestamp,
        };

        setReservations((current) => current.map((item) => (item.id === reservation.id ? nextReservation : item)));
        setGuests((current) => [
          ...current.filter((guest) => guest.reservationId !== reservation.id),
          ...nextGuestsWithAccess,
        ]);

        await repositories.reservations.upsert(nextReservation);
        for (const guest of nextGuestsWithAccess) {
          await repositories.guests.upsert(guest);
          const timelineEntry = buildAccessGrantTimelineEvent(guest, nextReservation, timestamp);
          upsertPersistedTimelineEvent(timelineEntry);
          await repositories.timeline.upsert(timelineEntry);
        }
        for (const guest of removedGuests) {
          await repositories.guests.delete(guest.id);
        }

        notify({
          title: "Reserva actualizada",
          description: `${nextReservation.name} quedó sincronizada en Supabase.`,
          tone: "success",
          icon: "reservation",
          href: "/reservations",
          undo: {
            label: "Deshacer",
            timeoutMs: 6000,
            onUndo: () => restoreSnapshot(snapshot),
          },
        });

        return nextReservation;
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [captureSnapshot, currentEvent.status, currentEventLayout, eventLayoutResources, guests, notify, repositories.guests, repositories.reservations, repositories.timeline, requirePermission, reservations, restoreSnapshot, upsertPersistedTimelineEvent, venueLayoutResources],
  );

  const appendReservationGuests = useCallback(
    async (reservationId: string, guestInputs: ReservationGuestInput[]) => {
      requirePermission("reservation.edit");
      const snapshot = captureSnapshot();
        const reservation = reservations.find((item) => item.id === reservationId);

      if (!reservation) {
        return undefined;
      }

        try {
          const reservationGuests = guests.filter((guest) => guest.reservationId === reservationId);
          const nextGuests: Guest[] = [];
          let nextGuestIds = [...reservation.guestIds];
          let nextReservation = { ...reservation };
          const totalGuestCount = reservationGuests.length + guestInputs.length;

          for (const [index, guestInput] of guestInputs.entries()) {
            const guestIndex = reservationGuests.length + index + 1;
            const guestId = createUuid();
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
            invitationSequence: `${guestIndex} de ${totalGuestCount}`,
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

          const nextGuestWithAccess = hydrateGuestAccessGrant(nextGuest);
          nextGuests.push(nextGuestWithAccess);
          nextGuestIds = [...nextGuestIds, guestId];
          nextReservation = {
            ...nextReservation,
            guestIds: nextGuestIds,
            timeline: [
              ...nextReservation.timeline,
              {
                id: `reservation-${nextReservation.id}-${createUuid()}`,
                time: nowIso().slice(11, 16),
                title: "Manillas agregadas",
                detail: `${guestInput.guestName} se sumó a la reserva existente.`,
                tone: "info",
              },
            ],
            updatedAt: nowIso(),
          };
        }

        setGuests((current) => [...nextGuests, ...current]);
        setReservations((current) => current.map((item) => (item.id === reservationId ? nextReservation : item)));

        await repositories.reservations.upsert(nextReservation);
        for (const guest of nextGuests) {
          await repositories.guests.upsert(guest);
          const timelineEntry = buildAccessGrantTimelineEvent(guest, reservation, nowIso());
          upsertPersistedTimelineEvent(timelineEntry);
          await repositories.timeline.upsert(timelineEntry);
        }

        notify({
          title: "Manillas agregadas",
          description: `${guestInputs.length} invitados se sumaron a ${reservation.name}.`,
          tone: "info",
          icon: "guest",
          href: "/reservations",
          undo: {
            label: "Deshacer",
            timeoutMs: 6000,
            onUndo: () => restoreSnapshot(snapshot),
          },
        });

        return nextReservation;
      } catch (exception) {
        restoreSnapshot(snapshot);
        throw exception;
      }
    },
    [captureSnapshot, currentEvent.status, guests, notify, repositories.guests, repositories.reservations, repositories.timeline, requirePermission, reservations, restoreSnapshot, upsertPersistedTimelineEvent],
  );

  const addReservationGuest = useCallback(
    (reservationId: string, guestInput: ReservationGuestInput) => {
      requirePermission("reservation.edit");
      const snapshot = captureSnapshot();
      const reservation = reservations.find((item) => item.id === reservationId);
      if (!reservation) return;
      const reservationGuests = guests.filter((guest) => guest.reservationId === reservationId);
      const guestIndex = reservationGuests.length + 1;
      const guestId = createUuid();
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
      const nextGuestWithAccess = hydrateGuestAccessGrant(nextGuest);

      setGuests((current) => [nextGuestWithAccess, ...current]);
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

      void repositories.guests.upsert(nextGuestWithAccess).catch(() => restoreSnapshot(snapshot));
      const timelineEntry = buildAccessGrantTimelineEvent(nextGuestWithAccess, reservation, nowIso());
      upsertPersistedTimelineEvent(timelineEntry);
      void repositories.timeline.upsert(timelineEntry).catch(() => restoreSnapshot(snapshot));
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
    [captureSnapshot, currentEvent.status, guests, notify, repositories.guests, repositories.reservations, repositories.timeline, requirePermission, reservations, restoreSnapshot, upsertPersistedTimelineEvent],
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
      requirePermission("reservation.edit");
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
    [captureSnapshot, guests, notify, repositories.guests, repositories.reservations, requirePermission, reservations, restoreSnapshot],
  );

  const setReservationStatus = useCallback(
    (reservationId: string, status: ReservationStatus) => {
      requirePermission("reservation.edit");
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
    [captureSnapshot, guests, notify, repositories.guests, repositories.reservations, requirePermission, reservations, restoreSnapshot],
  );

  const assignReservationToTable = useCallback(
    (reservationId: string, tableId: string) => {
      requirePermission("resource.assign");
      const snapshot = captureSnapshot();
      const reservation = reservations.find((item) => item.id === reservationId);
      const table = tables.find((item) => item.id === tableId);
      if (!reservation || !table) return;
      const selectedEventLayoutResource = resolveCurrentEventLayoutResource({
        currentEventLayout,
        resourceId: table.id,
        venueLayoutResources,
        eventLayoutResources,
      });
      const nextReservation: ReservationRecord = {
        ...reservation,
        resourceId: table.id,
        resourceName: table.name,
        sectorId: table.sectorId,
        sectorName: table.location,
        venueId: table.venueId,
        tableId: table.id,
        tableName: table.name,
        tableCapacity: table.capacity,
        eventLayoutId: selectedEventLayoutResource?.eventLayoutId ?? currentEventLayout?.id ?? reservation.eventLayoutId,
        eventLayoutResourceId: selectedEventLayoutResource?.id ?? reservation.eventLayoutResourceId,
        timeline: [
          ...reservation.timeline,
          { id: `reservation-${reservation.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Mesa asignada", detail: `${table.name} quedó vinculada a la reserva.`, tone: "info" },
        ],
      };
      setReservations((current) =>
        current.map((item) => (item.id === reservationId ? nextReservation : item)),
      );
      setGuests((current) => current.map((guest) => (guest.reservationId === reservationId ? { ...guest, tableId: table.id, tableName: table.name } : guest)));
      setTables((current) => current.map((item) => (item.id === table.id ? { ...item, status: "Reserved", closed: false } : item)));
      void repositories.reservations.upsert(nextReservation).catch(() => restoreSnapshot(snapshot));
      void repositories.tables.update(tableId, { status: "Reserved", closed: false } as never).catch(() => restoreSnapshot(snapshot));
      notify({ title: "Mesa asignada", description: `${table.name} quedó vinculada a la reserva.`, tone: "info", icon: "table", href: "/tables", undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } });
    },
    [captureSnapshot, currentEventLayout, eventLayoutResources, notify, repositories.reservations, repositories.tables, requirePermission, reservations, restoreSnapshot, tables, venueLayoutResources],
  );

  const moveGuestToTable = useCallback(
    (guestId: string, tableId: string) => {
      requirePermission("resource.assign");
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
    [captureSnapshot, guests, notify, repositories.guests, requirePermission, restoreSnapshot, tables],
  );

  const releaseTable = useCallback(
    (tableId: string) => {
      requirePermission("resource.manage");
      const snapshot = captureSnapshot();
      const table = tables.find((item) => item.id === tableId);
      if (!table) return;
      setTables((current) => current.map((item) => (item.id === tableId ? { ...item, status: "Available", closed: false } : item)));
      setReservations((current) =>
        current.map((reservation) =>
          reservation.tableId === tableId || reservation.resourceId === tableId
            ? { ...reservation, tableId: undefined, tableName: "Sin mesa", timeline: [...reservation.timeline, { id: `reservation-${reservation.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Mesa liberada", detail: `${table.name} quedó disponible nuevamente.`, tone: "warning" }] }
            : reservation,
        ),
      );
      setGuests((current) => current.map((guest) => (guest.tableId === tableId ? { ...guest, tableId: undefined, tableName: undefined } : guest)));
      void repositories.tables.release(tableId).catch(() => restoreSnapshot(snapshot));
      notify({ title: "Mesa liberada", description: `${table.name} quedó disponible nuevamente.`, tone: "warning", icon: "table", href: "/tables", undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } });
    },
    [captureSnapshot, notify, repositories.tables, requirePermission, restoreSnapshot, tables],
  );

  const closeTable = useCallback(
    (tableId: string) => {
      requirePermission("resource.manage");
      const snapshot = captureSnapshot();
      const table = tables.find((item) => item.id === tableId);
      if (!table) return;
      setTables((current) => current.map((item) => (item.id === tableId ? { ...item, status: "Closed", closed: true } : item)));
      setReservations((current) =>
        current.map((reservation) =>
          reservation.tableId === tableId || reservation.resourceId === tableId
            ? { ...reservation, timeline: [...reservation.timeline, { id: `reservation-${reservation.id}-${createUuid()}`, time: nowIso().slice(11, 16), title: "Mesa cerrada", detail: `${table.name} quedó fuera de servicio temporalmente.`, tone: "danger" }] }
            : reservation,
        ),
      );
      void repositories.tables.close(tableId).catch(() => restoreSnapshot(snapshot));
      notify({ title: "Mesa cerrada", description: `${table.name} quedó fuera de servicio temporalmente.`, tone: "danger", icon: "table", href: "/tables", undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) } });
    },
    [captureSnapshot, notify, repositories.tables, requirePermission, restoreSnapshot, tables],
  );

  const registerCheckIn = useCallback(
    async ({ query, method, operator = method === "Manual" ? "Recepción" : "Escáner" }: { query: string; method: CheckInMethod; operator?: string; manual?: boolean }) => {
      requirePermission("checkin.perform");
      if (checkInSubmissionInFlightRef.current) {
        return {
          result: "Bloqueado" as const,
          note: "Hay un ingreso en curso. Esperá a que termine para volver a intentarlo.",
        };
      }

      const snapshot = captureSnapshot();
      checkInSubmissionInFlightRef.current = true;

      try {
        const timestampIso = nowIso();
        const timestamp = timestampIso.slice(11, 16);
        const admissionMethod = method === "Manual" ? "manual" : "qr";
        const resolution = resolveAccessGrantByQuery({
          query,
          guests: currentEventGuests,
          reservations: currentEventReservations,
          event: currentEvent,
        });
        const guest = resolution.status === "found" ? resolution.guest : resolution.status === "ambiguous" ? null : findGuestByQuery(query);
        const accessGrantKey = guest?.accessGrantId ?? guest?.id;

        if (isAccessGrantAlreadyConsumed(accessGrantKey, consumedAccessGrantIdsRef.current)) {
          const duplicateTicket = guest ? buildAccessTicketFromGuest({ ...guest, admissionStatus: "Ingresó", checkInTime: guest.checkInTime ?? timestampIso }, timestampIso) : null;
          const duplicateResult = evaluateAdmission({
            ticket: duplicateTicket,
            query,
            method: admissionMethod,
            operator,
            gate: method === "Manual" ? "Recepción" : guest?.gate ?? "Principal",
            timestamp: timestampIso,
          });

          const duplicateAttempt: CheckInAttempt = {
            id: createUuid(),
            eventId: currentEvent.id,
            query,
            method,
            timestamp,
            result: mapAdmissionResultToAttemptResult(duplicateResult.result),
            guestId: guest?.id,
            guestName: guest?.guestName,
            note: duplicateResult.note,
          };

          setAttempts((current) => [duplicateAttempt, ...current].slice(0, 12));
          const duplicateTimelineEntry: TimelineEvent = buildRejectedCheckInTimelineEntry({
            guest,
            result: duplicateResult,
            ticket: duplicateTicket,
          });
          upsertPersistedTimelineEvent(duplicateTimelineEntry);
          await repositories.timeline.upsert(duplicateTimelineEntry).catch(() => restoreSnapshot(snapshot));
          notify({
            title: duplicateResult.title,
            description: duplicateResult.note,
            tone: duplicateResult.tone,
            icon: "alert",
            href: "/check-in",
          });
          return { result: duplicateAttempt.result, guest: guest ?? undefined, note: duplicateAttempt.note };
        }

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

        if (!guest) {
          setAttempts((current) => [attempt, ...current].slice(0, 12));
          const nextTimelineEntry: TimelineEvent = { ...createAdmissionTimelineEntry(result, ticket), eventId: currentEvent.id } as TimelineEvent;
          upsertPersistedTimelineEvent(nextTimelineEntry);
          await repositories.timeline.upsert(nextTimelineEntry).catch(() => restoreSnapshot(snapshot));
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
          setAttempts((current) => [attempt, ...current].slice(0, 12));
          const nextTimelineEntry: TimelineEvent = { ...createAdmissionTimelineEntry(result, ticket), eventId: currentEvent.id } as TimelineEvent;
          upsertPersistedTimelineEvent(nextTimelineEntry);
          await repositories.timeline.upsert(nextTimelineEntry).catch(() => restoreSnapshot(snapshot));
          notify({
            title: result.title,
            description: result.note,
            tone: result.tone,
            icon: result.tone === "success" ? "checkin" : "alert",
            href: "/check-in",
          });
          return { result: attempt.result, guest, note: attempt.note };
        }

        const bundle = buildCompletedCheckInBundle({
          guest,
          result,
          ticket,
          method,
          operator,
          timestampIso,
        });

        try {
          await persistCompletedCheckInBundle({
            repositories: {
              checkIns: repositories.checkIns,
              guests: repositories.guests,
              timeline: repositories.timeline,
            },
            originalGuest: guest,
            bundle,
          });
        } catch (exception) {
          restoreSnapshot(snapshot);
          notify({
            title: "No se pudo registrar el ingreso",
            description: exception instanceof Error ? exception.message : "Supabase rechazó la persistencia del check-in.",
            tone: "danger",
            icon: "alert",
            href: "/check-in",
          });
          return {
            result: "Bloqueado" as const,
            guest,
            note: exception instanceof Error ? exception.message : "Supabase rechazó la persistencia del check-in.",
          };
        }

        setAttempts((current) => [attempt, ...current].slice(0, 12));
        setGuests((current) => current.map((item) => (item.id === guest.id ? bundle.nextGuest : item)));
        setCheckIns((current) => [bundle.checkIn, ...current].slice(0, 12));
        if (accessGrantKey) {
          consumedAccessGrantIdsRef.current.add(accessGrantKey);
        }
        upsertPersistedTimelineEvent(bundle.timelineEntry);
        notify({
          title: result.title,
          description: result.note,
          tone: result.tone,
          icon: "checkin",
          href: "/check-in",
          undo: { label: "Deshacer", timeoutMs: 6000, onUndo: () => restoreSnapshot(snapshot) },
        });
        return { result: attempt.result, guest: bundle.nextGuest, note: attempt.note };
      } finally {
        checkInSubmissionInFlightRef.current = false;
      }
    },
    [captureSnapshot, currentEvent, currentEventGuests, currentEventReservations, findGuestByQuery, notify, repositories.checkIns, repositories.guests, repositories.timeline, requirePermission, restoreSnapshot, upsertPersistedTimelineEvent],
  );

  const value = useMemo<WorkspaceServiceValue>(
    () => ({
      users,
      profiles,
      roles,
      accounts: profiles.map((profile) => {
        const user = users.find((item) => item.id === profile.userId);
        const role = roles.find((item) => item.id === profile.roleId) ?? getRolePresetBySlug("administrator");

        if (!user) {
          return buildAccountFromEntities(
            {
              id: profile.userId,
              email: "",
              displayName: profile.displayName,
              createdAt: profile.createdAt,
              updatedAt: profile.updatedAt,
              deletedAt: profile.deletedAt,
            },
            profile,
            role,
          );
        }

        return buildAccountFromEntities(user, profile, role);
      }),
      currentUser,
      currentProfile,
      currentAccount,
      effectivePermissions,
      hasPermission,
      can,
      organizations,
      venues,
      sectors,
      resources,
      venueLayouts,
      venueLayoutSectors,
      venueLayoutResources,
      eventLayouts,
      eventLayoutSectors,
      eventLayoutResources,
      currentVenue,
      currentVenueSectors,
      currentVenueResources,
      currentOrganizationId,
      currentOrganization,
      events,
      currentEventId,
      currentEvent,
      currentProfileId,
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
      setCurrentProfileId,
      createAccount,
      updateAccount,
      setAccountStatus,
      createVenue,
      updateVenue,
      setVenueStatus,
      createSector,
      updateSector,
      setSectorStatus,
      createResource,
      updateResource,
      setResourceStatus,
      moveResourceToSector,
      setReservationStatus,
      findGuestByQuery,
      searchGuests: searchGuestList,
      registerCheckIn,
      createReservation,
      updateReservation,
      createOrganization,
      appendReservationGuests,
      addReservationGuest,
      updateReservationGuest,
      assignReservationToTable,
      moveGuestToTable,
      releaseTable,
      closeTable,
      createEvent,
      setEventStatus,
      setOrganizationsState: setOrganizations,
      setVenuesState: setVenues,
      setSectorsState: setSectors,
      setResourcesState: setResources,
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
      can,
      appendReservationGuests,
      addReservationGuest,
      activeEvent,
      assignReservationToTable,
      buildAccountFromEntities,
      attempts,
      checkIns,
      closeTable,
      currentAccount,
      createEvent,
      createOrganization,
      createAccount,
      createReservation,
      updateReservation,
      currentEvent,
      currentEventId,
      currentProfile,
      currentProfileId,
      currentOrganization,
      currentOrganizationId,
      currentUser,
      venues,
      venueLayouts,
      venueLayoutSectors,
      venueLayoutResources,
      eventLayouts,
      eventLayoutSectors,
      eventLayoutResources,
      currentVenue,
      currentVenueResources,
      currentVenueSectors,
      customers,
      dashboard,
      error,
      events,
      effectivePermissions,
      findGuestByQuery,
      guests,
      hasPermission,
      moveGuestToTable,
      organizations,
      profiles,
      registerCheckIn,
      releaseTable,
      reloadWorkspace,
      resources,
      roles,
      sectors,
      setVenues,
      setSectors,
      setResources,
      setSectorStatus,
      setVenueStatus,
      setResourceStatus,
      moveResourceToSector,
      setAccountStatus,
      createVenue,
      updateVenue,
      createSector,
      updateSector,
      createResource,
      updateResource,
      setCurrentProfileId,
      users,
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
      updateAccount,
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
