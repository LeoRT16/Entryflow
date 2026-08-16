import assert from "node:assert/strict";
import test from "node:test";

import { getQrToken } from "../features/access/domain/access-ledger";
import { buildGuestQuickReadSummary, resolveCheckInGuestByQuery } from "../features/check-in/domain/check-in-domain";
import type { Guest } from "../features/check-in/types";
import type { Event } from "../features/domain/types";
import type { ReservationRecord } from "../features/reservations/types";

function buildGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    guestName: "Invitado E2E",
    reservationName: "Reserva E2E",
    reservationCode: "RES-E2E-01",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento E2E",
    accessGrantId: "grant-1",
    accessCode: "RES-E2E-01-01",
    qrToken: "qr_62eb796d960ae427",
    tableId: "table-1",
    tableName: "Mesa 1",
    eventStatus: "En curso",
    invitationSequence: "1 de 1",
    invitationCode: "RES-E2E-01-01",
    carnet: "1234567",
    whatsapp: "+59170000001",
    deliveryStatus: "Enviada",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    deliveryHistory: [],
    operatorActivity: [],
    qrStatus: "Válido",
    ...overrides,
  };
}

function buildReservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: "reservation-1",
    code: "RES-E2E-01",
    name: "Reserva E2E",
    eventId: "event-1",
    eventName: "Evento E2E",
    date: "2026-08-16",
    time: "22:00",
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
    holderName: "Invitado E2E",
    holderDocument: "1234567",
    holderWhatsapp: "+59170000001",
    holderEmail: "guest@example.com",
    reservationType: "Mesa",
    paymentStatus: "Pagado",
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: ["guest-1"],
    status: "Confirmed",
    timeline: [],
    createdAt: "2026-08-16T21:00:00.000Z",
    updatedAt: "2026-08-16T21:00:00.000Z",
    ...overrides,
  };
}

test("QR válido resuelve una coincidencia y abre la validación", () => {
  const guest = buildGuest();
  const reservation = buildReservation();
  const event = { id: "event-1" } as Event;
  const qrToken = guest.qrToken ?? getQrToken(guest);

  const resolved = resolveCheckInGuestByQuery({
    query: qrToken,
    guests: [guest],
    reservations: [reservation],
    event,
  });

  assert.equal(resolved?.id, guest.id);
  assert.equal(qrToken, guest.qrToken ?? getQrToken(guest));
});

test("código humano y QR resuelven al mismo invitado", () => {
  const guest = buildGuest({ qrToken: undefined, accessCode: undefined });
  const reservation = buildReservation();
  const event = { id: "event-1" } as Event;
  const qrToken = getQrToken(guest);

  const qrResolved = resolveCheckInGuestByQuery({
    query: qrToken,
    guests: [guest],
    reservations: [reservation],
    event,
  });

  const codeResolved = resolveCheckInGuestByQuery({
    query: guest.invitationCode,
    guests: [guest],
    reservations: [reservation],
    event,
  });

  assert.equal(qrResolved?.id, guest.id);
  assert.equal(codeResolved?.id, guest.id);
});

test("la ficha rápida conserva identidad, carnet, reserva, mesa y estados operativos", () => {
  const guest = buildGuest({
    admissionStatus: "Ingresó",
    qrStatus: "Usado",
    tableName: "Mesa 5",
    checkInTime: "19:04",
  });

  const quickRead = buildGuestQuickReadSummary(guest);

  assert.equal(quickRead.name, "Invitado E2E");
  assert.equal(quickRead.carnet, "1234567");
  assert.equal(quickRead.reservation, "RES-E2E-01 · Reserva E2E");
  assert.equal(quickRead.space, "Mesa 5");
  assert.equal(quickRead.entryStatus, "Ingresó");
  assert.equal(quickRead.accessStatus, "Usado");
  assert.equal(quickRead.visibleCode, "RES-E2E-01-01");
});

test("un QR consumido sigue resolviendo la identidad del invitado", () => {
  const guest = buildGuest({
    admissionStatus: "Ingresó",
    qrStatus: "Usado",
    checkInTime: "19:04",
  });
  const reservation = buildReservation();
  const event = { id: "event-1" } as Event;
  const qrToken = guest.qrToken ?? getQrToken(guest);

  const resolved = resolveCheckInGuestByQuery({
    query: qrToken,
    guests: [guest],
    reservations: [reservation],
    event,
  });

  assert.equal(resolved?.id, guest.id);
  assert.equal(resolved?.guestName, guest.guestName);
});

test("la validación no se abre si el acceso es ambiguo", () => {
  const reservation = buildReservation();
  const guestA = buildGuest({ id: "guest-1", guestName: "Ana", invitationCode: "RES-E2E-01-01", qrToken: "qr_shared" });
  const guestB = buildGuest({ id: "guest-2", guestName: "Andrés", invitationCode: "RES-E2E-01-02", qrToken: "qr_shared" });
  const event = { id: "event-1" } as Event;

  const resolved = resolveCheckInGuestByQuery({
    query: "qr_shared",
    guests: [guestA, guestB],
    reservations: [reservation],
    event,
  });

  assert.equal(resolved, null);
});
