import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseAccreditationRepositories } from "../repositories/supabase-accreditation-repositories";

type QueueItem = { data?: unknown; error?: { message: string; code?: string } | null };

function createFakeClient(queue: QueueItem[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  type FakeBuilder = {
    select(columns?: string): FakeBuilder;
    eq(column: string, value: unknown): FakeBuilder;
    in(column: string, value: readonly unknown[]): FakeBuilder;
    is(column: string, value: null): FakeBuilder;
    order(column: string, options?: { ascending?: boolean }): FakeBuilder;
    insert(payload: unknown): FakeBuilder;
    update(payload: unknown): FakeBuilder;
    upsert(payload: unknown, options?: { onConflict?: string }): FakeBuilder;
    delete(): FakeBuilder;
    maybeSingle(): Promise<QueueItem>;
    single(): Promise<QueueItem>;
    then(resolve: (value: QueueItem) => void, reject: (reason?: unknown) => void): undefined;
    catch(): FakeBuilder;
    finally(): FakeBuilder;
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
      in(column: string, value: readonly unknown[]) {
        calls.push({ table, op: `in:${column}`, payload: [...value] });
        return builder;
      },
      is(column: string, value: null) {
        calls.push({ table, op: `is:${column}`, payload: value });
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
      upsert(payload: unknown, options?: { onConflict?: string }) {
        calls.push({ table, op: `upsert:${options?.onConflict ?? ""}`, payload });
        return builder;
      },
      delete() {
        calls.push({ table, op: "delete" });
        return builder;
      },
      async maybeSingle() {
        const next = queue.shift() ?? { data: null, error: null };
        return next;
      },
      async single() {
        const next = queue.shift() ?? { data: null, error: null };
        return next;
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
      catch() {
        return builder;
      },
      finally() {
        return builder;
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

test("enrollment creation persists without reservation or guest tables", async () => {
  const client = createFakeClient([
    { data: { id: "event-1", organization_id: "org-1", venue_id: "venue-1", name: "Conference", status: "published", start_at: "2026-08-26", end_at: null, timezone: "America/La_Paz", venue: "Main", capacity: 100, enabled_modules: [], operational_model: "accreditation", admission_methods: [], resource_types: [], icon: null, metadata: null, created_at: "2026-08-26T00:00:00.000Z", updated_at: "2026-08-26T00:00:00.000Z", deleted_at: null } },
    { data: { id: "category-1", organization_id: "org-1", event_id: "event-1", slug: "vip", name: "VIP", description: null, color: null, sort_order: 0, is_active: true, metadata: null, created_at: "2026-08-26T00:00:00.000Z", updated_at: "2026-08-26T00:00:00.000Z", deleted_at: null } },
    { data: { id: "sector-1", venue_id: "venue-1", name: "Main Auditorium", description: null, capacity: 100, display_order: 0, status: "active", metadata: null, created_at: "2026-08-26T00:00:00.000Z", updated_at: "2026-08-26T00:00:00.000Z", deleted_at: null } },
    {
      data: {
        id: "enrollment-1",
        organization_id: "org-1",
        event_id: "event-1",
        category_id: "category-1",
        sector_id: "sector-1",
        name: "Leonardo Rodríguez",
        email: "leo@example.com",
        phone: "+59170000000",
        status: "active",
        metadata: { badge: "vip" },
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "enrollment-1",
        organization_id: "org-1",
        event_id: "event-1",
        category_id: "category-1",
        sector_id: "sector-1",
        name: "Leonardo Rodríguez Updated",
        email: "leo@example.com",
        phone: "+59170000000",
        status: "cancelled",
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:20:00.000Z",
        deleted_at: null,
      },
    },
  ]);

  const repositories = createSupabaseAccreditationRepositories(client as never);
  const enrollment = await repositories.enrollments.create({
    organizationId: "org-1",
    eventId: "event-1",
    name: "Leonardo Rodríguez",
    email: "leo@example.com",
    phone: "+59170000000",
    categoryId: "category-1",
    sectorId: "sector-1",
    metadata: { badge: "vip" },
  });

  assert.equal(enrollment.id, "enrollment-1");
  assert.equal(enrollment.status, "active");
  assert.ok(client.calls.some((call) => call.table === "accreditation_enrollments" && call.op === "insert"));
  assert.equal(client.calls.some((call) => call.table === "reservations"), false);
  assert.equal(client.calls.some((call) => call.table === "guests"), false);
});

test("category uniqueness is per event and list queries scope by event", async () => {
  const client = createFakeClient([
    { data: { id: "event-1", organization_id: "org-1", venue_id: "venue-1", name: "Conference", status: "published", start_at: "2026-08-26", end_at: null, timezone: "America/La_Paz", venue: "Main", capacity: 100, enabled_modules: [], operational_model: "accreditation", admission_methods: [], resource_types: [], icon: null, metadata: null, created_at: "2026-08-26T00:00:00.000Z", updated_at: "2026-08-26T00:00:00.000Z", deleted_at: null } },
    {
      data: {
        id: "category-1",
        organization_id: "org-1",
        event_id: "event-1",
        slug: "vip",
        name: "VIP",
        description: null,
        color: null,
        sort_order: 0,
        is_active: true,
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
        deleted_at: null,
      },
    },
    { data: { id: "event-2", organization_id: "org-1", venue_id: "venue-1", name: "Workshop", status: "published", start_at: "2026-08-26", end_at: null, timezone: "America/La_Paz", venue: "Main", capacity: 40, enabled_modules: [], operational_model: "accreditation", admission_methods: [], resource_types: [], icon: null, metadata: null, created_at: "2026-08-26T00:00:00.000Z", updated_at: "2026-08-26T00:00:00.000Z", deleted_at: null } },
    {
      data: {
        id: "category-2",
        organization_id: "org-1",
        event_id: "event-2",
        slug: "vip",
        name: "VIP",
        description: null,
        color: null,
        sort_order: 0,
        is_active: true,
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
        deleted_at: null,
      },
    },
    { data: [{ id: "category-1", organization_id: "org-1", event_id: "event-1", slug: "vip", name: "VIP", description: null, color: null, sort_order: 0, is_active: true, metadata: null, created_at: "2026-08-26T00:00:00.000Z", updated_at: "2026-08-26T00:00:00.000Z", deleted_at: null }] },
  ]);

  const repositories = createSupabaseAccreditationRepositories(client as never);

  const first = await repositories.categories.create({
    organizationId: "org-1",
    eventId: "event-1",
    slug: "vip",
    name: "VIP",
  });
  const second = await repositories.categories.create({
    organizationId: "org-1",
    eventId: "event-2",
    slug: "vip",
    name: "VIP",
  });
  const list = await repositories.categories.list({ organizationId: "org-1", eventId: "event-1" });

  assert.equal(first.slug, "vip");
  assert.equal(second.eventId, "event-2");
  assert.equal(list.length, 1);
});

test("enrollment update and cancel keep row history without touching workspace bootstrap", async () => {
  const client = createFakeClient([
    {
      data: {
        id: "enrollment-1",
        organization_id: "org-1",
        event_id: "event-1",
        category_id: "category-1",
        sector_id: "sector-1",
        name: "Leonardo Rodríguez",
        email: "leo@example.com",
        phone: "+59170000000",
        status: "active",
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "event-1",
        organization_id: "org-1",
        venue_id: "venue-1",
        name: "Conference",
        status: "published",
        start_at: "2026-08-26",
        end_at: null,
        timezone: "America/La_Paz",
        venue: "Main",
        capacity: 100,
        enabled_modules: [],
        operational_model: "accreditation",
        admission_methods: [],
        resource_types: [],
        icon: null,
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "category-1",
        organization_id: "org-1",
        event_id: "event-1",
        slug: "vip",
        name: "VIP",
        description: null,
        color: null,
        sort_order: 0,
        is_active: true,
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "sector-1",
        venue_id: "venue-1",
        name: "Main Auditorium",
        description: null,
        capacity: 100,
        display_order: 0,
        status: "active",
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "enrollment-1",
        organization_id: "org-1",
        event_id: "event-1",
        category_id: "category-1",
        sector_id: "sector-1",
        name: "Leonardo Rodríguez Updated",
        email: "leo@example.com",
        phone: "+59170000000",
        status: "active",
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:15:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "enrollment-1",
        organization_id: "org-1",
        event_id: "event-1",
        category_id: "category-1",
        sector_id: "sector-1",
        name: "Leonardo Rodríguez Updated",
        email: "leo@example.com",
        phone: "+59170000000",
        status: "active",
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:15:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "enrollment-1",
        organization_id: "org-1",
        event_id: "event-1",
        category_id: "category-1",
        sector_id: "sector-1",
        name: "Leonardo Rodríguez Updated",
        email: "leo@example.com",
        phone: "+59170000000",
        status: "cancelled",
        metadata: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:20:00.000Z",
        deleted_at: null,
      },
    },
  ]);

  const repositories = createSupabaseAccreditationRepositories(client as never);
  const updated = await repositories.enrollments.update("enrollment-1", { name: "Leonardo Rodríguez Updated" });
  const cancelled = await repositories.enrollments.cancel("enrollment-1");

  assert.equal(updated.name, "Leonardo Rodríguez Updated");
  assert.equal(cancelled.status, "cancelled");
});
