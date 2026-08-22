import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardSnapshot, resolveGuestCheckInEligibility } from "../features/check-in/domain/check-in-domain";
import type { Event as PlatformEvent } from "../features/domain/types";
import type { ReservationRecord } from "../features/reservations/types";
import type { Guest } from "../features/check-in/types";

function buildGuest(overrides: Partial<Guest>): Guest {
  return {
    id: "guest-1",
    guestName: "Invitado",
    reservationName: "Mesa 1",
    reservationCode: "RES-001",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento E2E",
    tableName: "Mesa 1",
    eventStatus: "En curso",
    invitationSequence: "01",
    invitationCode: "INV-001",
    carnet: "1234567",
    whatsapp: "70000000",
    deliveryStatus: "Enviada",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    qrStatus: "Válido",
    deliveryHistory: [],
    operatorActivity: [],
    qrToken: "qr_1",
    ...overrides,
  };
}

function buildReservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: "reservation-1",
    code: "RES-001",
    name: "Reserva E2E",
    eventId: "event-1",
    eventName: "Evento E2E",
    date: "2026-08-17",
    time: "21:00",
    eventLayoutId: undefined,
    eventLayoutResourceId: undefined,
    resourceId: "table-1",
    resourceName: "Mesa 1",
    sectorId: undefined,
    sectorName: undefined,
    venueId: "venue-1",
    tableName: "Mesa 1",
    tableId: "table-1",
    tableCapacity: 4,
    holderName: "Titular",
    holderDocument: "1234567",
    holderWhatsapp: "70000000",
    holderEmail: "holder@example.com",
    reservationType: "Mesa",
    paymentStatus: "Pendiente",
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: ["guest-1"],
    status: "Confirmed",
    timeline: [],
    createdAt: "2026-08-17T19:00:00.000Z",
    updatedAt: "2026-08-17T19:00:00.000Z",
    ...overrides,
  };
}

test("dashboard pending guests follow the operational admission state instead of raw expected minus checked-in", () => {
  const currentEvent = {
    id: "event-1",
    name: "Evento E2E",
    status: "live",
    startAt: "2026-08-17 21:00",
    venue: "Sala Principal",
    eventType: "nightlife",
  } as PlatformEvent;

  const snapshot = buildDashboardSnapshot(currentEvent, [
    buildGuest({
      id: "guest-entered",
      guestName: "Ingresado",
      admissionStatus: "Ingresó",
      reservationStatus: "Checked In",
      checkInTime: "19:04",
      qrStatus: "Usado",
    }),
    buildGuest({
      id: "guest-pending",
      guestName: "Pendiente",
      admissionStatus: "Pendiente",
    }),
    buildGuest({
      id: "guest-cancelled",
      guestName: "Anulado",
      admissionStatus: "Anulada",
      reservationStatus: "Cancelled",
    }),
  ], []);

  assert.equal(snapshot.currentEvent.pending, 1);
  assert.equal(snapshot.currentEventSummary.pending, 1);
  assert.equal(snapshot.summaryMetrics.find((item) => item.label === "Ingresados")?.value, "1");
});

test("la reserva cancelada bloquea el ingreso incluso con QR y estado previos válidos", () => {
  const guest = buildGuest({
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    qrStatus: "Válido",
  });
  const eligibility = resolveGuestCheckInEligibility(guest, buildReservation({ status: "Cancelled" }));

  assert.equal(eligibility.canEnter, false);
  assert.equal(eligibility.label, "No puede entrar");
  assert.equal(eligibility.detail, "La reserva fue cancelada.");
});

test("un invitado anulado también queda bloqueado por elegibilidad", () => {
  const guest = buildGuest({
    admissionStatus: "Anulada",
    reservationStatus: "Cancelled",
    qrStatus: "Anulado",
  });
  const eligibility = resolveGuestCheckInEligibility(guest, buildReservation());

  assert.equal(eligibility.canEnter, false);
  assert.equal(eligibility.label, "No puede entrar");
  assert.equal(eligibility.detail, "El acceso está bloqueado o anulado.");
});
