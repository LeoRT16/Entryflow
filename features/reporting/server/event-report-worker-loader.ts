import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EventRow, EventLayoutRow, EventLayoutResourceRow, EventLayoutSectorRow, ExtraWristbandSaleRow, GuestRow, OrganizationRow, ReservationRow, ResourceRow, SectorRow, TableRow, TimelineRow, VenueRow, CheckInRow } from "@/lib/supabase/types";
import { buildEventReport } from "@/features/reporting/domain/event-report";
import { mapEventRowToDomain, mapEventLayoutRowToDomain, mapEventLayoutResourceRowToDomain, mapEventLayoutSectorRowToDomain, mapGuestRowToDomain, mapOrganizationRowToDomain, mapReservationRowToDomain, mapResourceRowToDomain, mapSectorRowToDomain, mapTableRowToDomain, mapTimelineRowToDomain, mapVenueRowToDomain } from "@/lib/supabase/mappers";
import { mapExtraWristbandSaleRowToDomain } from "@/features/reservations/domain/extra-wristbands";
import { buildActiveCheckIns } from "@/services/workspace-loader";
import { compareTimelineEventsDescending } from "@/features/timeline/domain/timeline-domain";
import type { EventReport } from "@/features/reporting/types";

export class WorkerEventReportScopeError extends Error {
  constructor() { super("Reporting event scope unavailable."); this.name = "WorkerEventReportScopeError"; }
}

type Queryable = { select(columns: string): Queryable; eq(column: string, value: string): Queryable; is(column: string, value: null): Queryable; in(column: string, values: string[]): Queryable; maybeSingle(): Promise<{ data: unknown; error: Error | null }>; then<TResult>(onfulfilled?: (value: { data: unknown[] | null; error: Error | null }) => TResult): Promise<TResult>; };

export async function loadEventReportForWorker(client: SupabaseClient<Database>, input: { eventId: string; organizationId: string; generatedAt?: string }): Promise<EventReport> {
  if (!input.eventId || !input.organizationId) throw new WorkerEventReportScopeError();
  const db = client as unknown as { from(table: string): Queryable };
  const eventResult = await db.from("events").select("*").eq("id", input.eventId).is("deleted_at", null).maybeSingle();
  if (eventResult.error || !eventResult.data) throw new WorkerEventReportScopeError();
  const eventRow = eventResult.data as EventRow;
  if (eventRow.deleted_at !== null || eventRow.organization_id !== input.organizationId) throw new WorkerEventReportScopeError();
  const orgResult = await db.from("organizations").select("*").eq("id", input.organizationId).is("deleted_at", null).maybeSingle();
  if (orgResult.error || !orgResult.data || (orgResult.data as OrganizationRow).deleted_at !== null) throw new WorkerEventReportScopeError();
  const organization = mapOrganizationRowToDomain(orgResult.data as OrganizationRow);
  if (organization.status !== "active") throw new WorkerEventReportScopeError();

  const [venues, sectors, resources, reservations, guests, tables, checkIns, timelines, sales, layouts, layoutSectors, layoutResources] = await Promise.all([
    db.from("venues").select("*").eq("organization_id", input.organizationId).is("deleted_at", null),
    db.from("sectors").select("*").is("deleted_at", null),
    db.from("resources").select("*").is("deleted_at", null),
    db.from("reservations").select("*").eq("event_id", input.eventId).is("deleted_at", null),
    db.from("guests").select("*").eq("event_id", input.eventId).is("deleted_at", null),
    db.from("tables").select("*").eq("event_id", input.eventId).is("deleted_at", null),
    db.from("checkins").select("*").eq("event_id", input.eventId).is("deleted_at", null),
    db.from("timeline_events").select("*").eq("event_id", input.eventId),
    db.from("reservation_extra_wristband_sales").select("*").eq("event_id", input.eventId).is("deleted_at", null),
    db.from("event_layouts").select("*").eq("event_id", input.eventId).is("deleted_at", null),
    db.from("event_layout_sectors").select("*").is("deleted_at", null),
    db.from("event_layout_resources").select("*").is("deleted_at", null),
  ]);
  const rows = <T,>(result: { data: unknown[] | null; error: Error | null }) => result.error ? [] as T[] : (result.data ?? []) as T[];
  const event = mapEventRowToDomain(eventRow);
  const venue = event.venueId ? (rows<VenueRow>(venues).find((item) => item.id === event.venueId) ? mapVenueRowToDomain(rows<VenueRow>(venues).find((item) => item.id === event.venueId)!) : undefined) : undefined;
  const eventLayoutRows = rows<EventLayoutRow>(layouts);
  const eventLayoutIds = new Set(eventLayoutRows.map((item) => item.id));
  const sectorRows = rows<SectorRow>(sectors).filter((item) => item.venue_id === event.venueId);
  const resourceRows = rows<ResourceRow>(resources).filter((item) => item.venue_id === event.venueId);
  const timelineEvents = rows<TimelineRow>(timelines).map(mapTimelineRowToDomain).sort(compareTimelineEventsDescending);
  return buildEventReport({ organization, event, venue, resources: resourceRows.map(mapResourceRowToDomain), sectors: sectorRows.map(mapSectorRowToDomain), tables: rows<TableRow>(tables).map(mapTableRowToDomain), eventLayoutResources: rows<EventLayoutResourceRow>(layoutResources).filter((item) => eventLayoutIds.has(item.event_layout_id)).map(mapEventLayoutResourceRowToDomain), eventLayoutSectors: rows<EventLayoutSectorRow>(layoutSectors).filter((item) => eventLayoutIds.has(item.event_layout_id)).map(mapEventLayoutSectorRowToDomain), eventLayouts: eventLayoutRows.map(mapEventLayoutRowToDomain), reservations: rows<ReservationRow>(reservations).map(mapReservationRowToDomain), guests: rows<GuestRow>(guests).map(mapGuestRowToDomain), extraWristbandSales: rows<ExtraWristbandSaleRow>(sales).map(mapExtraWristbandSaleRowToDomain), checkIns: buildActiveCheckIns(rows<CheckInRow>(checkIns)), timelineEvents, generatedAt: input.generatedAt ?? new Date().toISOString() });
}
