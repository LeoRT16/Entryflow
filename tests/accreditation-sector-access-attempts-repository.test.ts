import assert from "node:assert/strict";
import test from "node:test";

import type { AccreditationSectorAccessAttemptRow } from "../features/accreditation/sector-access";
import { createSupabaseAccreditationSectorAccessRepositories } from "../repositories/supabase-accreditation-sector-access-repositories";

type QueueItem = { data?: unknown; error?: { message: string; code?: string } | null };

function createFakeClient(queue: QueueItem[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  function builder(table: string) {
    const query = {
      select(columns?: string) { calls.push({ table, op: `select:${columns ?? "*"}` }); return query; },
      eq(column: string, value: unknown) { calls.push({ table, op: `eq:${column}`, payload: value }); return query; },
      order(column: string, options?: unknown) { calls.push({ table, op: `order:${column}`, payload: options }); return query; },
      insert(payload: unknown) { calls.push({ table, op: "insert", payload }); return query; },
      update(payload: unknown) { calls.push({ table, op: "update", payload }); return query; },
      maybeSingle: async () => queue.shift() ?? { data: null, error: null },
      single: async () => queue.shift() ?? { data: null, error: null },
      then(resolve: (value: QueueItem) => void) { resolve(queue.shift() ?? { data: null, error: null }); return undefined; },
    };
    return query;
  }

  return { calls, from(table: string) { return builder(table); } };
}

const row: AccreditationSectorAccessAttemptRow = {
  id: "attempt-1",
  organization_id: "org-1",
  event_id: "event-1",
  access_grant_id: "grant-1",
  enrollment_id: "enrollment-1",
  sector_id: "sector-1",
  operator_profile_id: "profile-1",
  source: "qr",
  credential_reference: "acc1_token",
  sector_reference: "sector-1",
  decision: "allow",
  denial_reason: null,
  evaluated_at: "2026-08-31T12:00:00.000Z",
  metadata: null,
  created_at: "2026-08-31T12:00:00.000Z",
};

test("attempt repository appends both decisions and lists only the event scope", async () => {
  const client = createFakeClient([{ data: row }, { data: [row] }]);
  const repositories = createSupabaseAccreditationSectorAccessRepositories(client as never);

  const appended = await repositories.attempts.append({
    organizationId: "org-1",
    eventId: "event-1",
    accessGrantId: "grant-1",
    enrollmentId: "enrollment-1",
    sectorId: "sector-1",
    operatorProfileId: "profile-1",
    source: "qr",
    credentialReference: "acc1_token",
    sectorReference: "sector-1",
    decision: "allow",
  });
  const listed = await repositories.attempts.listByEvent({ organizationId: "org-1", eventId: "event-1" });

  assert.equal(appended.decision, "allow");
  assert.equal(listed[0]?.operatorProfileId, "profile-1");
  assert.ok(client.calls.some((call) => call.table === "accreditation_sector_access_attempts" && call.op === "insert"));
  assert.ok(client.calls.some((call) => call.op === "eq:organization_id" && call.payload === "org-1"));
  assert.ok(client.calls.some((call) => call.op === "eq:event_id" && call.payload === "event-1"));
});
