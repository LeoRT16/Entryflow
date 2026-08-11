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

export type WorkspaceBootstrap = {
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

function createEmptyWorkspaceBootstrap(): WorkspaceBootstrap {
  const layouts = createEmptyWorkspaceLayouts();

  return {
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

function pickCurrentOrganizationId(organizations: OrganizationRow[]) {
  return [...organizations]
    .filter((organization) => organization.status === "active" && organization.deleted_at === null)
    .sort((a, b) => {
      if (a.updated_at !== b.updated_at) {
        return a.updated_at < b.updated_at ? 1 : -1;
      }

      return a.created_at < b.created_at ? 1 : -1;
    })[0]?.id ?? "";
}

function pickCurrentEventId(events: EventRow[], organizationId: string) {
  const eventList = [...events]
    .filter((event) => event.organization_id === organizationId && event.deleted_at === null)
    .sort((a, b) => {
      if (a.updated_at !== b.updated_at) {
        return a.updated_at < b.updated_at ? 1 : -1;
      }

      return a.start_at < b.start_at ? 1 : -1;
    });

  return eventList[0]?.id ?? "";
}

function pickCurrentProfileId(profiles: ProfileRow[]) {
  const activeProfiles = [...profiles].filter((profile) => !profile.deleted_at);
  return (
    activeProfiles.find((profile) => {
      const metadata = profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
        ? (profile.metadata as Record<string, unknown>)
        : {};

      return metadata.bootstrap === true || metadata.bootstrapOwner === true;
    })?.id
    ?? activeProfiles[0]?.id
    ?? ""
  );
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

export async function loadWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  noStore();
  if (!hasSupabaseConfig()) {
    return createEmptyWorkspaceBootstrap();
  }

  const client = getSupabaseServerClient();

  if (!client) {
    return createEmptyWorkspaceBootstrap();
  }

  const repositories = createSupabaseWorkspaceRepositories(client);

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

  const layouts = await loadWorkspaceLayouts(repositories);

  const users = userRows.map((row) => mapUserRowToDomain(row));
  const roles = roleRows.map((row) => mapRoleRowToDomain(row));
  const profiles = profileRows.map((row) => mapProfileRowToDomain(row));
  const organizations = organizationRows.map((row) => mapOrganizationRowToDomain(row));
  const organizationFallback = organizations[0] ? readCatalogFromOrganization(organizations[0]) : { venues: [], sectors: [], resources: [] };
  const venues = venueRows.map((row) => mapVenueRowToDomain(row));
  const sectors = sectorRows.map((row) => mapSectorRowToDomain(row));
  const resources = resourceRows.map((row) => mapResourceRowToDomain(row));
  const events = eventRows.map((row) => mapEventRowToDomain(row));
  const guests = guestRows.map((row) => mapGuestRowToDomain(row));
  const reservations = reservationRows.map((row) => mapReservationRowToDomain(row));
  const tables = tableRows.map((row) => mapTableRowToDomain(row));
  const checkIns = checkInRows.map((row) => mapCheckInRowToDomain(row));
  const timelineEvents = timelineRows.map((row) => mapTimelineRowToDomain(row)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const currentOrganizationId = pickCurrentOrganizationId(organizationRows);
  const currentEventId = pickCurrentEventId(eventRows, currentOrganizationId);
  const currentProfileId = pickCurrentProfileId(profileRows);

  return {
    users,
    profiles,
    roles,
    organizations,
    venues: venues.length ? venues : organizationFallback.venues,
    sectors: sectors.length ? sectors : organizationFallback.sectors,
    resources: resources.length ? resources : organizationFallback.resources,
    ...layouts,
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

export async function loadWorkspacePayload(): Promise<WorkspacePayload> {
  const bootstrap = await loadWorkspaceBootstrap();

  return bootstrap;
}
