import { unstable_noStore as noStore } from "next/cache";

import type { CheckInAttempt, Guest } from "@/features/check-in/types";
import type { Event as PlatformEvent, Organization } from "@/features/domain/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/helpers";
import {
  mapCheckInRowToDomain,
  mapEventRowToDomain,
  mapGuestRowToDomain,
  mapOperationToTimelineEvent,
  mapOrganizationRowToDomain,
  mapReservationRowToDomain,
  mapTableRowToDomain,
  mapTimelineRowToDomain,
} from "@/lib/supabase/mappers";
import type { CheckInRow, EventRow, GuestRow, OperationRow, OrganizationRow, ReservationRow, TableRow, TimelineRow } from "@/lib/supabase/types";

export type WorkspaceBootstrap = {
  organizations: Organization[];
  events: PlatformEvent[];
  guests: Guest[];
  reservations: ReservationRecord[];
  tables: TableRecord[];
  checkIns: ReturnType<typeof mapCheckInRowToDomain>[];
  attempts: CheckInAttempt[];
  timelineEvents: TimelineEvent[];
  currentOrganizationId: string;
  currentEventId: string;
};

type WorkspacePayload = WorkspaceBootstrap & {
  activityLogs: TimelineEvent[];
};

function createEmptyWorkspaceBootstrap(): WorkspaceBootstrap {
  return {
    organizations: [],
    events: [],
    guests: [],
    reservations: [],
    tables: [],
    checkIns: [],
    attempts: [],
    timelineEvents: [],
    currentOrganizationId: "",
    currentEventId: "",
  };
}

function pickCurrentOrganizationId(organizations: Organization[]) {
  return organizations.find((organization) => organization.status === "active")?.id ?? organizations[0]?.id ?? "";
}

function pickCurrentEventId(events: PlatformEvent[], organizationId: string) {
  const eventList = events.filter((event) => event.organizationId === organizationId);

  return eventList.find((event) => event.status === "live")?.id ?? eventList[0]?.id ?? "";
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

  const [
    organizationsResponse,
    eventsResponse,
    guestsResponse,
    reservationsResponse,
    tablesResponse,
    checkInsResponse,
    timelineResponse,
    operationsResponse,
  ] = await Promise.all([
    client.from("organizations").select("*").is("deleted_at", null),
    client.from("events").select("*").is("deleted_at", null),
    client.from("guests").select("*").is("deleted_at", null),
    client.from("reservations").select("*").is("deleted_at", null),
    client.from("tables").select("*").is("deleted_at", null),
    client.from("checkins").select("*").is("deleted_at", null),
    client.from("timeline_events").select("*").is("deleted_at", null),
    client.from("operations").select("*").is("deleted_at", null),
  ]);

  const organizations = (organizationsResponse.data ?? []).map((row) => mapOrganizationRowToDomain(row as OrganizationRow));
  const events = (eventsResponse.data ?? []).map((row) => mapEventRowToDomain(row as EventRow));
  const guests = (guestsResponse.data ?? []).map((row) => mapGuestRowToDomain(row as GuestRow));
  const reservations = (reservationsResponse.data ?? []).map((row) => mapReservationRowToDomain(row as ReservationRow));
  const tables = (tablesResponse.data ?? []).map((row) => mapTableRowToDomain(row as TableRow));
  const checkIns = (checkInsResponse.data ?? []).map((row) => mapCheckInRowToDomain(row as CheckInRow));
  const timelineEvents = [
    ...(timelineResponse.data ?? []).map((row) => mapTimelineRowToDomain(row as TimelineRow)),
    ...(operationsResponse.data ?? []).map((row) => mapOperationToTimelineEvent(row as OperationRow)),
  ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const currentOrganizationId = pickCurrentOrganizationId(organizations);
  const currentEventId = pickCurrentEventId(events, currentOrganizationId);

  return {
    organizations,
    events,
    guests,
    reservations,
    tables,
    checkIns,
    attempts: buildAttemptsFromLogs(timelineEvents, currentEventId),
    timelineEvents,
    currentOrganizationId,
    currentEventId,
  };
}

export async function loadWorkspacePayload(): Promise<WorkspacePayload> {
  const bootstrap = await loadWorkspaceBootstrap();

  return {
    ...bootstrap,
    activityLogs: bootstrap.timelineEvents,
  };
}
