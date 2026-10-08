import assert from "node:assert/strict";
import test from "node:test";
import { loadEventReportForWorker, WorkerEventReportScopeError } from "../features/reporting/server/event-report-worker-loader";
import { buildEventReport, } from "../features/reporting/domain/event-report";
import { buildEventReportFixtureInput, reportOrganization, reportVenue, reportEvent, reportSectors, reportResources, reportEventLayouts, reportEventLayoutSectors, reportEventLayoutResources, reportReservations, reportGuests, reportCheckIns, reportTimelineEvents, reportExtraWristbandSales } from "./fixtures/event-report-fixture";
import { mapOrganizationToRow, mapVenueToRow, mapEventToRow, mapSectorToRow, mapResourceToRow, mapEventLayoutToRow, mapEventLayoutSectorToRow, mapEventLayoutResourceToRow, mapReservationToRow, mapGuestToRow, mapCheckInToRow, mapTimelineToRow } from "../lib/supabase/mappers";

function clientFor(event: unknown, organization: unknown) {
  return { from(table: string) { return { select() { return { eq() { return { is() { return { maybeSingle: async () => table === "events" ? { data: event, error: null } : { data: organization, error: null } }; } }; } }; } }; } } as never;
}

function row<T extends object>(value: T) { return { ...value, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z", deleted_at: null }; }
function fixtureClient() {
  const input = buildEventReportFixtureInput();
  const datasets: Record<string, unknown[]> = {
    events: [row(mapEventToRow(reportEvent))], organizations: [row(mapOrganizationToRow(reportOrganization))], venues: [row(mapVenueToRow(reportVenue))],
    sectors: reportSectors.map((x) => row(mapSectorToRow(x))), resources: reportResources.map((x) => row(mapResourceToRow(x))),
    event_layouts: reportEventLayouts.map((x) => row(mapEventLayoutToRow(x))), event_layout_sectors: reportEventLayoutSectors.map((x) => row(mapEventLayoutSectorToRow(x))), event_layout_resources: reportEventLayoutResources.map((x) => row(mapEventLayoutResourceToRow(x))),
    reservations: reportReservations.map((x) => row(mapReservationToRow(x))), guests: reportGuests.map((x) => row(mapGuestToRow(x))), checkins: reportCheckIns.map((x) => row(mapCheckInToRow(x))), timeline_events: reportTimelineEvents.map((x) => ({ ...mapTimelineToRow(x, reportEvent.id), created_at: x.createdAt, updated_at: x.createdAt, deleted_at: null })),
    reservation_extra_wristband_sales: reportExtraWristbandSales.map((x) => ({ id: x.id, reservation_id: x.reservationId, event_id: x.eventId, quantity: x.quantity, unit_price: x.unitPrice, total_price: x.totalPrice, currency: x.currency, status: x.status, created_by: null, created_at: x.createdAt, cancelled_at: x.cancelledAt ?? null, cancelled_by: null, cancellation_reason: null, updated_at: x.createdAt, deleted_at: null })),
    tables: [],
  };
  const contaminationEvent = { ...datasets.events[0] as Record<string, unknown>, id: "other-event", name: "CONTAMINATION EVENT", organization_id: reportOrganization.id };
  datasets.events.push(contaminationEvent);
  datasets.reservations.push({ ...(datasets.reservations[0] as Record<string, unknown>), id: "other-reservation", event_id: "other-event", name: "CONTAMINATION RESERVATION" });
  datasets.guests.push({ ...(datasets.guests[0] as Record<string, unknown>), id: "other-guest", event_id: "other-event", guest_name: "CONTAMINATION GUEST" });
  datasets.timeline_events.push({ ...(datasets.timeline_events[0] as Record<string, unknown>), id: "other-timeline", event_id: "other-event", title: "CONTAMINATION ACTIVITY" });
  datasets.reservation_extra_wristband_sales.push({ ...(datasets.reservation_extra_wristband_sales[0] as Record<string, unknown>), id: "other-sale", event_id: "other-event", reservation_id: "other-reservation" });
  datasets.events.push({ ...(datasets.events[0] as Record<string, unknown>), id: "foreign-event", organization_id: "foreign-org", name: "FOREIGN CONTAMINATION EVENT" });
  datasets.reservations.push({ ...(datasets.reservations[0] as Record<string, unknown>), id: "foreign-reservation", event_id: "foreign-event", name: "FOREIGN CONTAMINATION RESERVATION" });
  datasets.guests.push({ ...(datasets.guests[0] as Record<string, unknown>), id: "foreign-guest", event_id: "foreign-event", guest_name: "FOREIGN CONTAMINATION GUEST" });
  datasets.timeline_events.push({ ...(datasets.timeline_events[0] as Record<string, unknown>), id: "foreign-timeline", event_id: "foreign-event", title: "FOREIGN CONTAMINATION ACTIVITY" });
  return { from(table: string) { return { select() { let data = datasets[table] ?? []; return { eq(column: string, value: string) { data = data.filter((item) => (item as Record<string, unknown>)[column] === value); return this; }, is(column: string, value: null) { data = data.filter((item) => (item as Record<string, unknown>)[column] === value); return this; }, maybeSingle: async () => ({ data: data[0] ?? null, error: null }), then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data, error: null })) }; } }; } } as never;
}

test("worker loader returns a real EventReport for the deterministic fixture", async () => {
  const workerReport = await loadEventReportForWorker(fixtureClient(), { eventId: reportEvent.id, organizationId: reportOrganization.id, generatedAt: "2026-09-03T04:00:00.000Z" });
  assert.equal(workerReport.metadata.eventId, reportEvent.id); assert.equal(workerReport.metadata.organizationId, reportOrganization.id); assert.equal(workerReport.metadata.venueName, reportVenue.name);
  assert.ok(workerReport.reservations.length); assert.ok(workerReport.attendees.length); assert.ok(workerReport.historical.activity.length);
  assert.ok(workerReport.presales.length); assert.ok(workerReport.courtesies.length); assert.ok(workerReport.resources.length); assert.ok(workerReport.zones.length);
  assert.equal(workerReport.summary.activeExtraWristbands, 2); assert.ok(workerReport.commercial.sold.total.amount !== null);
  assert.equal(JSON.stringify(workerReport).includes("CONTAMINATION"), false);
});

test("worker report is structurally identical to the workspace-backed canonical report", async () => {
  const workerReport = await loadEventReportForWorker(fixtureClient(), { eventId: reportEvent.id, organizationId: reportOrganization.id, generatedAt: "2026-09-03T04:00:00.000Z" });
  const workspaceInput = buildEventReportFixtureInput();
  workspaceInput.timelineEvents = workspaceInput.timelineEvents.map((event) => ({ ...event, metadata: { ...event.metadata, actor: event.actor, context: event.context } }));
  const workspaceReport = buildEventReport(workspaceInput);
  assert.deepEqual(workerReport, workspaceReport);
});

test("worker report excludes same-organization records from another Event", async () => {
  const report = await loadEventReportForWorker(fixtureClient(), { eventId: reportEvent.id, organizationId: reportOrganization.id, generatedAt: "2026-09-03T04:00:00.000Z" });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("CONTAMINATION"), false);
  assert.equal(report.metadata.eventId, reportEvent.id);
});

test("worker report excludes cross-organization records", async () => {
  const report = await loadEventReportForWorker(fixtureClient(), { eventId: reportEvent.id, organizationId: reportOrganization.id, generatedAt: "2026-09-03T04:00:00.000Z" });
  assert.equal(JSON.stringify(report).includes("FOREIGN CONTAMINATION"), false);
});

test("worker loader rejects a missing Event before loading report data", async () => {
  await assert.rejects(() => loadEventReportForWorker(clientFor(null, null), { eventId: "event", organizationId: "org" }), WorkerEventReportScopeError);
});

test("worker loader rejects an Event owned by another Organization", async () => {
  const event = { id: "event", organization_id: "other", deleted_at: null };
  await assert.rejects(() => loadEventReportForWorker(clientFor(event, null), { eventId: "event", organizationId: "org" }), WorkerEventReportScopeError);
});

test("worker loader rejects a missing Organization after Event ownership validation", async () => {
  const event = { id: "event", organization_id: "org", deleted_at: null };
  await assert.rejects(() => loadEventReportForWorker(clientFor(event, null), { eventId: "event", organizationId: "org" }), WorkerEventReportScopeError);
});

test("worker loader rejects a deleted Event", async () => {
  const event = { id: "event", organization_id: "org", deleted_at: "2026-01-01T00:00:00Z" };
  await assert.rejects(() => loadEventReportForWorker(clientFor(event, null), { eventId: "event", organizationId: "org" }), WorkerEventReportScopeError);
});

test("worker loader rejects a deleted Organization", async () => {
  const event = { id: "event", organization_id: "org", deleted_at: null };
  const organization = { id: "org", status: "active", deleted_at: "2026-01-01T00:00:00Z" };
  await assert.rejects(() => loadEventReportForWorker(clientFor(event, organization), { eventId: "event", organizationId: "org" }), WorkerEventReportScopeError);
});

test("worker loader rejects an inactive Organization", async () => {
  const event = { id: "event", organization_id: "org", deleted_at: null };
  const organization = { id: "org", status: "inactive", deleted_at: null };
  await assert.rejects(() => loadEventReportForWorker(clientFor(event, organization), { eventId: "event", organizationId: "org" }), WorkerEventReportScopeError);
});

test("worker loader has no write-capable client calls and is independent of reporting credentials", async () => {
  const writes: string[] = [];
  const client = { from(table: string) { return { select() { return { eq() { return { is() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } }; }, insert() { writes.push(`${table}:insert`); throw new Error("unexpected write"); }, update() { writes.push(`${table}:update`); throw new Error("unexpected write"); }, delete() { writes.push(`${table}:delete`); throw new Error("unexpected write"); }, rpc() { writes.push(`${table}:rpc`); throw new Error("unexpected write"); } }; } } as never;
  await assert.rejects(() => loadEventReportForWorker(client, { eventId: "event", organizationId: "org" }), WorkerEventReportScopeError);
  assert.deepEqual(writes, []);
  assert.equal(process.env.REPORTING_WORKSPACE_USER_ID, undefined);
  assert.equal(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, undefined);
  assert.equal(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, undefined);
});
