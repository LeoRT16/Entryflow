import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canHardDeleteGuest,
  canHardDeleteReservation,
  getReservationGuestActionVisibility,
  summarizeReservationWhatsAppBatchResults,
} from "../features/reservations/components/reservation-operations-board";

const guest = {
  id: "guest-1",
  guestName: "Invitado",
  invitationCode: "INV-1",
  invitationSequence: "01",
  admissionStatus: "Ingresó",
  reservationStatus: "Cancelled",
  deliveryStatus: "Enviada",
  canConfirm: true,
  canCancel: true,
  canCheckIn: true,
  canRevert: true,
  canRemove: true,
} as const;

test("terminal reservations hide all guest mutation affordances", () => {
  const visibility = getReservationGuestActionVisibility("Cancelled", guest);

  assert.equal(visibility.terminal, true);
  assert.equal(visibility.showConfirm, false);
  assert.equal(visibility.showCheckIn, false);
  assert.equal(visibility.showRevert, false);
  assert.equal(visibility.showCancel, false);
  assert.equal(visibility.showRemove, false);
});

test("non-terminal reservations preserve guest mutation affordances", () => {
  const visibility = getReservationGuestActionVisibility("Pending", {
    ...guest,
    reservationStatus: "Pending",
    admissionStatus: "Pendiente",
    canConfirm: true,
    canCancel: true,
    canCheckIn: true,
    canRevert: false,
    canRemove: true,
  });

  assert.equal(visibility.terminal, false);
  assert.equal(visibility.showConfirm, true);
  assert.equal(visibility.showCheckIn, true);
  assert.equal(visibility.showRevert, false);
  assert.equal(visibility.showCancel, true);
  assert.equal(visibility.showRemove, true);
});

test("terminal event context hides guest mutation affordances even for pending reservations", () => {
  const visibility = getReservationGuestActionVisibility("Pending", {
    ...guest,
    reservationStatus: "Pending",
    admissionStatus: "Pendiente",
    canConfirm: true,
    canCancel: true,
    canCheckIn: true,
    canRevert: true,
    canRemove: true,
  }, true);

  assert.equal(visibility.terminal, true);
  assert.equal(visibility.showConfirm, false);
  assert.equal(visibility.showCheckIn, false);
  assert.equal(visibility.showRevert, false);
  assert.equal(visibility.showCancel, false);
  assert.equal(visibility.showRemove, false);
});

test("guest hard delete only stays available before WhatsApp or check-in activity exists", () => {
  assert.equal(canHardDeleteGuest({ admissionStatus: "Pendiente", deliveryStatus: "Pendiente de envío" }), true);
  assert.equal(canHardDeleteGuest({ admissionStatus: "Pendiente", deliveryStatus: "Enviada" }), false);
  assert.equal(canHardDeleteGuest({ admissionStatus: "Ingresó", deliveryStatus: "Pendiente de envío" }), false);
});

test("reservation hard delete is reserved for empty reservations", () => {
  assert.equal(canHardDeleteReservation({ guests: [] }), true);
  assert.equal(canHardDeleteReservation({ guests: [{ id: "guest-1" }] as never }), false);
});

test("reservation operations board exposes edit and delete actions for active reservations", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");

  assert.match(source, /Registrar ingreso/);
  assert.match(source, /Enviar invitaciones/);
  assert.match(source, /Reenviar invitaciones/);
  assert.match(source, /Invitaciones ya aceptadas por WhatsApp/);
  assert.match(source, /Más acciones del invitado/);
  assert.match(source, /Editar/);
  assert.match(source, /Confirmar/);
  assert.match(source, /Revertir ingreso/);
  assert.match(source, /Cancelar invitado/);
  assert.match(source, /Eliminar/);
  assert.match(source, /Cancelar reserva/);
  assert.match(source, /Último envío/);
  assert.match(source, /aceptadas por WhatsApp/);
  assert.match(source, /flex flex-col gap-3 md:flex-row md:items-start md:justify-between/);
  assert.match(source, /hasReservationGuests/);
  assert.match(source, /canIssueWhatsAppInvitations && hasReservationGuests/);
  assert.match(source, /sendReservationWhatsAppInvitation/);
  assert.match(source, /confirm\(\{\s*title:\s*"Eliminar reserva"/);
  assert.match(source, /onEditReservation/);
  assert.match(source, /onDeleteReservation/);
  assert.doesNotMatch(source, /bulkPreviewGuestId/);
  assert.doesNotMatch(source, /exportInvitationRef/);
  assert.doesNotMatch(source, /waitForInvitationFrame/);
});

test("reservation batch accounting counts provider acceptance as accepted even when tracking persistence warns", () => {
  const summary = summarizeReservationWhatsAppBatchResults(
    [
      {
        guestId: "guest-1",
        guestName: "Guest 1",
        status: "accepted",
        providerAccepted: true,
        trackingPersisted: false,
        warning: "Seguimiento no persistido",
        detail: "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.",
        isRetry: false,
      },
      {
        guestId: "guest-2",
        guestName: "Guest 2",
        status: "failed",
        providerAccepted: false,
        trackingPersisted: false,
        detail: "No se pudo completar el envío.",
        isRetry: true,
      },
    ],
    0,
  );

  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.results.filter((item) => item.providerAccepted).length, 1);
  assert.equal(summary.results.filter((item) => !item.providerAccepted).length, 1);
});
