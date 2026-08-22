import assert from "node:assert/strict";
import test from "node:test";

import { buildAccessGrantFromGuest, getAccessGrantIdentity, getQrToken, getVisibleInvitationCode, resolveAccessGrantByQuery } from "../features/access/domain/access-ledger";
import { createTicketFromGuest, evaluateAdmission } from "../features/access/domain/access-domain";
import type { Guest } from "../features/check-in/types";
import type { Event } from "../features/domain/types";
import type { ReservationRecord } from "../features/reservations/types";

function buildGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    guestName: "Invitado Checkin Final",
    reservationName: "E2E checkin final Rivas",
    reservationCode: "RES-59B30752",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento E2E",
    accessGrantId: "grant-1",
    accessCode: "RES-59B30752-01",
    qrToken: "qr_1234567890abcdef",
    tableId: "table-2",
    tableName: "Mesa 2",
    eventStatus: "En curso",
    invitationSequence: "1 de 1",
    invitationCode: "RES-59B30752-01",
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
    code: "RES-59B30752",
    name: "E2E checkin final Rivas",
    eventId: "event-1",
    eventName: "Evento E2E",
    date: "2026-08-12",
    time: "22:00",
    eventLayoutId: undefined,
    eventLayoutResourceId: undefined,
    resourceId: "table-2",
    resourceName: "Mesa 2",
    sectorId: undefined,
    sectorName: undefined,
    venueId: "venue-1",
    tableName: "Mesa 2",
    tableId: "table-2",
    tableCapacity: 6,
    holderName: "Sofía Rivas",
    holderDocument: "1234567",
    holderWhatsapp: "+59170000001",
    holderEmail: "sofia@example.com",
    reservationType: "Mesa",
    paymentStatus: "Pagado",
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: ["guest-1"],
    status: "Confirmed",
    timeline: [],
    createdAt: "2026-08-12T17:00:00.000Z",
    updatedAt: "2026-08-12T17:00:00.000Z",
    ...overrides,
  };
}

test("accessGrantId, invitationCode and qrToken keep distinct roles", () => {
  const guest = buildGuest();
  const grant = buildAccessGrantFromGuest(guest, buildReservation());

  assert.equal(getAccessGrantIdentity(guest), "grant-1");
  assert.equal(getVisibleInvitationCode(guest), "RES-59B30752-01");
  assert.equal(getQrToken(guest), "qr_1234567890abcdef");
  assert.equal(grant.id, "grant-1");
  assert.equal(grant.code, "RES-59B30752-01");
  assert.equal(grant.qrToken, "qr_1234567890abcdef");
});

test("generated qrToken stays opaque and does not expose guest PII", () => {
  const guest = buildGuest({ qrToken: undefined, accessCode: undefined });
  const grant = buildAccessGrantFromGuest(guest, buildReservation());

  assert.match(grant.qrToken, /^qr_[0-9a-f]{16}$/i);
  assert.equal(grant.qrToken.includes(guest.guestName), false);
  assert.equal(grant.qrToken.includes(guest.carnet), false);
  assert.equal(grant.qrToken.includes(guest.whatsapp), false);
  assert.equal(grant.qrToken.includes(guest.invitationCode), false);
});

test("qrToken and invitationCode resolve the same guest and access grant", () => {
  const guest = buildGuest({ qrToken: undefined, accessCode: undefined });
  const reservation = buildReservation();
  const event = { id: guest.eventId } as Event;
  const grant = buildAccessGrantFromGuest(guest, reservation);

  const qrResolved = resolveAccessGrantByQuery({
    query: grant.qrToken,
    guests: [guest],
    reservations: [reservation],
    event,
  });

  assert.equal(qrResolved.status, "found");
  assert.equal(qrResolved.guest?.id, guest.id);
  assert.equal(qrResolved.grant?.id, grant.id);
  assert.equal(qrResolved.grant?.qrToken, grant.qrToken);

  const codeResolved = resolveAccessGrantByQuery({
    query: guest.invitationCode,
    guests: [guest],
    reservations: [reservation],
    event,
  });

  assert.equal(codeResolved.status, "found");
  assert.equal(codeResolved.guest?.id, guest.id);
  assert.equal(codeResolved.grant?.id, grant.id);
});

test("qrToken resolution stays isolated to the active event", () => {
  const guest = buildGuest({ qrToken: undefined, accessCode: undefined });
  const reservation = buildReservation();
  const grant = buildAccessGrantFromGuest(guest, reservation);

  const wrongEvent = { id: "event-2" } as Event;
  const resolved = resolveAccessGrantByQuery({
    query: grant.qrToken,
    guests: [guest],
    reservations: [reservation],
    event: wrongEvent,
  });

  assert.equal(resolved.status, "not-found");
  assert.equal(resolved.grant, null);
  assert.equal(resolved.guest, null);
});

test("reassigned reservations invalidate the previous qr token and issue a new one", () => {
  const originalGuest = buildGuest({ qrToken: undefined, accessCode: undefined });
  const originalReservation = buildReservation();
  const originalGrant = buildAccessGrantFromGuest(originalGuest, originalReservation);

  const reassignedGuest = buildGuest({
    qrToken: undefined,
    accessCode: undefined,
    reservationId: "reservation-2",
    reservationCode: "RES-NEW-02",
    reservationName: "Nueva reserva E2E",
  });
  const reassignedReservation = buildReservation({
    id: "reservation-2",
    code: "RES-NEW-02",
    name: "Nueva reserva E2E",
    guestIds: [reassignedGuest.id],
  });
  const reassignedGrant = buildAccessGrantFromGuest(reassignedGuest, reassignedReservation);

  const oldTokenResolution = resolveAccessGrantByQuery({
    query: originalGrant.qrToken,
    guests: [reassignedGuest],
    reservations: [reassignedReservation],
    event: { id: reassignedGuest.eventId } as Event,
  });

  assert.equal(oldTokenResolution.status, "not-found");
  assert.equal(oldTokenResolution.grant, null);

  const newTokenResolution = resolveAccessGrantByQuery({
    query: reassignedGrant.qrToken,
    guests: [reassignedGuest],
    reservations: [reassignedReservation],
    event: { id: reassignedGuest.eventId } as Event,
  });

  assert.equal(newTokenResolution.status, "found");
  assert.equal(newTokenResolution.guest?.reservationId, "reservation-2");
  assert.equal(newTokenResolution.grant?.qrToken, reassignedGrant.qrToken);
});

test("cancelled reservations produce cancelled access grants and rejected admissions", () => {
  const guest = buildGuest({
    admissionStatus: "Pendiente",
    reservationStatus: "Cancelled",
    qrStatus: "Válido",
  });
  const reservation = buildReservation({
    status: "Cancelled",
  });
  const grant = buildAccessGrantFromGuest(guest, reservation);
  const ticket = createTicketFromGuest({
    id: grant.id,
    reservationId: grant.reservationId,
    guestId: grant.guestId,
    eventId: grant.eventId,
    code: grant.code,
    qrToken: grant.qrToken,
    accessType: "invitation",
    createdAt: "2026-08-12T17:00:00.000Z",
    status: "Cancelled",
  });

  const result = evaluateAdmission({
    ticket,
    query: grant.qrToken,
    method: "qr",
    operator: "Escáner",
    timestamp: "2026-08-12T22:00:00.000Z",
  });

  assert.equal(grant.status, "cancelled");
  assert.equal(result.result, "Cancelled");
  assert.equal(result.shouldPersist, true);
  assert.equal(result.note, "La invitación fue anulada.");
});
