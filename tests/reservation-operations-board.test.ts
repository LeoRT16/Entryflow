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

test("courtesy actions use courtesy terminology without changing mesa terminology", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");

  assert.match(source, /activeReservation\.reservationType === "Cortesía" \? "\+ Agregar cortesía" : "\+ Agregar invitado"/);
  assert.match(source, /activeReservation\.reservationType === "Cortesía" \? "Agregar cortesía" : "Agregar invitado"/);
  assert.match(source, /placeholder=\{activeReservation\.reservationType === "Cortesía" \? "Nombre de la persona" : "Nombre del invitado"\}/);
});

test("courtesy inline inputs keep entered values and placeholders legible", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");

  assert.match(source, /text-slate-100 outline-none transition placeholder:text-slate-400 placeholder:opacity-100/);
  assert.match(source, /focus:border-cyan-300\/70 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-400\/20/);
  assert.doesNotMatch(source, /disabled=.*input/);
});

test("courtesy inline form gives fields usable desktop widths without changing mesa layout", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");

  assert.match(source, /activeReservation\.reservationType === "Cortesía"\s*\n\s*\? "grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-12"/);
  assert.match(source, /activeReservation\.reservationType === "Cortesía" \? "xl:col-span-5" : ""/);
  assert.match(source, /activeReservation\.reservationType === "Cortesía" \? "xl:col-span-5" : "xl:col-span-1"/);
  assert.match(source, /min-w-0 w-full/);
  assert.doesNotMatch(source, /min-w-\[(14|13|10|8)rem\]/);
  assert.match(source, /xl:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(0,0\.85fr\)_minmax\(0,0\.95fr\)_auto\]/);
});

test("courtesy copy distinguishes emitted access counts from people while preserving mesa and presale copy", () => {
  const boardSource = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");
  const wizardSource = readFileSync(new URL("../features/reservations/components/reservation-wizard-modal.tsx", import.meta.url), "utf8");

  assert.match(boardSource, /reservation\.reservationType === "Cortesía" \? "Cortesías" : "Invitados"/);
  assert.match(boardSource, /activeReservation\.reservationType === "Cortesía" \? "Personas" : "Invitados"/);
  assert.match(wizardSource, /isCourtesy \? "Personas" : "Invitados"/);
  assert.match(wizardSource, /isCourtesy \? `Persona \$\{index \+ 1\}` : index === 0 \? "Titular" : `Invitado \$\{index \+ 1\}`/);
  assert.match(wizardSource, /step\.step === 3[\s\S]*title: "Personas"/);
  assert.match(wizardSource, /step\.step === 2[\s\S]*title: "Referencia"/);
  assert.match(wizardSource, /isPresale \|\| isCourtesy \? "Agregar persona" : "Agregar invitado"/);
  assert.match(wizardSource, /isPresale \? "Accesos" : isCourtesy \? "Personas" : "Invitados"/);
  assert.match(wizardSource, /isCourtesy \? "Personas" : "Invitados"/);
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
