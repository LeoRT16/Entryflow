import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildReservationFlowTotals } from "../features/reservations/components/reservation-flow";
import {
  describeReservationSubmissionError,
  prependUniqueById,
  resolvePersistedReservationTableId,
} from "../features/reservations/domain/reservation-domain";
import { mapReservationRowToDomain, mapReservationToRow } from "../lib/supabase/mappers";

function extractBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  if (start === -1 || end === -1) {
    throw new Error(`Unable to extract block between ${startMarker} and ${endMarker}.`);
  }

  return source.slice(start, end);
}

test("reservation flow metrics reuse the canonical occupancy snapshot", () => {
  const totals = buildReservationFlowTotals({
    checkedInGuests: 13,
    pendingGuests: 12,
    capacityRemaining: 34,
    occupancyPercent: 39,
  });

  assert.equal(totals.occupancyPercent, 39);
  assert.equal(totals.checkedInGuests, 13);
  assert.equal(totals.pendingGuests, 12);
  assert.equal(totals.capacityRemaining, 34);
});

test("reservation flow wires edit, delete, and cancel callbacks into the operations board", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-flow.tsx", import.meta.url), "utf8");

  assert.match(source, /deleteReservation=\{store\.deleteReservation\}/);
  assert.match(source, /onEditReservation=\{handleEditReservation\}/);
  assert.match(source, /onDeleteReservation=\{handleDeleteReservation\}/);
  assert.match(source, /onCancelReservation=\{handleCancelReservation\}/);
  assert.match(source, /reservationGuests=\{reservationGuests\}/);
  assert.match(source, /canIssueWhatsAppInvitations=\{can\("access\.issue"\)\}/);
  assert.match(source, /setGuestsState=\{store\.setGuestsState\}/);
  assert.match(source, /const options = venueResources\.map\(/);
  assert.match(source, /return preferEventLayoutMappedResources\(options\);/);
  assert.doesNotMatch(source, /reservationGuestPresets/);
});

test("reservation persistence resolves the selected resource through the current event table context", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const createReservationBlock = extractBlock(source, "const createReservation = useCallback(", "  const updateGuestWhatsApp = useCallback(");
  const updateReservationBlock = extractBlock(source, "const updateReservation = useCallback(", "  const appendReservationGuests = useCallback(");

  assert.match(createReservationBlock, /findTableInCurrentEventContext\(currentEventTables, selectedResource\.id, currentEvent, currentVenue\)/);
  assert.match(updateReservationBlock, /findTableInCurrentEventContext\(currentEventTables, selectedResource\.id, currentEvent, currentVenue\)/);
  assert.match(createReservationBlock, /resourceId:\s*selectedTable\.id,/);
  assert.match(updateReservationBlock, /resourceId:\s*selectedTable\.id,/);
  assert.match(createReservationBlock, /tableId = persistedTableId/);
  assert.match(updateReservationBlock, /tableId: persistedTableId,/);
  assert.doesNotMatch(createReservationBlock, /findTableInCurrentEventContext\(tables, selectedResource\.id, currentEvent, currentVenue\)/);
  assert.doesNotMatch(updateReservationBlock, /findTableInCurrentEventContext\(tables, selectedResource\.id, currentEvent, currentVenue\)/);
});

test("reservation persistence only writes a table id when a matching persisted table exists", () => {
  assert.equal(resolvePersistedReservationTableId([], "mesa-1"), undefined);
  assert.equal(resolvePersistedReservationTableId([{ id: "mesa-1" }], "mesa-1"), "mesa-1");
  assert.equal(resolvePersistedReservationTableId([{ id: "mesa-2" }], "mesa-1"), undefined);
});

test("reservation rows preserve the canonical resource id even when table id is null", () => {
  const row = mapReservationToRow({
    id: "reservation-1",
    code: "RES-1",
    name: "Mesa 1 · Leo Toro",
    eventId: "event-1",
    eventName: "Evento 1",
    date: "2026-08-21",
    time: "21:00",
    tableName: "Mesa 1",
    tableId: null,
    tableCapacity: 10,
    holderName: "Leo Toro",
    holderDocument: "123",
    holderWhatsapp: "+59170000000",
    holderEmail: "leo@example.com",
    reservationType: "Mesa",
    paymentStatus: "Confirmada" as never,
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: ["guest-1", "guest-2"],
    status: "Confirmed",
    timeline: [],
    createdAt: "2026-08-21T21:00:00.000Z",
    updatedAt: "2026-08-21T21:00:00.000Z",
    resourceId: "resource-1",
    resourceName: "Mesa 1",
    eventLayoutId: "layout-1",
    eventLayoutResourceId: "event-layout-resource-1",
    sectorId: "sector-1",
    sectorName: "Sector 1",
    venueId: "venue-1",
  } as never);

  assert.equal(row.resource_id, "resource-1");
  assert.equal(row.table_id, null);
  assert.equal(Object.hasOwn(row, "resource_name"), false);

  const domain = mapReservationRowToDomain({
    ...row,
    created_at: "2026-08-21T21:00:00.000Z",
    updated_at: "2026-08-21T21:00:00.000Z",
    deleted_at: null,
  } as never);

  assert.equal(domain.resourceId, "resource-1");
  assert.equal(domain.tableId, undefined);
  assert.equal(domain.resourceName, "Mesa 1");
});

test("prependUniqueById replaces existing records instead of duplicating them after a refresh race", () => {
  const current = [
    { id: "reservation-1", name: "Original" },
    { id: "reservation-2", name: "Keep me" },
  ];

  const merged = prependUniqueById(current, [{ id: "reservation-1", name: "Saved" }]);

  assert.deepEqual(merged, [
    { id: "reservation-1", name: "Saved" },
    { id: "reservation-2", name: "Keep me" },
  ]);
  assert.equal(new Set(merged.map((item) => item.id)).size, merged.length);
});

test("reservation submission errors normalize empty objects into a human-readable message", () => {
  assert.equal(describeReservationSubmissionError({}, "No se pudo crear la reserva."), "No se pudo crear la reserva.");
  assert.equal(
    describeReservationSubmissionError({ code: "42501", message: "new row violates row-level security policy" }),
    "new row violates row-level security policy · code 42501",
  );
});
