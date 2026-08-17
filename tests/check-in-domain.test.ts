import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardSnapshot } from "../features/check-in/domain/check-in-domain";
import type { Event as PlatformEvent } from "../features/domain/types";
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
