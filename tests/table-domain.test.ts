import assert from "node:assert/strict";
import test from "node:test";

import { buildTableSummary, getPrimaryActiveTableReservation } from "../features/tables/domain/table-domain";
import type { ReservationRecord } from "../features/reservations/types";
import type { TableRecord } from "../features/tables/types";

function buildTable(overrides: Partial<TableRecord> = {}): TableRecord {
  return {
    id: overrides.id ?? "table-1",
    venueId: overrides.venueId ?? "venue-1",
    sectorId: overrides.sectorId ?? "sector-1",
    type: overrides.type ?? "table",
    name: overrides.name ?? "Mesa 4",
    capacity: overrides.capacity ?? 6,
    status: overrides.status ?? "Available",
    order: overrides.order ?? 1,
    notes: overrides.notes ?? undefined,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? "2026-08-14T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-14T10:00:00.000Z",
    eventId: overrides.eventId ?? "event-current",
    eventLayoutId: overrides.eventLayoutId ?? undefined,
    eventLayoutResourceId: overrides.eventLayoutResourceId ?? undefined,
    location: overrides.location ?? "Sector A",
    reservationIds: overrides.reservationIds ?? [],
    guestIds: overrides.guestIds ?? [],
    closed: overrides.closed ?? false,
  };
}

function buildReservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: overrides.id ?? "reservation-1",
    code: overrides.code ?? "RES-0001",
    name: overrides.name ?? "Mesa 4 · Reserva",
    eventId: overrides.eventId ?? "event-current",
    eventName: overrides.eventName ?? "Evento actual",
    date: overrides.date ?? "2026-08-14",
    time: overrides.time ?? "22:00",
    tableName: overrides.tableName ?? "Mesa 4",
    tableId: overrides.tableId ?? "table-1",
    tableCapacity: overrides.tableCapacity ?? 6,
    holderName: overrides.holderName ?? "Titular",
    holderDocument: overrides.holderDocument ?? "DOC-1",
    holderWhatsapp: overrides.holderWhatsapp ?? "+59170000000",
    holderEmail: overrides.holderEmail ?? "holder@example.com",
    reservationType: overrides.reservationType ?? "Mesa",
    paymentStatus: overrides.paymentStatus ?? "Pendiente",
    amount: overrides.amount ?? "0",
    advance: overrides.advance ?? "0",
    notes: overrides.notes ?? "",
    guestIds: overrides.guestIds ?? [],
    status: overrides.status ?? "Confirmed",
    timeline: overrides.timeline ?? [],
    createdAt: overrides.createdAt ?? "2026-08-14T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-14T10:30:00.000Z",
    resourceId: overrides.resourceId ?? overrides.tableId ?? "table-1",
    sectorId: overrides.sectorId ?? "sector-1",
    venueId: overrides.venueId ?? "venue-1",
  };
}

test("current-event reservations occupy the table and are returned as primary active reservation", () => {
  const table = buildTable();
  const currentReservation = buildReservation({
    id: "reservation-current",
    eventId: "event-current",
    updatedAt: "2026-08-14T11:00:00.000Z",
  });
  const historicalReservation = buildReservation({
    id: "reservation-historical",
    eventId: "event-historical",
    updatedAt: "2026-08-14T12:00:00.000Z",
  });

  const summary = buildTableSummary(table, [currentReservation, historicalReservation], [], [], "event-current");
  const primaryReservation = getPrimaryActiveTableReservation(table, [currentReservation, historicalReservation], "event-current");

  assert.deepEqual(summary.reservationIds, ["reservation-current"]);
  assert.equal(summary.status, "Reserved");
  assert.equal(primaryReservation?.id, "reservation-current");
});

test("historical active reservations do not occupy the current event table", () => {
  const table = buildTable();
  const historicalReservation = buildReservation({
    id: "reservation-historical",
    eventId: "event-historical",
  });

  const summary = buildTableSummary(table, [historicalReservation], [], [], "event-current");
  const primaryReservation = getPrimaryActiveTableReservation(table, [historicalReservation], "event-current");

  assert.deepEqual(summary.reservationIds, []);
  assert.equal(summary.status, "Available");
  assert.equal(primaryReservation, null);
});

test("cancelled reservations do not count as active table occupancy", () => {
  const table = buildTable();
  const cancelledReservation = buildReservation({
    id: "reservation-cancelled",
    status: "Cancelled",
    updatedAt: "2026-08-14T13:00:00.000Z",
  });

  const summary = buildTableSummary(table, [cancelledReservation], [], [], "event-current");
  const primaryReservation = getPrimaryActiveTableReservation(table, [cancelledReservation], "event-current");

  assert.deepEqual(summary.reservationIds, ["reservation-cancelled"]);
  assert.equal(summary.metrics.activeReservations, 0);
  assert.equal(summary.status, "Available");
  assert.equal(primaryReservation, null);
});

test("duplicate active reservations remain visible only for the current event and the newest one wins deterministically", () => {
  const table = buildTable();
  const olderReservation = buildReservation({
    id: "reservation-older",
    eventId: "event-current",
    updatedAt: "2026-08-14T10:00:00.000Z",
  });
  const newerReservation = buildReservation({
    id: "reservation-newer",
    eventId: "event-current",
    updatedAt: "2026-08-14T12:00:00.000Z",
  });
  const historicalReservation = buildReservation({
    id: "reservation-historical",
    eventId: "event-historical",
    updatedAt: "2026-08-14T13:00:00.000Z",
  });

  const summary = buildTableSummary(table, [olderReservation, newerReservation, historicalReservation], [], [], "event-current");
  const primaryReservation = getPrimaryActiveTableReservation(table, [olderReservation, newerReservation, historicalReservation], "event-current");

  assert.equal(summary.reservationIds.length, 2);
  assert.equal(primaryReservation?.id, "reservation-newer");
});

test("resourceId-only reservations still count toward occupancy after reload reconstruction", () => {
  const table = buildTable({
    capacity: 10,
    id: "resource-1",
  });
  const reservation = buildReservation({
    id: "reservation-resource-only",
    tableId: undefined,
    resourceId: "resource-1",
    tableCapacity: 10,
    status: "Confirmed",
  });
  const guests = [
    { id: "guest-1", reservationId: "reservation-resource-only", guestName: "A", admissionStatus: "Pendiente" },
    { id: "guest-2", reservationId: "reservation-resource-only", guestName: "B", admissionStatus: "Pendiente" },
    { id: "guest-3", reservationId: "reservation-resource-only", guestName: "C", admissionStatus: "Pendiente" },
    { id: "guest-4", reservationId: "reservation-resource-only", guestName: "D", admissionStatus: "Pendiente" },
    { id: "guest-5", reservationId: "reservation-resource-only", guestName: "E", admissionStatus: "Pendiente" },
  ] as never;

  const summary = buildTableSummary(table, [reservation], guests, [], "event-current");

  assert.equal(summary.metrics.assignedGuests, 5);
  assert.equal(summary.metrics.capacityRemaining, 5);
  assert.equal(summary.metrics.occupancyPercent, 50);
  assert.equal(summary.status, "Partially Occupied");
});

test("extra wristband Guests remain linked but do not consume physical table capacity", () => {
  const table = buildTable({ capacity: 5 });
  const reservation = buildReservation({ guestIds: ["base-1", "extra-1", "extra-2"] });
  const guests = [
    { id: "base-1", reservationId: reservation.id, guestName: "Base", admissionStatus: "Pendiente" },
    { id: "extra-1", reservationId: reservation.id, extraWristbandSaleId: "sale-1", guestName: "Extra 1", admissionStatus: "Pendiente" },
    { id: "extra-2", reservationId: reservation.id, extraWristbandSaleId: "sale-1", guestName: "Extra 2", admissionStatus: "Pendiente" },
  ] as never;

  const summary = buildTableSummary(table, [reservation], guests, [], "event-current");

  assert.equal(summary.guests.length, 3);
  assert.equal(summary.metrics.assignedGuests, 1);
  assert.equal(summary.metrics.capacityRemaining, 4);
});
