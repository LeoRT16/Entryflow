import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseAccreditationSectorAccessRepositories } from "../repositories/supabase-accreditation-sector-access-repositories";

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

test("sector repository operations stay scoped to the new Phase 3A tables", async () => {
  const client = createFakeClient([
    { data: { id: "event-1", organization_id: "org-1", deleted_at: null } },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP",
        code: "VIP",
        description: null,
        status: "active",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP",
        code: "VIP",
        description: null,
        status: "active",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP Plus",
        code: "VIP",
        description: null,
        status: "inactive",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:10:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP Plus",
        code: "VIP",
        description: null,
        status: "inactive",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP Plus",
        code: "VIP",
        description: null,
        status: "inactive",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:20:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP Plus",
        code: "VIP",
        description: null,
        status: "inactive",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP Plus",
        code: "VIP",
        description: null,
        status: "inactive",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:20:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: [
        {
          id: "sector-1",
          organization_id: "org-1",
          event_id: "event-1",
          name: "VIP Plus",
          code: "VIP",
          description: null,
          status: "inactive",
          capacity: 120,
          sort_order: 0,
          metadata: null,
          created_at: "2026-08-27T10:00:00.000Z",
          updated_at: "2026-08-27T10:20:00.000Z",
          deleted_at: null,
        },
      ],
    },
  ]);

  const repositories = createSupabaseAccreditationSectorAccessRepositories(client as never);
  const created = await repositories.sectors.create({
    organizationId: "org-1",
    eventId: "event-1",
    name: "VIP",
    code: "vip",
    status: "active",
    capacity: 120,
  });
  const loaded = await repositories.sectors.getById("sector-1");
  const updated = await repositories.sectors.update("sector-1", { name: "VIP Plus", status: "inactive" });
  const deactivated = await repositories.sectors.deactivate("sector-1");
  const listed = await repositories.sectors.listByEvent({ organizationId: "org-1", eventId: "event-1" });

  assert.equal(created.code, "VIP");
  assert.equal(loaded?.id, "sector-1");
  assert.equal(updated.status, "inactive");
  assert.equal(deactivated.status, "inactive");
  assert.equal(listed.length, 1);
  assert.ok(client.calls.some((call) => call.table === "accreditation_access_sectors"));
  assert.equal(client.calls.some((call) => call.table === "accreditation_access_grants" && call.op === "update"), false);
});

test("entitlement repository assignment falls back after uniqueness and revoke stays in scope", async () => {
  const client = createFakeClient([
    { data: null },
    {
      data: {
        id: "grant-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        status: "active",
        issued_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:00:00.000Z",
        revoked_at: null,
        metadata: null,
      },
    },
    {
      data: {
        id: "sector-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "VIP",
        code: "VIP",
        description: null,
        status: "active",
        capacity: 120,
        sort_order: 0,
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "enrollment-1",
        organization_id: "org-1",
        event_id: "event-1",
        name: "Leonardo Rodríguez",
        email: null,
        phone: null,
        category_id: null,
        sector_id: null,
        status: "active",
        metadata: null,
        created_at: "2026-08-27T10:00:00.000Z",
        updated_at: "2026-08-27T10:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      error: {
        code: "23505",
        constraint: "accreditation_access_entitlements_grant_sector_active_unique",
        message: 'duplicate key value violates unique constraint "accreditation_access_entitlements_grant_sector_active_unique"',
      },
    },
    {
      data: {
        id: "entitlement-1",
        organization_id: "org-1",
        event_id: "event-1",
        access_grant_id: "grant-1",
        sector_id: "sector-1",
        status: "active",
        issued_at: "2026-08-27T10:30:00.000Z",
        revoked_at: null,
        metadata: null,
        created_at: "2026-08-27T10:30:00.000Z",
        updated_at: "2026-08-27T10:30:00.000Z",
      },
    },
    {
      data: {
        id: "entitlement-1",
        organization_id: "org-1",
        event_id: "event-1",
        access_grant_id: "grant-1",
        sector_id: "sector-1",
        status: "active",
        issued_at: "2026-08-27T10:30:00.000Z",
        revoked_at: null,
        metadata: null,
        created_at: "2026-08-27T10:30:00.000Z",
        updated_at: "2026-08-27T10:30:00.000Z",
      },
    },
    {
      data: {
        id: "entitlement-1",
        organization_id: "org-1",
        event_id: "event-1",
        access_grant_id: "grant-1",
        sector_id: "sector-1",
        status: "revoked",
        issued_at: "2026-08-27T10:30:00.000Z",
        revoked_at: "2026-08-27T11:00:00.000Z",
        metadata: null,
        created_at: "2026-08-27T10:30:00.000Z",
        updated_at: "2026-08-27T11:00:00.000Z",
      },
    },
  ]);

  const repositories = createSupabaseAccreditationSectorAccessRepositories(client as never);
  const assigned = await repositories.entitlements.assign({
    organizationId: "org-1",
    eventId: "event-1",
    accessGrantId: "grant-1",
    sectorId: "sector-1",
  });
  const revoked = await repositories.entitlements.revoke("entitlement-1");

  assert.equal(assigned.id, "entitlement-1");
  assert.equal(assigned.accessGrantId, "grant-1");
  assert.equal(revoked.status, "revoked");
  assert.ok(client.calls.some((call) => call.table === "accreditation_access_entitlements"));
  assert.equal(client.calls.some((call) => call.table === "accreditation_access_grants" && call.op === "update"), false);
});
