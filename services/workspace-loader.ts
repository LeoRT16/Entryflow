import { unstable_noStore as noStore } from "next/cache";

import type { AccountRolePreset, AccountUser, OrganizationMembership } from "@/features/accounts/types";
import type { CheckInAttempt, Guest } from "@/features/check-in/types";
import type { Event as PlatformEvent, Organization, Resource, Sector, Venue } from "@/features/domain/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl, hasSupabaseConfig } from "@/lib/supabase/helpers";
import {
  mapCheckInRowToDomain,
  mapEventRowToDomain,
  mapGuestRowToDomain,
  mapOrganizationRowToDomain,
  mapProfileRowToDomain,
  mapRoleRowToDomain,
  mapUserRowToDomain,
  mapResourceRowToDomain,
  mapReservationRowToDomain,
  mapSectorRowToDomain,
  mapTableRowToDomain,
  mapTimelineRowToDomain,
  mapVenueRowToDomain,
} from "@/lib/supabase/mappers";
import type { CheckInRow, EventRow, GuestRow, OrganizationRow, ProfileRow, ResourceRow, ReservationRow, RoleRow, SectorRow, TableRow, TimelineRow, UserRow, VenueRow } from "@/lib/supabase/types";
import { createEmptyWorkspaceLayouts, loadWorkspaceLayouts, type WorkspaceLayoutCollections } from "@/services/workspace-layouts";
import { buildEventSelectionCandidate, pickCurrentEventId as pickCurrentEventSelectionId } from "@/features/events/domain";

export type WorkspaceBootstrap = {
  authState: WorkspaceAuthState;
  currentUserId: string;
  users: AccountUser[];
  profiles: OrganizationMembership[];
  roles: AccountRolePreset[];
  organizations: Organization[];
  venues: Venue[];
  sectors: Sector[];
  resources: Resource[];
  venueLayouts: WorkspaceLayoutCollections["venueLayouts"];
  venueLayoutSectors: WorkspaceLayoutCollections["venueLayoutSectors"];
  venueLayoutResources: WorkspaceLayoutCollections["venueLayoutResources"];
  eventLayouts: WorkspaceLayoutCollections["eventLayouts"];
  eventLayoutSectors: WorkspaceLayoutCollections["eventLayoutSectors"];
  eventLayoutResources: WorkspaceLayoutCollections["eventLayoutResources"];
  events: PlatformEvent[];
  guests: Guest[];
  reservations: ReservationRecord[];
  tables: TableRecord[];
  checkIns: ReturnType<typeof mapCheckInRowToDomain>[];
  attempts: CheckInAttempt[];
  timelineEvents: TimelineEvent[];
  currentOrganizationId: string;
  currentEventId: string;
  currentProfileId: string;
};

export type WorkspaceAuthState =
  | {
      status: "signed-out";
    }
  | {
      status: "ready";
      authUserId: string;
      authUserEmail: string | null;
      publicUserId: string;
      organizationIds: string[];
    }
  | {
      status: "must-change-password";
      authUserId: string;
      authUserEmail: string | null;
      publicUserId: string;
    }
  | {
      status: "unlinked";
      authUserId: string;
      authUserEmail: string | null;
    }
  | {
      status: "inactive-membership";
      authUserId: string;
      authUserEmail: string | null;
      publicUserId: string;
    }
  | {
      status: "no-membership";
      authUserId: string;
      authUserEmail: string | null;
      publicUserId: string;
    };

type WorkspacePayload = WorkspaceBootstrap;

async function fetchSupabaseTable<T>(table: string): Promise<T[]> {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey() || getSupabaseAnonKey();

  if (!url || !key) {
    return [];
  }

  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to load ${table} from Supabase: ${JSON.stringify(payload)}`);
  }

  return Array.isArray(payload) ? (payload as T[]) : [];
}

async function loadAuthIdentityEmailSet(client: ReturnType<typeof getSupabaseServerClient>) {
  const authIdentityEmails = new Set<string>();

  if (!client || !getSupabaseServiceRoleKey()) {
    return authIdentityEmails;
  }

  const perPage = 100;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });

    if (error) {
      return authIdentityEmails;
    }

    for (const user of data.users) {
      const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
      if (email) {
        authIdentityEmails.add(email);
      }
    }

    if (!data.nextPage || !data.users.length || data.users.length < perPage) {
      break;
    }
  }

  return authIdentityEmails;
}

function createEmptyWorkspaceBootstrap(): WorkspaceBootstrap {
  const layouts = createEmptyWorkspaceLayouts();

  return {
    authState: { status: "signed-out" },
    currentUserId: "",
    users: [],
    profiles: [],
    roles: [],
    organizations: [],
    venues: [],
    sectors: [],
    resources: [],
    ...layouts,
    events: [],
    guests: [],
    reservations: [],
    tables: [],
    checkIns: [],
    attempts: [],
    timelineEvents: [],
    currentOrganizationId: "",
    currentEventId: "",
    currentProfileId: "",
  };
}

function readCatalogFromOrganization(organization: Organization) {
  const metadata = organization.metadata && typeof organization.metadata === "object" && !Array.isArray(organization.metadata)
    ? (organization.metadata as Record<string, unknown>)
    : {};

  const venues = Array.isArray(metadata.venues) ? (metadata.venues as Venue[]) : [];
  const sectors = Array.isArray(metadata.sectors) ? (metadata.sectors as Sector[]) : [];
  const resources = Array.isArray(metadata.resources) ? (metadata.resources as Resource[]) : [];

  return { venues, sectors, resources };
}

function pickCurrentEventId(events: EventRow[], organizationId: string) {
  return pickCurrentEventSelectionId(
    events.map((event) =>
      buildEventSelectionCandidate({
        id: event.id,
        organizationId: event.organization_id,
        status: event.status,
        updatedAt: event.updated_at,
        startAt: event.start_at,
        deletedAt: event.deleted_at,
      }),
    ),
    organizationId,
    "",
  );
}

export function pickCurrentProfileIdForUser(profiles: ProfileRow[], currentOrganizationId: string, currentUserId: string) {
  const activeProfiles = [...profiles].filter((profile) => !profile.deleted_at);
  const userProfiles = activeProfiles.filter((profile) => profile.user_id === currentUserId && (!currentOrganizationId || profile.organization_id === currentOrganizationId));

  return userProfiles[0]?.id
    ?? activeProfiles.find((profile) => profile.user_id === currentUserId && profile.organization_id === currentOrganizationId)?.id
    ?? activeProfiles.find((profile) => profile.user_id === currentUserId)?.id
    ?? "";
}

export function pickCurrentOrganizationIdForUser(organizations: OrganizationRow[], profiles: ProfileRow[], currentUserId: string) {
  const allowedOrganizationIds = new Set(
    profiles
      .filter((profile) => profile.user_id === currentUserId && !profile.deleted_at)
      .map((profile) => profile.organization_id),
  );

  return [...organizations]
    .filter((organization) => organization.status === "active" && organization.deleted_at === null && allowedOrganizationIds.has(organization.id))
    .sort((a, b) => {
      if (a.updated_at !== b.updated_at) {
        return a.updated_at < b.updated_at ? 1 : -1;
      }

      return a.created_at < b.created_at ? 1 : -1;
    })[0]?.id ?? "";
}

function buildAttemptsFromLogs(logs: TimelineEvent[], currentEventId: string): CheckInAttempt[] {
  return logs
    .filter((log) => log.kind === "checkin.invalid" || log.kind === "checkin.blocked")
    .map((log) => {
      const metadata = (log as TimelineEvent & { metadata?: Record<string, unknown> }).metadata ?? {};

      return {
        id: log.id,
        eventId: String(metadata.eventId ?? currentEventId),
        query: String(metadata.query ?? log.description ?? ""),
        method: String(metadata.method ?? "QR") as CheckInAttempt["method"],
        timestamp: log.timestamp,
        result: String(metadata.result ?? "No encontrado") as CheckInAttempt["result"],
        guestId: log.guestId,
        guestName: log.guestName,
        note: String(metadata.note ?? log.description ?? ""),
      };
  });
}

export function buildActiveCheckIns(checkInRows: CheckInRow[]) {
  return checkInRows.filter((row) => row.deleted_at === null).map((row) => mapCheckInRowToDomain(row));
}

export function getWorkspaceAuthStateMessage(authState: WorkspaceAuthState) {
  if (authState.status === "must-change-password") {
    return "Tu acceso temporal sigue activo. Creá tu contraseña personal para entrar al equipo.";
  }

  if (authState.status === "unlinked") {
    return "Esta cuenta todavía no está vinculada a un equipo de EntryFlow.";
  }

  if (authState.status === "inactive-membership") {
    return "Tu vínculo con EntryFlow está inactivo.";
  }

  if (authState.status === "no-membership") {
    return "Esta cuenta todavía no tiene acceso a un equipo de EntryFlow.";
  }

  return "Necesitás iniciar sesión para acceder a EntryFlow.";
}

export async function loadWorkspaceBootstrap(authUser?: { id: string; email?: string | null }): Promise<WorkspaceBootstrap> {
  noStore();
  if (!hasSupabaseConfig()) {
    return createEmptyWorkspaceBootstrap();
  }

  const client = getSupabaseServerClient();

  if (!client) {
    return createEmptyWorkspaceBootstrap();
  }

  if (!authUser) {
    return createEmptyWorkspaceBootstrap();
  }

  const repositories = createSupabaseWorkspaceRepositories(client);
  const authIdentityEmails = await loadAuthIdentityEmailSet(client);

  const [
    userRows,
    roleRows,
    profileRows,
    organizationRows,
    venueRows,
    sectorRows,
    resourceRows,
    eventRows,
    guestRows,
    reservationRows,
    tableRows,
    checkInRows,
    timelineRows,
  ] = await Promise.all([
    fetchSupabaseTable<UserRow>("users"),
    fetchSupabaseTable<RoleRow>("roles"),
    fetchSupabaseTable<ProfileRow>("profiles"),
    fetchSupabaseTable<OrganizationRow>("organizations"),
    fetchSupabaseTable<VenueRow>("venues"),
    fetchSupabaseTable<SectorRow>("sectors"),
    fetchSupabaseTable<ResourceRow>("resources"),
    fetchSupabaseTable<EventRow>("events"),
    fetchSupabaseTable<GuestRow>("guests"),
    fetchSupabaseTable<ReservationRow>("reservations"),
    fetchSupabaseTable<TableRow>("tables"),
    fetchSupabaseTable<CheckInRow>("checkins"),
    fetchSupabaseTable<TimelineRow>("timeline_events"),
  ]);

  let linkedUserRow = userRows.find((row) => row.auth_user_id === authUser.id && row.deleted_at === null) ?? null;
  const authEmail = typeof authUser.email === "string" ? authUser.email.trim().toLowerCase() : "";

  if (!linkedUserRow && authEmail) {
    const emailMatch = userRows.find(
      (row) => row.deleted_at === null && row.email.toLowerCase() === authEmail && row.auth_user_id === null,
    );

    if (emailMatch) {
      const persistedUser = await repositories.users.update(emailMatch.id, {
        ...mapUserRowToDomain(emailMatch),
        authUserId: authUser.id,
      });

      if (persistedUser) {
        linkedUserRow = {
          ...emailMatch,
          auth_user_id: authUser.id,
          updated_at: persistedUser.updatedAt,
        };
        userRows[userRows.findIndex((row) => row.id === emailMatch.id)] = linkedUserRow;
      }
    }
  }

  if (!linkedUserRow) {
    return {
      ...createEmptyWorkspaceBootstrap(),
      authState: {
        status: "unlinked",
        authUserId: authUser.id,
        authUserEmail: authUser.email ?? null,
      },
    };
  }

  if (linkedUserRow.must_change_password) {
    return {
      ...createEmptyWorkspaceBootstrap(),
      authState: {
        status: "must-change-password",
        authUserId: authUser.id,
        authUserEmail: authUser.email ?? null,
        publicUserId: linkedUserRow.id,
      },
      currentUserId: linkedUserRow.id,
    };
  }

  const activeProfilesForUser = profileRows.filter((profile) => profile.user_id === linkedUserRow.id && profile.deleted_at === null);
  const allProfilesForUser = profileRows.filter((profile) => profile.user_id === linkedUserRow.id);

  if (!activeProfilesForUser.length) {
    return {
      ...createEmptyWorkspaceBootstrap(),
      authState: {
        status: allProfilesForUser.length ? "inactive-membership" : "no-membership",
        authUserId: authUser.id,
        authUserEmail: authUser.email ?? null,
        publicUserId: linkedUserRow.id,
      },
      currentUserId: linkedUserRow.id,
    };
  }

  const allowedOrganizationIds = new Set(
    activeProfilesForUser
      .map((profile) => profile.organization_id)
      .filter((organizationId) => {
        const organization = organizationRows.find((row) => row.id === organizationId);
        return Boolean(organization && organization.deleted_at === null && organization.status === "active");
      }),
  );

  if (!allowedOrganizationIds.size) {
    return {
      ...createEmptyWorkspaceBootstrap(),
      authState: {
        status: "inactive-membership",
        authUserId: authUser.id,
        authUserEmail: authUser.email ?? null,
        publicUserId: linkedUserRow.id,
      },
      currentUserId: linkedUserRow.id,
    };
  }

  const organizationRowsForWorkspace = organizationRows.filter(
    (organization) => allowedOrganizationIds.has(organization.id) && organization.status === "active" && organization.deleted_at === null,
  );
  const profileRowsForWorkspace = profileRows.filter((profile) => allowedOrganizationIds.has(profile.organization_id));
  const allowedUserIds = new Set(profileRowsForWorkspace.map((profile) => profile.user_id));
  allowedUserIds.add(linkedUserRow.id);

  const venueRowsForWorkspace = venueRows.filter(
    (venue) => allowedOrganizationIds.has(venue.organization_id) && venue.deleted_at === null,
  );
  const allowedVenueIds = new Set(venueRowsForWorkspace.map((venue) => venue.id));

  const sectorRowsForWorkspace = sectorRows.filter(
    (sector) => allowedVenueIds.has(sector.venue_id) && sector.deleted_at === null,
  );
  const resourceRowsForWorkspace = resourceRows.filter(
    (resource) => allowedVenueIds.has(resource.venue_id) && resource.deleted_at === null,
  );

  const eventRowsForWorkspace = eventRows.filter(
    (event) => allowedOrganizationIds.has(event.organization_id) && event.deleted_at === null,
  );
  const allowedEventIds = new Set(eventRowsForWorkspace.map((event) => event.id));

  const guestRowsForWorkspace = guestRows.filter((guest) => allowedEventIds.has(guest.event_id) && guest.deleted_at === null);
  const reservationRowsForWorkspace = reservationRows.filter((reservation) => allowedEventIds.has(reservation.event_id) && reservation.deleted_at === null);
  const tableRowsForWorkspace = tableRows.filter(
    (table) => table.deleted_at === null && (table.event_id === null || allowedEventIds.has(table.event_id)),
  );
  const checkInRowsForWorkspace = checkInRows.filter((checkIn) => allowedEventIds.has(checkIn.event_id) && checkIn.deleted_at === null);
  const timelineRowsForWorkspace = timelineRows.filter((timeline) => allowedEventIds.has(timeline.event_id));

  const layouts = await loadWorkspaceLayouts(repositories);
  const venueLayouts = layouts.venueLayouts.filter((layout) => allowedVenueIds.has(layout.venueId) && layout.status === "active");
  const allowedVenueLayoutIds = new Set(venueLayouts.map((layout) => layout.id));
  const venueLayoutSectors = layouts.venueLayoutSectors.filter((layoutSector) => allowedVenueLayoutIds.has(layoutSector.venueLayoutId));
  const venueLayoutResources = layouts.venueLayoutResources.filter((layoutResource) => allowedVenueLayoutIds.has(layoutResource.venueLayoutId));
  const eventLayouts = layouts.eventLayouts.filter(
    (layout) => allowedEventIds.has(layout.eventId) || allowedVenueIds.has(layout.venueId),
  );
  const allowedEventLayoutIds = new Set(eventLayouts.map((layout) => layout.id));
  const eventLayoutSectors = layouts.eventLayoutSectors.filter((layoutSector) => allowedEventLayoutIds.has(layoutSector.eventLayoutId));
  const eventLayoutResources = layouts.eventLayoutResources.filter((layoutResource) => allowedEventLayoutIds.has(layoutResource.eventLayoutId));

  const currentOrganizationId =
    pickCurrentOrganizationIdForUser(organizationRowsForWorkspace, profileRowsForWorkspace, linkedUserRow.id)
    || organizationRowsForWorkspace[0]?.id
    || "";
  const currentEventId = pickCurrentEventId(eventRowsForWorkspace, currentOrganizationId);
  const currentProfileId = pickCurrentProfileIdForUser(profileRowsForWorkspace, currentOrganizationId, linkedUserRow.id);

  const users = userRows
    .filter((row) => allowedUserIds.has(row.id) && row.deleted_at === null)
    .map((row) => {
      const user = mapUserRowToDomain(row);

      return {
        ...user,
        authIdentityExists: Boolean(user.authUserId) || authIdentityEmails.has(user.email.trim().toLowerCase()),
      };
    });
  const roles = roleRows.map((row) => mapRoleRowToDomain(row));
  const profiles = profileRowsForWorkspace.map((row) => mapProfileRowToDomain(row));
  const organizations = organizationRowsForWorkspace.map((row) => mapOrganizationRowToDomain(row));
  const organizationFallback = organizations[0] ? readCatalogFromOrganization(organizations[0]) : { venues: [], sectors: [], resources: [] };
  const venues = venueRowsForWorkspace.map((row) => mapVenueRowToDomain(row));
  const sectors = sectorRowsForWorkspace.map((row) => mapSectorRowToDomain(row));
  const resources = resourceRowsForWorkspace.map((row) => mapResourceRowToDomain(row));
  const events = eventRowsForWorkspace.map((row) => mapEventRowToDomain(row));
  const guests = guestRowsForWorkspace.map((row) => mapGuestRowToDomain(row));
  const reservations = reservationRowsForWorkspace.map((row) => mapReservationRowToDomain(row));
  const tables = tableRowsForWorkspace.map((row) => mapTableRowToDomain(row));
  const checkIns = buildActiveCheckIns(checkInRowsForWorkspace);
  const timelineEvents = timelineRowsForWorkspace.map((row) => mapTimelineRowToDomain(row)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return {
    authState: {
      status: "ready",
      authUserId: authUser.id,
      authUserEmail: authUser.email ?? null,
      publicUserId: linkedUserRow.id,
      organizationIds: [...allowedOrganizationIds],
    },
    currentUserId: linkedUserRow.id,
    users,
    profiles,
    roles,
    organizations,
    venues: venues.length ? venues : organizationFallback.venues,
    sectors: sectors.length ? sectors : organizationFallback.sectors,
    resources: resources.length ? resources : organizationFallback.resources,
    ...layouts,
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
    attempts: buildAttemptsFromLogs(timelineEvents, currentEventId),
    timelineEvents,
    currentOrganizationId,
    currentEventId,
    currentProfileId,
  };
}

export async function loadWorkspacePayload(authUser?: { id: string; email?: string | null }): Promise<WorkspacePayload> {
  const bootstrap = await loadWorkspaceBootstrap(authUser);

  return bootstrap;
}
