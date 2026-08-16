import assert from "node:assert/strict";
import test from "node:test";

import { buildCheckInAttemptTimelineEvent, buildTimelineEvents } from "../features/timeline/domain/timeline-domain";
import type { CheckIn, CheckInAttempt, Guest } from "../features/check-in/types";
import type { ReservationRecord } from "../features/reservations/types";

function buildGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    guestName: "Carlos Méndez",
    reservationName: "Mesa 3 · Sofía teste prev1 Rivas",
    reservationCode: "RES-A0547003",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "prueba E2E Rota Carlota",
    invitationSequence: "3 de 5",
    invitationCode: "RES-A0547003-03",
    carnet: "9988776",
    whatsapp: "+591 70000003",
    deliveryStatus: "Enviada",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    qrStatus: "Válido",
    deliveryHistory: [],
    operatorActivity: [],
    ...overrides,
  } as Guest;
}

function buildReservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: "reservation-1",
    code: "RES-A0547003",
    name: "Mesa 3 · Sofía teste prev1 Rivas",
    eventId: "event-1",
    eventName: "prueba E2E Rota Carlota",
    date: "8 de agosto de 2026",
    time: "21:00",
    tableName: "Mesa 3",
    tableId: "table-1",
    tableCapacity: 6,
    holderName: "Sofía teste prev1 Rivas",
    holderDocument: "1234567",
    holderWhatsapp: "+591 70000003",
    holderEmail: "sofia@example.com",
    reservationType: "Mesa",
    paymentStatus: "Pagado",
    amount: "850",
    advance: "816",
    notes: "",
    guestIds: ["guest-1"],
    status: "Confirmed",
    timeline: [],
    createdAt: "2026-08-11T20:24:47.004Z",
    updatedAt: "2026-08-11T20:24:47.004Z",
    ...overrides,
  };
}

function buildActiveCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: "checkin-1",
    guestId: "guest-1",
    reservationId: "reservation-1",
    eventId: "event-1",
    accessGrantId: "guest-1",
    accessType: "qr",
    method: "QR",
    checkedInAt: "19:04",
    operator: "Escáner",
    gate: "Principal",
    notes: "QR validado correctamente.",
    auditTrail: [],
    reentryAllowed: true,
    maxEntries: 1,
    attemptCount: 1,
    lastAttemptAt: "19:04",
    status: "Checked In",
    source: "qr",
    ...overrides,
  } as CheckIn;
}

function buildBlockedAttempt(id: string, timestamp: string, note = "Esta invitación ya fue utilizada."): CheckInAttempt {
  return {
    id,
    eventId: "event-1",
    query: "RES-A0547003-03",
    method: "QR",
    timestamp,
    result: "Usado",
    guestId: "guest-1",
    guestName: "Carlos Méndez",
    note,
  };
}

test("blocked attempt timeline events keep the blocked trace contract", () => {
  const guest = buildGuest();
  const attempt = buildBlockedAttempt("attempt-1", "19:10");
  const event = buildCheckInAttemptTimelineEvent(guest, attempt);

  assert.ok(event);
  assert.equal(event?.kind, "checkin.blocked");
  assert.equal(event?.title, "Segundo intento bloqueado");
  assert.equal(event?.guestId, guest.id);
  assert.equal(event?.description, attempt.note);
  assert.equal(event?.metadata?.result, "Usado");
});

test("first use yields one success and blocked retries each add their own blocked trace", () => {
  const guest = buildGuest();
  const reservation = buildReservation();
  const checkIn = buildActiveCheckIn();

  const firstUse = buildTimelineEvents({
    eventId: guest.eventId,
    reservations: [reservation],
    guests: [guest],
    checkIns: [checkIn],
    attempts: [],
  });

  assert.equal(firstUse.filter((item) => item.kind === "checkin.success").length, 1);
  assert.equal(firstUse.filter((item) => item.kind === "checkin.blocked").length, 0);

  const secondUse = buildTimelineEvents({
    eventId: guest.eventId,
    reservations: [reservation],
    guests: [guest],
    checkIns: [checkIn],
    attempts: [buildBlockedAttempt("attempt-2", "19:10")],
  });

  assert.equal(secondUse.filter((item) => item.kind === "checkin.success").length, 1);
  assert.equal(secondUse.filter((item) => item.kind === "checkin.blocked").length, 1);

  const thirdUse = buildTimelineEvents({
    eventId: guest.eventId,
    reservations: [reservation],
    guests: [guest],
    checkIns: [checkIn],
    attempts: [buildBlockedAttempt("attempt-2", "19:10"), buildBlockedAttempt("attempt-3", "19:12")],
  });

  assert.equal(thirdUse.filter((item) => item.kind === "checkin.success").length, 1);
  assert.equal(thirdUse.filter((item) => item.kind === "checkin.blocked").length, 2);
});

test("timeline events preserve actor, context and target metadata", () => {
  const guest = buildGuest();
  const reservation = buildReservation({
    timeline: [
      {
        id: "timeline-1",
        time: "19:40",
        title: "Mesa asignada",
        detail: "Mesa 3 asignada a la reserva.",
        tone: "info",
        actor: "Ana Pérez",
        actorRole: "Owner",
        context: "Evento E2E",
        target: "Mesa 3",
      },
    ],
  });
  const checkIn = buildActiveCheckIn({
    actor: "Escáner Principal",
    actorRole: "Door",
    context: "Evento E2E",
    target: "Carlos Méndez",
  });

  const events = buildTimelineEvents({
    eventId: guest.eventId,
    reservations: [reservation],
    guests: [guest],
    checkIns: [checkIn],
    attempts: [],
  });

  const reservationEvent = events.find((item) => item.kind === "table.assigned");
  const checkInEvent = events.find((item) => item.kind === "checkin.success");

  assert.equal(reservationEvent?.actor, "Ana Pérez");
  assert.equal(reservationEvent?.actorRole, "Owner");
  assert.equal(reservationEvent?.context, "Evento E2E");
  assert.equal(reservationEvent?.target, "Mesa 3");
  assert.equal(checkInEvent?.actor, "Escáner Principal");
  assert.equal(checkInEvent?.actorRole, "Door");
  assert.equal(checkInEvent?.context, "Evento E2E");
  assert.equal(checkInEvent?.target, "Carlos Méndez");
});
