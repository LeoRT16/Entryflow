import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mapReservationToRow } from "../lib/supabase/mappers";

test("reservation resource migration adds a nullable resource foreign key and scoped RLS checks", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260821000001_reservation_resource_relationship.sql", import.meta.url), "utf8");

  assert.match(sql, /alter table public\.reservations\s+add column if not exists resource_id uuid;/);
  assert.match(sql, /add constraint reservations_resource_id_fkey\s+foreign key \(resource_id\)\s+references public\.resources\(id\)\s+on delete set null;/);
  assert.match(sql, /create index if not exists reservations_resource_id_idx on public\.reservations \(resource_id\);/);
  assert.match(sql, /create or replace function public\.current_resource_ids\(\)/);
  assert.match(sql, /returns uuid\[\]/);
  assert.match(sql, /create or replace function public\.resource_belongs_to_event\(/);
  assert.match(sql, /reservation_resource_id is null/);
  assert.match(sql, /and r\.venue_id = e\.venue_id/);
  assert.match(sql, /drop policy if exists "Tenant-scoped reservation insert" on public\.reservations;/);
  assert.match(sql, /drop policy if exists "Tenant-scoped reservation update" on public\.reservations;/);
  assert.match(sql, /public\.resource_belongs_to_event\(reservations\.resource_id, reservations\.event_id\)/);
  assert.match(sql, /reservations\.table_id is null\s+or reservations\.table_id = any\(public\.current_table_ids\(\)\)/);
  assert.doesNotMatch(sql, /table_id\s*=\s*resource_id/);
});

test("reservation mapper only emits columns supported by the current reservations contract", () => {
  const row = mapReservationToRow({
    id: "reservation-1",
    code: "RES-1",
    name: "Mesa 1 · Leo Toro",
    eventId: "event-1",
    eventName: "Evento 1",
    date: "2026-08-21",
    time: "21:00",
    eventLayoutId: undefined,
    eventLayoutResourceId: undefined,
    resourceId: "resource-1",
    resourceName: "Mesa 1",
    sectorId: undefined,
    sectorName: undefined,
    venueId: "venue-1",
    tableName: "Mesa 1",
    tableId: undefined,
    tableCapacity: 10,
    holderName: "Leo Toro",
    holderDocument: "123",
    holderWhatsapp: "+59170000000",
    holderEmail: "leo@example.com",
    reservationType: "Mesa",
    paymentStatus: "Pagado",
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: [],
    status: "Confirmed",
    timeline: [],
    createdAt: "2026-08-21T21:00:00.000Z",
    updatedAt: "2026-08-21T21:00:00.000Z",
  });

  assert.equal(Object.hasOwn(row, "resource_name"), false);
  assert.equal(row.resource_id, "resource-1");
  assert.equal(row.table_name, "Mesa 1");
  assert.equal(row.table_id, null);
});
