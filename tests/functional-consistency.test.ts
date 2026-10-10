import assert from "node:assert/strict";
import test from "node:test";

import { resolveGuestDeliveryStatus } from "../features/access/domain/whatsapp-delivery-tracking";
import { calculateTableAssignmentPercent } from "../features/operations/domain/operations-domain";
import { formatReservationStatus } from "../features/reservations/domain/reservation-domain";

test("QR generation without WhatsApp remains pending delivery", () => {
  assert.equal(resolveGuestDeliveryStatus({ whatsapp: "", deliveryStatus: "Enviada", deliveryHistory: [] }), "Pendiente de envío");
  assert.equal(resolveGuestDeliveryStatus({ whatsapp: "+59170000000", deliveryStatus: "Enviada", deliveryHistory: [] }), "Enviada");
});

test("historical provider evidence is preserved without a current phone", () => {
  assert.equal(resolveGuestDeliveryStatus({ whatsapp: "", deliveryStatus: "Enviada", deliveryHistory: [{ title: "Entregado" }] }), "Enviada");
  assert.equal(resolveGuestDeliveryStatus({ whatsapp: "", deliveryStatus: "Vista", deliveryHistory: [{ title: "Vista" }] }), "Vista");
});

test("table assignment remains based on eligible physical resources", () => {
  assert.equal(calculateTableAssignmentPercent(3, 1), 33);
  assert.equal(calculateTableAssignmentPercent(0, 1), 0);
  assert.equal(calculateTableAssignmentPercent(3, 3), 100);
});

test("reservation lifecycle presentation preserves admitted state", () => {
  assert.equal(formatReservationStatus("Checked In"), "Ingresada");
  assert.equal(formatReservationStatus("Confirmed"), "Confirmada");
});
