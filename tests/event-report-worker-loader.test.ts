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
