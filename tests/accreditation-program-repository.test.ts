import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseAccreditationProgramRepositories } from "@/repositories/supabase-accreditation-program-repositories";

type QueueItem = { data?: unknown; error?: { message: string; code?: string } | null };

function createFakeClient(queue: QueueItem[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  type FakeBuilder = {
    select(columns?: string): FakeBuilder;
    eq(column: string, value: unknown): FakeBuilder;
    is(column: string, value: null): FakeBuilder;
    order(column: string, options?: { ascending?: boolean }): FakeBuilder;
    insert(payload: unknown): FakeBuilder;
    update(payload: unknown): FakeBuilder;
    upsert(payload: unknown, options?: { onConflict?: string }): FakeBuilder;
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

test("session creation is event scoped and avoids Boliche tables", async () => {
  const client = createFakeClient([
    {
      data: { id: "event-1", organization_id: "org-1", event_type: "conference", deleted_at: null },
    },
    {
      data: {
        id: "session-1",
        organization_id: "org-1",
        event_id: "event-1",
        title: "Keynote",
        description: null,
        session_type: "keynote",
        starts_at: "2026-09-01T10:00:00.000Z",
        ends_at: "2026-09-01T11:00:00.000Z",
        room: "Main hall",
        capacity: 120,
        metadata: null,
        status: "active",
        cancelled_at: null,
        created_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:00:00.000Z",
      },
    },
  ]);

  const repositories = createSupabaseAccreditationProgramRepositories(client as never);
  const session = await repositories.create({
    organizationId: "org-1",
    eventId: "event-1",
    title: "Keynote",
    description: null,
    sessionType: "keynote",
    startsAt: "2026-09-01T10:00:00.000Z",
    endsAt: "2026-09-01T11:00:00.000Z",
    room: "Main hall",
    capacity: 120,
    metadata: { speaker: "Ada" },
  });

  assert.equal(session.id, "session-1");
  assert.equal(session.sessionType, "keynote");
  assert.ok(client.calls.some((call) => call.table === "accreditation_program_sessions" && call.op === "insert"));
  assert.equal(client.calls.some((call) => call.table === "reservations"), false);
  assert.equal(client.calls.some((call) => call.table === "guests"), false);
});

test("session update and cancel preserve history with deterministic ordering", async () => {
  const client = createFakeClient([
    {
      data: {
        id: "session-1",
        organization_id: "org-1",
        event_id: "event-1",
        title: "Keynote",
        description: null,
        session_type: "keynote",
        starts_at: "2026-09-01T10:00:00.000Z",
        ends_at: "2026-09-01T11:00:00.000Z",
        room: null,
        capacity: null,
        metadata: null,
        status: "active",
        cancelled_at: null,
        created_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:00:00.000Z",
      },
    },
    {
      data: { id: "event-1", organization_id: "org-1", event_type: "conference", deleted_at: null },
    },
    {
      data: {
        id: "session-1",
        organization_id: "org-1",
        event_id: "event-1",
        title: "Keynote Updated",
        description: null,
        session_type: "panel",
        starts_at: "2026-09-01T10:00:00.000Z",
        ends_at: "2026-09-01T11:30:00.000Z",
        room: "Main hall",
        capacity: 150,
        metadata: null,
        status: "active",
        cancelled_at: null,
        created_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:20:00.000Z",
      },
    },
    {
      data: {
        id: "session-1",
        organization_id: "org-1",
        event_id: "event-1",
        title: "Keynote Updated",
        description: null,
        session_type: "panel",
        starts_at: "2026-09-01T10:00:00.000Z",
        ends_at: "2026-09-01T11:30:00.000Z",
        room: "Main hall",
        capacity: 150,
        metadata: null,
        status: "cancelled",
        cancelled_at: "2026-08-27T00:30:00.000Z",
        created_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:30:00.000Z",
      },
    },
    {
      data: {
        id: "session-1",
        organization_id: "org-1",
        event_id: "event-1",
        title: "Keynote Updated",
        description: null,
        session_type: "panel",
        starts_at: "2026-09-01T10:00:00.000Z",
        ends_at: "2026-09-01T11:30:00.000Z",
        room: "Main hall",
        capacity: 150,
        metadata: null,
        status: "cancelled",
        cancelled_at: "2026-08-27T00:30:00.000Z",
        created_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:30:00.000Z",
      },
    },
  ]);

  const repositories = createSupabaseAccreditationProgramRepositories(client as never);
  const updated = await repositories.update("session-1", {
    title: "Keynote Updated",
    description: null,
    sessionType: "panel",
    startsAt: "2026-09-01T10:00:00.000Z",
    endsAt: "2026-09-01T11:30:00.000Z",
    room: "Main hall",
    capacity: 150,
  });
  const cancelled = await repositories.cancel("session-1");

  assert.equal(updated.title, "Keynote Updated");
  assert.equal(cancelled.status, "cancelled");
  assert.ok(client.calls.some((call) => call.table === "accreditation_program_sessions" && call.op.startsWith("upsert:")));
});

test("session list scopes by organization and event", async () => {
  const client = createFakeClient([
    {
      data: [
        {
          id: "session-b",
          organization_id: "org-1",
          event_id: "event-1",
          title: "Panel",
          description: null,
          session_type: "panel",
          starts_at: "2026-09-01T12:00:00.000Z",
          ends_at: "2026-09-01T13:00:00.000Z",
          room: null,
          capacity: null,
          metadata: null,
          status: "active",
          cancelled_at: null,
          created_at: "2026-08-27T00:00:00.000Z",
          updated_at: "2026-08-27T00:00:00.000Z",
        },
        {
          id: "session-a",
          organization_id: "org-1",
          event_id: "event-1",
          title: "Keynote",
          description: null,
          session_type: "keynote",
          starts_at: "2026-09-01T10:00:00.000Z",
          ends_at: "2026-09-01T11:00:00.000Z",
          room: null,
          capacity: null,
          metadata: null,
          status: "active",
          cancelled_at: null,
          created_at: "2026-08-27T00:00:00.000Z",
          updated_at: "2026-08-27T00:00:00.000Z",
        },
      ],
    },
  ]);

  const repositories = createSupabaseAccreditationProgramRepositories(client as never);
  const list = await repositories.list({ organizationId: "org-1", eventId: "event-1" });

  assert.equal(list[0]?.id, "session-a");
  assert.equal(list[1]?.id, "session-b");
  assert.ok(client.calls.some((call) => call.table === "accreditation_program_sessions" && call.op === "eq:organization_id"));
  assert.ok(client.calls.some((call) => call.table === "accreditation_program_sessions" && call.op === "eq:event_id"));
});
