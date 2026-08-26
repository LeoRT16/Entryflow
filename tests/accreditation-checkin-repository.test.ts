import assert from "node:assert/strict";
import test from "node:test";

import { AccreditationCheckInAlreadyConsumedError } from "../features/accreditation/check-in";
import type { AccreditationCheckInRow } from "../features/accreditation/check-in";
import { createSupabaseAccreditationCheckInRepositories } from "../repositories/supabase-accreditation-checkin-repositories";

type QueueItem = { data?: unknown; error?: { message: string; code?: string; constraint?: string } | null };

function createFakeClient(queue: QueueItem[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  type FakeBuilder = {
    select(columns?: string): FakeBuilder;
    eq(column: string, value: unknown): FakeBuilder;
    order(column: string, options?: { ascending?: boolean }): FakeBuilder;
    insert(payload: unknown): FakeBuilder;
    update(payload: unknown): FakeBuilder;
    maybeSingle(): Promise<QueueItem>;
    single(): Promise<QueueItem>;
    then(resolve: (value: QueueItem) => void, reject: (reason?: unknown) => void): undefined;
  };

  function createBuilder(table: string): FakeBuilder {
    const builder: FakeBuilder = {
      select(columns?: string) {
        calls.push({ table, op: `select:${columns ?? "*"}` });
        return builder;
      },
      eq(column: string, value: unknown) {
        calls.push({ table, op: `eq:${column}`, payload: value });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        calls.push({ table, op: `order:${column}`, payload: options });
        return builder;
      },
      insert(payload: unknown) {
        calls.push({ table, op: "insert", payload });
        return builder;
      },
      update(payload: unknown) {
        calls.push({ table, op: "update", payload });
        return builder;
      },
      async maybeSingle() {
        return queue.shift() ?? { data: null, error: null };
      },
      async single() {
        return queue.shift() ?? { data: null, error: null };
      },
      then(resolve: (value: QueueItem) => void, reject: (reason?: unknown) => void) {
        const next = queue.shift() ?? { data: null, error: null };
        if (next.error) {
          reject?.(next.error);
          return undefined;
        }
        resolve(next);
        return undefined;
      },
    };

    return builder;
  }

  return {
    calls,
    from(table: string) {
      return createBuilder(table);
    },
  };
}

function buildRow(overrides: Partial<AccreditationCheckInRow> = {}): AccreditationCheckInRow {
  return {
    id: "checkin-1",
    organization_id: "org-1",
    event_id: "event-1",
    enrollment_id: "enrollment-1",
    access_grant_id: "grant-1",
    operator_profile_id: "profile-1",
    source: "qr",
    checked_in_at: "2026-08-26T12:00:00.000Z",
    metadata: { note: "vip" },
    created_at: "2026-08-26T12:00:00.000Z",
    updated_at: "2026-08-26T12:00:00.000Z",
    ...overrides,
  };
}

test("repository round-trips create, lookup, and list queries against accreditation_checkins", async () => {
  const client = createFakeClient([
    { data: buildRow() },
    { data: buildRow() },
    { data: buildRow() },
    { data: [buildRow(), buildRow({ id: "checkin-2", checked_in_at: "2026-08-26T12:01:00.000Z" })] },
  ]);

  const repositories = createSupabaseAccreditationCheckInRepositories(client as never);
  const created = await repositories.create({
    id: "checkin-1",
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: "enrollment-1",
    accessGrantId: "grant-1",
    operatorProfileId: "profile-1",
    source: "qr",
    checkedInAt: "2026-08-26T12:00:00.000Z",
    metadata: { note: "vip" },
    createdAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
  });

  const byAccessGrant = await repositories.getByAccessGrant({ organizationId: "org-1", eventId: "event-1" }, "grant-1");
  const byEnrollment = await repositories.getByEnrollment({ organizationId: "org-1", eventId: "event-1" }, "enrollment-1");
  const list = await repositories.listByEvent({ organizationId: "org-1", eventId: "event-1" });

  assert.equal(created.accessGrantId, "grant-1");
  assert.equal(byAccessGrant?.id, "checkin-1");
  assert.equal(byEnrollment?.operatorProfileId, "profile-1");
  assert.equal(list.length, 2);
  assert.ok(client.calls.some((call) => call.table === "accreditation_checkins"));
  assert.equal(client.calls.some((call) => call.table === "reservations"), false);
  assert.equal(client.calls.some((call) => call.table === "guests"), false);
});

test("repository translates duplicate access_grant_id violations into an explicit consumption error", async () => {
  const client = createFakeClient([
    {
      error: {
        code: "23505",
        constraint: "accreditation_checkins_access_grant_unique",
        message: 'duplicate key value violates unique constraint "accreditation_checkins_access_grant_unique"',
      },
    },
  ]);

  const repositories = createSupabaseAccreditationCheckInRepositories(client as never);

  await assert.rejects(
    () =>
      repositories.create({
        id: "checkin-1",
        organizationId: "org-1",
        eventId: "event-1",
        enrollmentId: "enrollment-1",
        accessGrantId: "grant-1",
        operatorProfileId: "profile-1",
        source: "qr",
        checkedInAt: "2026-08-26T12:00:00.000Z",
        createdAt: "2026-08-26T12:00:00.000Z",
        updatedAt: "2026-08-26T12:00:00.000Z",
      }),
    AccreditationCheckInAlreadyConsumedError,
  );
});
