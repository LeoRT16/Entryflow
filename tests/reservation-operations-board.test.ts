import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getReservationGuestActionVisibility } from "../features/reservations/components/reservation-operations-board";

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

test("reservation operations board exposes edit and delete actions for active reservations", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");

  assert.match(source, /Editar reserva/);
  assert.match(source, /Eliminar reserva/);
  assert.match(source, /confirm\(\{\s*title:\s*"Eliminar reserva"/);
  assert.match(source, /onEditReservation/);
  assert.match(source, /onDeleteReservation/);
});
