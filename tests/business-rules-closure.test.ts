import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Guest } from "../features/check-in/types";
import { assertEventWriteOwnership, assertGuestInCurrentEvent, assertReservationInCurrentEvent, assertTableInCurrentEventContext, findTableInCurrentEventContext } from "../features/business-rules/domain/ownership-guards";
import type { Event as PlatformEvent, Venue } from "../features/domain/types";
import type { ReservationRecord } from "../features/reservations/types";
import type { TableRecord } from "../features/tables/types";

function buildEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return {
    id: "event-a",
    organizationId: "org-a",
    name: "Evento A",
    eventType: "nightlife",
    status: "published",
    startAt: "2026-08-21T21:00:00.000Z",
    timezone: "America/La_Paz",
    venue: "La Rota Carlota",
    capacity: 120,
    enabledModules: ["overview"],
    operationalModel: "general-admission",
    admissionMethods: ["qr"],
    resourceTypes: ["table"],
    venueId: "venue-a",
    ...overrides,
  } as PlatformEvent;
}

function buildVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "venue-a",
    organizationId: "org-a",
    name: "La Rota Carlota",
    status: "active",
    createdAt: "2026-08-21T19:00:00.000Z",
    updatedAt: "2026-08-21T19:00:00.000Z",
    ...overrides,
  } as Venue;
}

function buildTable(overrides: Partial<TableRecord> = {}): TableRecord {
  return {
    id: "table-a",
    name: "Mesa A",
    capacity: 8,
    location: "Principal",
    status: "Available",
    venueId: "venue-a",
    sectorId: "sector-a",
    type: "table",
    order: 1,
    notes: undefined,
    metadata: undefined,
    createdAt: "2026-08-21T19:00:00.000Z",
    updatedAt: "2026-08-21T19:00:00.000Z",
    eventId: "event-a",
    reservationIds: [],
    guestIds: [],
    closed: false,
    ...overrides,
  } as TableRecord;
}

function buildReservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: "reservation-a",
    code: "RES-001",
    name: "Reserva A",
    eventId: "event-a",
    eventName: "Evento A",
    date: "2026-08-21",
    time: "21:00",
    tableName: "Mesa A",
    tableId: "table-a",
    tableCapacity: 8,
    holderName: "Leonardo Rodríguez",
    holderDocument: "1234567",
    holderWhatsapp: "77777777",
    holderEmail: "leo@example.com",
    reservationType: "Mesa",
    paymentStatus: "Pagado",
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: [],
    status: "Confirmed",
    timeline: [],
    venueId: "venue-a",
    ...overrides,
  } as ReservationRecord;
}

function buildGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-a",
    guestName: "Leonardo Rodríguez",
    reservationName: "Reserva A",
    reservationCode: "RES-001",
    reservationId: "reservation-a",
    eventId: "event-a",
    eventName: "Evento A",
    tableId: "table-a",
    tableName: "Mesa A",
    eventStatus: "Próximo",
    invitationSequence: "1 de 1",
    invitationCode: "RES-001-01",
    carnet: "1234567",
    whatsapp: "77777777",
    deliveryStatus: "Enviada",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    deliveryHistory: [],
    operatorActivity: [],
    qrStatus: "Válido",
    ...overrides,
  } as Guest;
}

test("tenant ownership guards keep event, reservation, guest, and table writes scoped", () => {
  const currentEvent = buildEvent();
  const currentVenue = buildVenue();
  const otherVenue = buildVenue({ id: "venue-b", organizationId: "org-b", name: "Otro venue" });
  const currentTable = buildTable();
  const foreignTable = buildTable({ id: "table-b", venueId: "venue-b", eventId: "event-b", name: "Mesa B" });
  const currentReservation = buildReservation();
  const foreignReservation = buildReservation({ id: "reservation-b", eventId: "event-b", eventName: "Evento B", tableId: "table-b", tableName: "Mesa B", venueId: "venue-b" });
  const currentGuest = buildGuest();
  const foreignGuest = buildGuest({ id: "guest-b", reservationId: "reservation-b", eventId: "event-b", eventName: "Evento B", reservationName: "Reserva B", reservationCode: "RES-002" });

  assert.doesNotThrow(() => assertEventWriteOwnership(currentEvent, "org-a", [currentVenue, otherVenue]));
  assert.throws(() => assertEventWriteOwnership(buildEvent({ organizationId: "org-b" }), "org-a", [currentVenue, otherVenue]), /otra organización/);
  assert.throws(() => assertEventWriteOwnership(buildEvent({ venueId: "venue-b" }), "org-a", [currentVenue, otherVenue]), /venue seleccionado/);

  assert.equal(findTableInCurrentEventContext([currentTable], currentTable.id, currentEvent, currentVenue).id, currentTable.id);
  assert.doesNotThrow(() => assertTableInCurrentEventContext(currentTable, currentEvent, currentVenue));
  assert.throws(() => assertTableInCurrentEventContext(foreignTable, currentEvent, currentVenue), /mesa seleccionada/);

  assert.doesNotThrow(() => assertReservationInCurrentEvent(currentReservation, currentEvent));
  assert.throws(() => assertReservationInCurrentEvent(foreignReservation, currentEvent), /evento activo/);

  assert.doesNotThrow(() => assertGuestInCurrentEvent(currentGuest, currentEvent, [currentReservation]));
  assert.throws(() => assertGuestInCurrentEvent(foreignGuest, currentEvent, [currentReservation, foreignReservation]), /evento activo/);
});

test("business rules migration drops legacy access and creates tenant-scoped policies", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260821000000_business_rules_closure.sql", import.meta.url), "utf8");

  assert.match(sql, /create or replace function public\.current_venue_ids\(\)/);
  assert.match(sql, /create or replace function public\.current_event_ids\(\)/);
  assert.match(sql, /create or replace function public\.current_table_ids\(\)/);
  assert.match(sql, /returns text\[\]/);
  assert.match(sql, /create index if not exists reservations_event_id_idx on public\.reservations \(event_id\);/);
  assert.match(sql, /create index if not exists tables_event_id_idx on public\.tables \(event_id\);/);
  assert.match(sql, /drop policy if exists "Allow all access" on public\.events;/);
  assert.match(sql, /drop policy if exists "Allow all access" on public\.reservations;/);
  assert.match(sql, /create policy "Tenant-scoped reservation update"/);
  assert.match(sql, /create policy "Tenant-scoped guest update"/);
  assert.match(sql, /create policy "Tenant-scoped table update"/);
  assert.match(sql, /create policy "Tenant-scoped timeline_event delete"/);
  assert.doesNotMatch(sql, /reservations\.venue_id/);
  assert.doesNotMatch(sql, /tables\.venue_id/);
  assert.match(sql, /tables\.event_id = any\(public\.current_event_ids\(\)\)/);
  assert.match(sql, /reservations\.table_id = any\(public\.current_table_ids\(\)\)/);
});
