import assert from "node:assert/strict";
import test from "node:test";

import type { AdmissionEngineOutput, Ticket } from "../features/access/domain/access-domain";
import { buildCompletedCheckInBundle, isAccessGrantAlreadyConsumed, persistCompletedCheckInBundle } from "../features/check-in/domain/check-in-persistence";
import type { Guest } from "../features/check-in/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    guestName: "Leonardo Rodríguez",
    reservationName: "Reserva E2E",
    reservationCode: "RES-E2E-01",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Prueba E2E",
    invitationSequence: "01",
    invitationCode: "RES-E2E-01-01",
    carnet: "1234567",
    whatsapp: "77777777",
    deliveryStatus: "Pendiente de envío",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    qrStatus: "Válido",
    deliveryHistory: [],
    operatorActivity: [],
    accessCode: "RES-E2E-01-01",
    qrToken: "qr_test",
    ...overrides,
  } as Guest;
}

function buildAdmissionResult(overrides: Partial<AdmissionEngineOutput> = {}): AdmissionEngineOutput {
  return {
    result: "Valid",
    title: "Check-in exitoso",
    note: "Leonardo Rodríguez validó su ingreso con QR.",
    tone: "success",
    audit: {
      id: "audit-1",
      timestamp: "2026-08-11T22:52:00.000Z",
      action: "check-in",
      result: "Valid",
      reason: "Validación exitosa.",
      operator: "Escáner",
      ticketId: "ticket-1",
    },
    ticket: null,
    ...overrides,
  } as AdmissionEngineOutput;
}

function buildTicket(): Ticket {
  return {
    id: "ticket-1",
    code: "RES-E2E-01-01",
    qrToken: "qr_test",
    status: "Validated",
    createdAt: "2026-08-11T22:50:00.000Z",
    lastAction: "validated",
    accessType: "invitation",
    entryCount: 0,
    maxEntries: 1,
    reentryAllowed: true,
    attemptCount: 0,
    auditTrail: [],
    metadata: {},
  };
}

test("generated check-in id is a valid UUID", () => {
  const bundle = buildCompletedCheckInBundle({
    guest: buildGuest(),
    result: buildAdmissionResult(),
    ticket: buildTicket(),
    method: "QR",
    operator: "Escáner",
    timestampIso: "2026-08-11T22:52:00.000Z",
  });

  assert.match(bundle.checkIn.id, uuidPattern);
  assert.match(bundle.checkIn.auditTrail[0].id, uuidPattern);
});

test("duplicate access grants can be detected without mutating the admission state", () => {
  const consumed = new Set(["grant-1"]);

  assert.equal(isAccessGrantAlreadyConsumed("grant-1", consumed), true);
  assert.equal(isAccessGrantAlreadyConsumed("grant-2", consumed), false);
  assert.equal(isAccessGrantAlreadyConsumed(undefined, consumed), false);
});

test("successful check-in persistence writes one row per target table", async () => {
  const calls: string[] = [];
  const bundle = buildCompletedCheckInBundle({
    guest: buildGuest(),
    result: buildAdmissionResult(),
    ticket: buildTicket(),
    method: "QR",
    operator: "Escáner",
    timestampIso: "2026-08-11T22:52:00.000Z",
  });
  const originalGuest = buildGuest();

  await persistCompletedCheckInBundle({
    repositories: {
      checkIns: {
        async upsert() {
          calls.push("checkIns.upsert");
          return bundle.checkIn;
        },
        async delete() {
          calls.push("checkIns.delete");
          return true;
        },
      },
      guests: {
        async upsert(guest) {
          calls.push(guest.admissionStatus === "Ingresó" ? "guests.upsert.next" : "guests.upsert.original");
          return guest;
        },
      },
      timeline: {
        async upsert() {
          calls.push("timeline.upsert");
          return bundle.timelineEntry;
        },
      },
    },
    originalGuest,
    bundle,
  });

  assert.deepEqual(calls, ["checkIns.upsert", "guests.upsert.next", "timeline.upsert"]);
});

test("persistence rejection rolls back the admitted guest and check-in row", async () => {
  const calls: string[] = [];
  const bundle = buildCompletedCheckInBundle({
    guest: buildGuest(),
    result: buildAdmissionResult(),
    ticket: buildTicket(),
    method: "QR",
    operator: "Escáner",
    timestampIso: "2026-08-11T22:52:00.000Z",
  });
  const originalGuest = buildGuest();

  await assert.rejects(
    persistCompletedCheckInBundle({
      repositories: {
        checkIns: {
          async upsert() {
            calls.push("checkIns.upsert");
            return bundle.checkIn;
          },
          async delete() {
            calls.push("checkIns.delete");
            return true;
          },
        },
        guests: {
          async upsert(guest) {
            calls.push(guest.admissionStatus === "Ingresó" ? "guests.upsert.next" : "guests.upsert.original");
            if (guest.admissionStatus === "Ingresó") {
              throw new Error("guest persistence failed");
            }
            return guest;
          },
        },
        timeline: {
          async upsert() {
            calls.push("timeline.upsert");
            return bundle.timelineEntry;
          },
        },
      },
      originalGuest,
      bundle,
    }),
    /guest persistence failed/,
  );

  assert.deepEqual(calls, ["checkIns.upsert", "guests.upsert.next", "checkIns.delete"]);
});

test("timeline persistence rejection does not leave the guest admitted", async () => {
  const calls: string[] = [];
  const bundle = buildCompletedCheckInBundle({
    guest: buildGuest(),
    result: buildAdmissionResult(),
    ticket: buildTicket(),
    method: "QR",
    operator: "Escáner",
    timestampIso: "2026-08-11T22:52:00.000Z",
  });
  const originalGuest = buildGuest();

  await assert.rejects(
    persistCompletedCheckInBundle({
      repositories: {
        checkIns: {
          async upsert() {
            calls.push("checkIns.upsert");
            return bundle.checkIn;
          },
          async delete() {
            calls.push("checkIns.delete");
            return true;
          },
        },
        guests: {
          async upsert(guest) {
            calls.push(guest.admissionStatus === "Ingresó" ? "guests.upsert.next" : "guests.upsert.original");
            return guest;
          },
        },
        timeline: {
          async upsert() {
            calls.push("timeline.upsert");
            throw new Error("timeline persistence failed");
          },
        },
      },
      originalGuest,
      bundle,
    }),
    /timeline persistence failed/,
  );

  assert.deepEqual(calls, ["checkIns.upsert", "guests.upsert.next", "timeline.upsert", "guests.upsert.original", "checkIns.delete"]);
});
