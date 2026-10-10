import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildReservationFlowTotals } from "../features/reservations/components/reservation-flow";
import {
  buildReservationSummary,
  describeReservationSubmissionError,
  prependUniqueById,
  resolvePersistedReservationTableId,
} from "../features/reservations/domain/reservation-domain";
import { mapReservationRowToDomain, mapReservationToRow } from "../lib/supabase/mappers";
import { buildEventReport } from "../features/reporting/domain/event-report";

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
    expectedGuests: 45,
    eventCapacity: 200,
  });

  assert.equal(totals.occupancyPercent, 22.5);
  assert.equal(totals.checkedInGuests, 13);
  assert.equal(totals.pendingGuests, 12);
  assert.equal(totals.capacityRemaining, 155);
});

test("reservation flow uses zero-safe event capacity", () => {
  const totals = buildReservationFlowTotals({ checkedInGuests: 0, pendingGuests: 2, expectedGuests: 2, eventCapacity: 0 });
  assert.equal(totals.occupancyPercent, 0);
  assert.equal(totals.capacityRemaining, 0);
});

test("reservation summaries hide cancelled guests operationally but retain them in timeline history", () => {
  const reservation = {
    id: "reservation-1",
    code: "RES-1",
    name: "Cortesía Prensa",
    eventId: "event-1",
    eventName: "Evento",
    date: "2026-09-02",
    time: "20:00",
    tableName: "",
    tableCapacity: 0,
    holderName: "",
    holderDocument: "",
    holderWhatsapp: "",
    holderEmail: "",
    reservationType: "Cortesía" as const,
    paymentStatus: "Pendiente" as const,
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: ["active", "cancelled"],
    status: "Confirmed" as const,
    timeline: [],
    createdAt: "2026-09-02T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
  };
  const guest = (id: string, admissionStatus: string, reservationStatus: string) => ({
    id,
    guestName: id,
    reservationId: reservation.id,
    reservationName: reservation.name,
    reservationCode: reservation.code,
    eventId: reservation.eventId,
    eventName: reservation.eventName,
    invitationSequence: "01",
    invitationCode: `RES-1-${id}`,
    carnet: "1",
    whatsapp: "70000000",
    deliveryStatus: "Enviada",
    admissionStatus,
    reservationStatus,
    deliveryHistory: [],
    operatorActivity: [],
    qrStatus: "Válido",
  }) as never;
  const summary = buildReservationSummary(
    reservation,
    [guest("active", "Pendiente", "Confirmed"), guest("cancelled", "Anulada", "Cancelled")],
    [],
  );

  assert.deepEqual(summary.guests.map((item) => item.id), ["active"]);
  assert.equal(summary.metrics.guestCount, 1);
  assert.equal(summary.metrics.pendingGuests, 1);
  assert.equal(summary.metrics.cancelledGuests, 1);
  assert.equal(summary.timeline.some((item) => item.detail.includes("cancelled")), true);
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
  assert.match(source, /resolveReservationWizardResourceOptions/);
  assert.match(source, /venueSectors\[0\]\?\.id \?\? null/);
  assert.doesNotMatch(source, /reservationGuestPresets/);
});

test("reservation wizard fail closed when the venue cannot be proven", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-flow.tsx", import.meta.url), "utf8");

  assert.match(source, /const venue = currentVenue \?\? null;/);
  assert.match(source, /const venueSectors = currentVenueSectors;/);
  assert.match(source, /const venueResources = currentVenueResources;/);
  assert.match(source, /const currentVenueId = venue\?\.id \?\? "";/);
  assert.doesNotMatch(source, /resources\.filter\(\(resource\) => !venue \|\| resource\.venueId === venue\.id\)/);
  assert.doesNotMatch(source, /sectors\.filter\(\(sector\) => !venue \|\| sector\.venueId === venue\.id\)/);
});

test("reservation editing preserves historical commercial snapshots and clears them for courtesy", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const updateBlock = extractBlock(source, "const updateReservation = useCallback(", "  const appendReservationGuests = useCallback(");

  assert.match(updateBlock, /commercialSnapshot:\s*input\.reservationType === "Cortesía" \? undefined : reservation\.commercialSnapshot/);
});

test("reservation append and edit reject incomplete identities instead of inventing placeholders", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const flowSource = readFileSync(new URL("../features/reservations/components/reservation-flow.tsx", import.meta.url), "utf8");
  assert.match(source, /guestInputs\.some\(\(guest\) => !guest\.guestName\.trim\(\) \|\| !guest\.carnet\.trim\(\)\)/);
  assert.match(source, /if \(!guestInput\.guestName\.trim\(\) \|\| !guestInput\.carnet\.trim\(\)\)/);
  assert.doesNotMatch(flowSource, /guestName: guest\.name\.trim\(\) \|\| "Invitado"/);
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

test("reservation edit keeps the canonical reservation when the selected resource changes", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-flow.tsx", import.meta.url), "utf8");
  const editBlock = extractBlock(source, "const completeEditedReservation = async", "  const completeAppendReservation = async");

  assert.match(editBlock, /const existingReservation = editingReservation \?\? selectedActiveReservation;/);
  assert.match(editBlock, /if \(!existingReservation\)/);
  assert.match(editBlock, /existingReservation\.reservationType === "Cortesía"/);
  assert.doesNotMatch(editBlock, /selectedActiveReservation\.reservationType === "Cortesía"/);
});

test("presale edit submits the hydrated reservation identity", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-flow.tsx", import.meta.url), "utf8");
  assert.match(source, /selectedActiveReservation=\{wizardMode === "edit" \? wizardReservation/);
  assert.match(source, /editHydratedRef\.current = null;\s*setIsEditHydrated\(false\);\s*suppressEditHydrationRef\.current = false;\s*setActiveReservationId\(reservationId\)/);
  const modalSource = readFileSync(new URL("../features/reservations/components/reservation-wizard-modal.tsx", import.meta.url), "utf8");
  assert.match(modalSource, /reservationId: selectedActiveReservation\?\.id \?\? ""/);
  assert.match(modalSource, /wizardMode === "edit" \? selectedActiveReservation\?\.code/);
});

test("reopening the same reservation starts a fresh hydration session without duplicating hydration", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-flow.tsx", import.meta.url), "utf8");
  const hydrationGuard = /if \(!editingReservation \|\| editHydratedRef\.current === editingReservationId\)/;
  const resetSession = /setEditingReservationId\(null\);\s*editHydratedRef\.current = null;/;
  const openSession = /editHydratedRef\.current = null;\s*setIsEditHydrated\(false\);\s*suppressEditHydrationRef\.current = false;\s*setActiveReservationId\(reservationId\);\s*setEditingReservationId\(reservationId\)/;

  assert.match(source, hydrationGuard);
  assert.match(source, resetSession);
  assert.match(source, openSession);
});

test("edit hydration renders a neutral pending state and removes wizard VIP/frequent controls", () => {
  const flowSource = readFileSync(new URL("../features/reservations/components/reservation-flow.tsx", import.meta.url), "utf8");
  const modalSource = readFileSync(new URL("../features/reservations/components/reservation-wizard-modal.tsx", import.meta.url), "utf8");

  assert.match(flowSource, /!isEditHydrated \|\| !editingReservation/);
  assert.match(flowSource, /Cargando reserva/);
  assert.doesNotMatch(modalSource, /Marca VIP|Cliente frecuente/);
  assert.match(modalSource, /vip: false,\s*frequent: false/);
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
test("reservation mapper normalizes persisted snake_case commercial snapshots", () => {
  const domain = mapReservationRowToDomain({
    id: "v2-reservation",
    code: "V2-01",
    name: "Mesa V2",
    event_id: "v2-event",
    event_name: "V2",
    date: "2026-10-15",
    time: "20:00",
    event_layout_id: null,
    event_layout_resource_id: null,
    resource_id: "resource-a",
    table_name: "Mesa A",
    table_id: "resource-a",
    table_capacity: 5,
    holder_name: "Holder",
    holder_document: "DOC",
    holder_whatsapp: "70000000",
    holder_email: "",
    reservation_type: "Mesa",
    reference: null,
    payment_status: "Pagado",
    amount: "400",
    advance: "0",
    commercial_snapshot: { amount: "400", currency: "BOB", unit_price: "400", access_count: 3, benefits: null } as never,
    notes: "",
    guest_ids: [],
    status: "Confirmed",
    timeline: [],
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
    deleted_at: null,
  } as never);
  assert.equal(domain.commercialSnapshot?.reservationPrice, 400);
  assert.equal(domain.commercialSnapshot?.unitPrice, 400);
  assert.equal(domain.commercialSnapshot?.includedAccesses, 3);
  assert.equal(domain.commercialSnapshot?.currency, "BOB");
  assert.deepEqual(domain.commercialSnapshot?.benefits, []);
});
