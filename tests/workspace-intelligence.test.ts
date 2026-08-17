import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkspacePrioritySnapshot } from "../domain/workspace-priority";
import { buildWorkspaceIntelligence } from "../domain/workspace-intelligence";
import type { CheckIn, CheckInAttempt, Guest } from "../features/check-in/types";
import type { Event as PlatformEvent } from "../features/domain/types";
import type { ReservationRecord } from "../features/reservations/types";
import type { TableSummary } from "../features/tables/types";
import type { TimelineEvent } from "../features/timeline/types";
import { compareTimelineEventsDescending } from "../features/timeline/domain/timeline-domain";

function buildGuest(index: number): Guest {
  return {
    id: `guest-${index}`,
    guestName: `Invitado ${index}`,
    reservationName: "Mesa 1 · Evento E2E",
    reservationCode: "RES-001",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento E2E",
    eventStatus: "En curso",
    invitationSequence: `${index}`,
    invitationCode: `INV-${String(index).padStart(3, "0")}`,
    carnet: `1000${index}`,
    whatsapp: "70000000",
    deliveryStatus: "Enviada",
    admissionStatus: "Ingresó",
    reservationStatus: "Checked In",
    qrStatus: "Usado",
    checkInTime: `19:${String(index).padStart(2, "0")}`,
    deliveryHistory: [],
    operatorActivity: [],
    qrToken: `qr-${index}`,
  };
}

function buildCheckIn(index: number, method: "QR" | "Manual"): CheckIn {
  return {
    id: `checkin-${index}`,
    guestId: `guest-${index}`,
    reservationId: "reservation-1",
    eventId: "event-1",
    accessGrantId: `grant-${index}`,
    accessType: method === "Manual" ? "manual" : "qr",
    method,
    checkedInAt: `19:${String(index).padStart(2, "0")}`,
    operator: method === "Manual" ? "Recepción" : "Escáner",
    gate: "Principal",
    notes: undefined,
    auditTrail: [],
    reentryAllowed: true,
    maxEntries: 1,
    attemptCount: 1,
    lastAttemptAt: `19:${String(index).padStart(2, "0")}`,
    status: "Checked In",
    source: method === "Manual" ? "manual" : "qr",
  };
}

function buildBlockedAttempt(index: number): CheckInAttempt {
  return {
    id: `attempt-${index}`,
    eventId: "event-1",
    query: `INV-${String(index).padStart(3, "0")}`,
    method: "QR",
    timestamp: `19:${String(30 + index).padStart(2, "0")}`,
    result: "Usado",
    guestId: `guest-${index}`,
    guestName: `Invitado ${index}`,
    note: "Esta invitación ya fue utilizada.",
  };
}

function buildTimelineEvent(index: number, kind: TimelineEvent["kind"], tone: TimelineEvent["tone"]): TimelineEvent {
  return {
    id: `${kind}-${index}`,
    eventId: "event-1",
    kind,
    title: kind === "checkin.blocked" ? "Segundo intento bloqueado" : kind === "checkin.manual" ? "Check-in manual" : "Check-in exitoso",
    description: kind === "checkin.blocked" ? "Esta invitación ya fue utilizada." : "Ingreso registrado correctamente.",
    timestamp: `19:${String(40 + index).padStart(2, "0")}`,
    tone,
    icon: "checkin",
    actor: kind === "checkin.manual" ? "Recepción" : "Escáner",
    actorRole: kind === "checkin.manual" ? "Puerta" : "Puerta",
    context: "Evento E2E",
    target: `Invitado ${index}`,
    metadata: {},
  };
}

function buildHistoricalTimelineEvent(index: number): TimelineEvent {
  return {
    id: `history-${index}`,
    eventId: "event-1",
    createdAt: `2026-08-16T23:${String(index % 60).padStart(2, "0")}:00.000Z`,
    kind: "timeline.note",
    title: `Nota histórica ${index}`,
    description: "Seguimiento operativo persistido.",
    timestamp: `19:${String(index % 60).padStart(2, "0")}`,
    tone: "info",
    icon: "alert",
    actor: "Sistema",
    actorRole: "Operación",
    context: "Evento E2E",
    target: `Entrada ${index}`,
    metadata: {},
  };
}

test("workspace timeline rehydrates the newest persisted event even when timestamps mix formats", () => {
  const historicalEvents = Array.from({ length: 96 }, (_, index) => buildHistoricalTimelineEvent(index + 1));
  const newPersistedEvent: TimelineEvent = {
    id: "checkin-97",
    eventId: "event-1",
    createdAt: "2026-08-17T07:16:47.117Z",
    kind: "checkin.success",
    title: "Check-in exitoso",
    description: "Ingreso confirmado en puerta.",
    timestamp: "07:16",
    tone: "success",
    icon: "checkin",
    actor: "Recepción",
    actorRole: "Puerta",
    context: "Evento E2E",
    target: "Invitado 97",
    metadata: {},
  };

  const timelineEvents = [...historicalEvents, newPersistedEvent].sort(compareTimelineEventsDescending);
  const intelligence = buildWorkspaceIntelligence({
    event: {
      id: "event-1",
      name: "Evento E2E",
      status: "live",
      startAt: "2026-08-17 21:00",
      venue: "Sala Principal",
      eventType: "nightlife",
    } as PlatformEvent,
    events: [
      {
        id: "event-1",
        organizationId: "organization-1",
        name: "Evento E2E",
        eventType: "nightlife",
        status: "live",
        startAt: "2026-08-17 21:00",
        timezone: "America/La_Paz",
        venue: "Sala Principal",
        capacity: 100,
        enabledModules: [],
        operationalModel: "mixed",
        admissionMethods: [],
        resourceTypes: [],
      } as PlatformEvent,
    ],
    reservations: [],
    reservationSummaries: [],
    guests: [],
    tableSummaries: [],
    checkIns: [],
    attempts: [],
    timelineEvents,
  });
  const snapshot = buildWorkspacePrioritySnapshot(intelligence);

  assert.equal(intelligence.timeline.summary.total, 97);
  assert.equal(intelligence.timeline.summary.latest, newPersistedEvent.timestamp);
  assert.equal(snapshot.recentChanges.some((event) => event.id === newPersistedEvent.id), true);
  assert.equal(snapshot.recentChanges[0]?.id, newPersistedEvent.id);
});

test("workspace intelligence keeps ingresados canonical while the timeline stays historical", () => {
  const guests = Array.from({ length: 13 }, (_, index) => buildGuest(index + 1));
  const checkIns = [
    ...Array.from({ length: 12 }, (_, index) => buildCheckIn(index + 1, "QR")),
    buildCheckIn(13, "Manual"),
  ];
  const attempts = Array.from({ length: 13 }, (_, index) => buildBlockedAttempt(index + 1));
  const timelineEvents = [
    ...Array.from({ length: 12 }, (_, index) => buildTimelineEvent(index + 1, "checkin.success", "success")),
    buildTimelineEvent(13, "checkin.manual", "success"),
    ...Array.from({ length: 13 }, (_, index) => buildTimelineEvent(index + 14, "checkin.blocked", "warning")),
  ];

  const currentEvent = {
    id: "event-1",
    name: "Evento E2E",
    status: "live",
    startAt: "2026-08-17 21:00",
    venue: "Sala Principal",
    eventType: "nightlife",
  } as PlatformEvent;
  const reservation = {
    id: "reservation-1",
    code: "RES-001",
    name: "Mesa 1 · Evento E2E",
    eventId: "event-1",
    eventName: "Evento E2E",
    date: "2026-08-17",
    time: "21:00",
    tableName: "Mesa 1",
    tableId: "table-1",
    tableCapacity: 13,
    holderName: "Holder",
    holderDocument: "1234567",
    holderWhatsapp: "70000000",
    holderEmail: "holder@example.com",
    reservationType: "Mesa",
    paymentStatus: "Pagado",
    amount: "0",
    advance: "0",
    notes: "",
    guestIds: guests.map((guest) => guest.id),
    status: "Confirmed",
    timeline: [],
    createdAt: "2026-08-17T19:00:00.000Z",
    updatedAt: "2026-08-17T19:00:00.000Z",
  } as ReservationRecord;
  const table = {
    id: "table-1",
    name: "Mesa 1",
    reservationIds: ["reservation-1"],
    capacity: 13,
    status: "Available",
    metrics: {
      assignedGuests: 0,
      capacityRemaining: 13,
      occupancyPercent: 0,
    },
  } as TableSummary;

  const intelligence = buildWorkspaceIntelligence({
    event: currentEvent,
    events: [currentEvent],
    reservations: [reservation],
    reservationSummaries: [],
    guests,
    tableSummaries: [table],
    checkIns,
    attempts,
    timelineEvents,
  });

  assert.equal(intelligence.statistics.cards.checkedInGuests, 13);
  assert.equal(intelligence.timeline.summary.checkedIn, 13);
  assert.equal(intelligence.timeline.summary.total, 26);
  assert.equal(intelligence.timeline.events.length, 26);
});
