import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCheckInAttemptTimelineEvent,
  buildTimelineEvents,
  buildTimelineQuickReadSummary,
  formatTimelineDisplayTime,
  getSecondaryTimelineSectionGridClass,
  mergeTimelineEvents,
  refreshTimelineWorkspace,
} from "../features/timeline/domain/timeline-domain";
import type { CheckIn, CheckInAttempt, Guest } from "../features/check-in/types";
import type { ReservationRecord } from "../features/reservations/types";
import type { TimelineEvent } from "../features/timeline/types";

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
  assert.equal(checkInEvent?.metadata?.guestCarnet, "9988776");
  assert.equal(checkInEvent?.metadata?.method, "QR");
});

test("timeline quick read prioritizes action, target, actor and role", () => {
  const quickRead = buildTimelineQuickReadSummary({
    id: "timeline-1",
    eventId: "event-1",
    timestamp: "19:04",
    kind: "checkin.success",
    icon: "checkin",
    tone: "success",
    title: "Check-in exitoso",
    description: "Ingreso registrado para Carlos Méndez.",
    actor: "Test Door",
    actorRole: "Puerta",
    context: "prueba E2E Rota Carlota",
    target: "Carlos Méndez",
    guestName: "Carlos Méndez",
    reservationName: "Mesa 3 · Sofía teste prev1 Rivas",
    reservationCode: "RES-A0547003",
    tableName: "Mesa 3",
    metadata: {
      guestCarnet: "9988776",
      method: "QR",
    },
  });

  assert.equal(quickRead.action, "Check-in exitoso");
  assert.equal(quickRead.target, "Carlos Méndez");
  assert.equal(quickRead.actorLine, "Test Door · Puerta");
  assert.equal(quickRead.context, "prueba E2E Rota Carlota");
  assert.equal(quickRead.guestLine, "Carlos Méndez\nCarnet · 9988776");
  assert.equal(quickRead.reservationLine, "Mesa 3\nRES-A0547003");
  assert.equal(quickRead.operatorLine, "Test Door\nPuerta · QR");
  assert.equal(quickRead.timestamp, "19:04");
});

test("timeline quick read exposes a courtesy reason only when metadata contains one", () => {
  const event = {
    id: "courtesy-event",
    timestamp: "21:05",
    kind: "guest.added",
    icon: "guest",
    tone: "info",
    title: "Se agregó cortesía",
    description: "Ana se agregó a la cortesía.",
    guestName: "Ana",
    metadata: { guestCarnet: "123", reason: "Prensa", reference: "Evento aliado" },
  } satisfies TimelineEvent;

  assert.equal(buildTimelineQuickReadSummary(event).reason, "Prensa");
  assert.equal(buildTimelineQuickReadSummary({ ...event, metadata: {} }).reason, "");
});

test("timeline quick read resolves guest identity from metadata when guestName is missing", () => {
  const quickRead = buildTimelineQuickReadSummary({
    id: "timeline-cancelled",
    eventId: "event-1",
    timestamp: "19:17",
    kind: "checkin.invalid",
    icon: "alert",
    tone: "danger",
    title: "Acceso cancelado",
    description: "La reserva fue cancelada.",
    guestId: "guest-1",
    reservationId: "reservation-1",
    reservationName: "Mesa 1 · Reserva cancelada",
    reservationCode: "RES-CANCEL-1",
    target: "Andrea Pérez",
    actor: "Recepción",
    actorRole: "Puerta",
    context: "Evento E2E",
    metadata: {
      guestName: "Andrea Pérez",
      guestCarnet: "9988776",
    },
  });

  assert.equal(quickRead.guestLine, "Andrea Pérez\nCarnet · 9988776");
  assert.equal(quickRead.operatorLine, "Recepción\nPuerta");
  assert.equal(quickRead.reservationLine, "Mesa 1 · Reserva cancelada\nRES-CANCEL-1");
});

test("historical incomplete timeline entries degrade without leaking reservation labels into guest", () => {
  const quickRead = buildTimelineQuickReadSummary({
    id: "timeline-2",
    eventId: "event-1",
    timestamp: "2026-08-16T19:04:00.000Z",
    kind: "checkin.invalid",
    icon: "alert",
    tone: "danger",
    title: "Ingreso rechazado",
    description: "El acceso no coincide con una invitación activa.",
    context: "prueba E2E Rota Carlota",
    target: "Mesa 5 · WhatsApp Delivery E2E",
    reservationName: "Mesa 5 · WhatsApp Delivery E2E",
    reservationCode: "RES-CB498660",
    tableName: "Mesa 5",
  });

  assert.equal(quickRead.guestLine, "");
  assert.equal(quickRead.reservationLine, "Mesa 5\nRES-CB498660");
  assert.equal(quickRead.target, "Mesa 5 · WhatsApp Delivery E2E");
});

test("timeline latest event renders as a compact local clock label", () => {
  assert.equal(formatTimelineDisplayTime("07:16"), "07:16");
  assert.equal(formatTimelineDisplayTime("2026-08-17T15:33:19.003Z"), "11:33");
});

test("secondary timeline sections expand to full width when only one exists", () => {
  assert.equal(getSecondaryTimelineSectionGridClass(1), "grid gap-4");
  assert.equal(getSecondaryTimelineSectionGridClass(2), "grid gap-4 xl:grid-cols-2");
});

test("timeline mount refresh delegates to the canonical workspace reload", async () => {
  let calls = 0;

  await refreshTimelineWorkspace(async () => {
    calls += 1;
  });

  assert.equal(calls, 1);
});

test("persisted and synthetic success events for the same check-in merge to one operative card", () => {
  const persistedSuccess: TimelineEvent = {
    id: "timeline-success-1",
    eventId: "event-1",
    guestId: "guest-1",
    reservationId: "reservation-1",
    createdAt: "2026-08-17T16:04:05.650Z",
    timestamp: "2026-08-17T16:04:05.170Z",
    kind: "checkin.success",
    icon: "checkin",
    tone: "success",
    title: "Check-in exitoso",
    description: "QR validado correctamente.",
    metadata: {
      guestId: "guest-1",
      reservationId: "reservation-1",
    },
  } as TimelineEvent;

  const syntheticSuccess: TimelineEvent = {
    id: "checkin-checkin-1",
    eventId: "event-1",
    guestId: "guest-1",
    reservationId: "reservation-1",
    createdAt: "2026-08-17T16:04:05.172Z",
    timestamp: "16:04",
    kind: "checkin.success",
    icon: "checkin",
    tone: "success",
    title: "Check-in exitoso",
    description: "marce llaco validó su ingreso con QR.",
    metadata: {
      guestId: "guest-1",
      reservationId: "reservation-1",
      checkInId: "checkin-1",
    },
  } as TimelineEvent;

  const blockedAttempt: TimelineEvent = {
    id: "attempt-1",
    eventId: "event-1",
    guestId: "guest-1",
    reservationId: "reservation-1",
    createdAt: "2026-08-17T16:05:00.000Z",
    timestamp: "16:05",
    kind: "checkin.blocked",
    icon: "alert",
    tone: "warning",
    title: "Segundo intento bloqueado",
    description: "Esta invitación ya fue utilizada.",
    metadata: {
      guestId: "guest-1",
      reservationId: "reservation-1",
    },
  } as TimelineEvent;

  const merged = mergeTimelineEvents([persistedSuccess], [syntheticSuccess, blockedAttempt]);

  assert.equal(merged.filter((event) => event.kind === "checkin.success").length, 1);
  assert.equal(merged.filter((event) => event.kind === "checkin.blocked").length, 1);
  assert.equal(merged[0]?.id, "attempt-1");
});
