import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseAccreditationAccessRepositories } from "../repositories/supabase-accreditation-access-repositories";

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

test("access grant repository stays scoped to accreditation_access_grants", async () => {
  const client = createFakeClient([
    {
      data: {
        id: "grant-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        status: "active",
        issued_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T12:00:00.000Z",
        revoked_at: null,
        metadata: { badge: "vip" },
      },
    },
    {
      data: {
        id: "grant-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        status: "active",
        issued_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T12:00:00.000Z",
        revoked_at: null,
        metadata: { badge: "vip" },
      },
    },
    {
      data: {
        id: "grant-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        status: "active",
        issued_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T12:00:00.000Z",
        revoked_at: null,
        metadata: { badge: "vip" },
      },
    },
    {
      data: {
        id: "grant-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        status: "revoked",
        issued_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T13:00:00.000Z",
        revoked_at: "2026-08-26T13:00:00.000Z",
        metadata: { badge: "vip" },
      },
    },
    {
      data: {
        id: "grant-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        status: "revoked",
        issued_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T13:00:00.000Z",
        revoked_at: "2026-08-26T13:00:00.000Z",
        metadata: { badge: "vip" },
      },
    },
    {
      data: {
        id: "grant-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        status: "revoked",
        issued_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T13:00:00.000Z",
        revoked_at: "2026-08-26T13:00:00.000Z",
        metadata: { badge: "vip" },
      },
    },
    {
      data: [
        {
          id: "grant-1",
          organization_id: "org-1",
          event_id: "event-1",
          enrollment_id: "enrollment-1",
          access_code: "ACC-7K4D-9M2Q",
          qr_token: "acc1_1234567890abcdef1234567890abcdef",
          status: "revoked",
          issued_at: "2026-08-26T12:00:00.000Z",
          updated_at: "2026-08-26T13:00:00.000Z",
          revoked_at: "2026-08-26T13:00:00.000Z",
          metadata: { badge: "vip" },
        },
      ],
    },
  ]);

  const repositories = createSupabaseAccreditationAccessRepositories(client as never);

  const created = await repositories.create({
    id: "grant-1",
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: "enrollment-1",
    accessCode: "ACC-7K4D-9M2Q",
    qrToken: "acc1_1234567890abcdef1234567890abcdef",
    status: "active",
    issuedAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
    revokedAt: null,
    metadata: { badge: "vip" },
  });

  const byEnrollment = await repositories.getByEnrollment({ organizationId: "org-1", eventId: "event-1" }, "enrollment-1");
  const byCode = await repositories.resolveByAccessCode({ organizationId: "org-1", eventId: "event-1" }, " acc-7k4d-9m2q ");
  const byToken = await repositories.resolveByQrToken({ organizationId: "org-1", eventId: "event-1" }, " ACC1_1234567890ABCDEF1234567890ABCDEF ");
  const revoked = await repositories.revoke({ organizationId: "org-1", eventId: "event-1" }, "grant-1");
  const list = await repositories.list({ organizationId: "org-1", eventId: "event-1" });

  assert.equal(created.organizationId, "org-1");
  assert.equal(byEnrollment?.id, "grant-1");
  assert.equal(byCode?.accessCode, "ACC-7K4D-9M2Q");
  assert.equal(byToken?.qrToken, "acc1_1234567890abcdef1234567890abcdef");
  assert.equal(revoked.status, "revoked");
  assert.equal(list.length, 1);
  assert.ok(client.calls.some((call) => call.table === "accreditation_access_grants"));
  assert.equal(client.calls.some((call) => call.table === "reservations"), false);
  assert.equal(client.calls.some((call) => call.table === "guests"), false);
});
