import assert from "node:assert/strict";
import test from "node:test";
import { loadEventReportForWorker, WorkerEventReportScopeError } from "../features/reporting/server/event-report-worker-loader";

function clientFor(event: unknown, organization: unknown) {
  return { from(table: string) { return { select() { return { eq() { return { is() { return { maybeSingle: async () => table === "events" ? { data: event, error: null } : { data: organization, error: null } }; } }; } }; } }; } } as never;
}

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
