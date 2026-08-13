import assert from "node:assert/strict";
import test from "node:test";

import type { AdmissionEngineOutput, Ticket } from "../features/access/domain/access-domain";
import {
  buildCompletedCheckInBundle,
  buildRejectedCheckInTimelineEntry,
  CheckInAlreadyConsumedError,
  isAccessGrantAlreadyConsumed,
  persistCompletedCheckInBundle,
} from "../features/check-in/domain/check-in-persistence";
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
      id: "b7c29b8a-f6e1-4e0f-9e8a-7efcb1c8d4d2",
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

function createUniqueAccessGrantViolationError() {
  return {
    code: "23505",
    constraint: "checkins_access_grant_id_active_unique",
    message: 'duplicate key value violates unique constraint "checkins_access_grant_id_active_unique"',
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
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
  assert.match(bundle.timelineEntry.id, uuidPattern);
});

test("duplicate access grants can be detected without mutating the admission state", () => {
  const consumed = new Set(["grant-1"]);

  assert.equal(isAccessGrantAlreadyConsumed("grant-1", consumed), true);
  assert.equal(isAccessGrantAlreadyConsumed("grant-2", consumed), false);
  assert.equal(isAccessGrantAlreadyConsumed(undefined, consumed), false);
});

test("rejected duplicate attempts build the canonical blocked timeline entry", () => {
  const guest = buildGuest({
    id: "guest-blocked",
    guestName: "Phase C Final E2E",
    reservationId: "reservation-blocked",
    eventId: "event-1",
    accessGrantId: "guest-blocked",
    checkInTime: "19:45",
    admissionStatus: "Ingresó",
    reservationStatus: "Checked In",
    qrStatus: "Usado",
  });

  const result = buildAdmissionResult({
    result: "Already Checked In",
    title: "Segundo intento bloqueado",
    reason: "El ticket ya fue consumido.",
    status: "Duplicate Attempt",
    tone: "warning",
    note: "Esta invitación ya fue utilizada.",
    audit: {
      ...buildAdmissionResult().audit,
      action: "QR validation",
      result: "Already Checked In",
      reason: "El ticket ya fue consumido.",
      ticketId: "ticket-blocked",
    },
  });

  const timelineEntry = buildRejectedCheckInTimelineEntry({
    guest,
    result,
    ticket: {
      ...buildTicket(),
      id: "ticket-blocked",
    },
  });

  assert.equal(timelineEntry.kind, "checkin.blocked");
  assert.equal(timelineEntry.title, "Segundo intento bloqueado");
  assert.equal(timelineEntry.description, "El ticket ya fue consumido.");
  assert.equal(timelineEntry.eventId, "event-1");
  assert.equal((timelineEntry.metadata as { result?: string }).result, "Already Checked In");
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
        async create() {
          calls.push("checkIns.create");
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

  assert.deepEqual(calls, ["checkIns.create", "guests.upsert.next", "timeline.upsert"]);
});

test("check-in persistence rejection rolls back before guest and timeline writes", async () => {
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
          async create() {
            calls.push("checkIns.create");
            throw new Error("check-in persistence failed");
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
    }),
    /check-in persistence failed/,
  );

  assert.deepEqual(calls, ["checkIns.create"]);
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
          async create() {
            calls.push("checkIns.create");
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

  assert.deepEqual(calls, ["checkIns.create", "guests.upsert.next", "checkIns.delete"]);
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
          async create() {
            calls.push("checkIns.create");
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

  assert.deepEqual(calls, ["checkIns.create", "guests.upsert.next", "timeline.upsert", "guests.upsert.original", "checkIns.delete"]);
});

test("concurrent check-ins for the same access grant let exactly one persist", async () => {
  const calls: string[] = [];
  const gate = deferred<void>();
  const seenAccessGrants = new Set<string>();

  const repositories = {
    checkIns: {
      async create(checkIn: { id: string; accessGrantId?: string | null }) {
        calls.push(`checkIns.create:${checkIn.id}`);
        await gate.promise;
        const accessGrantId = checkIn.accessGrantId ?? null;

        if (accessGrantId && seenAccessGrants.has(accessGrantId)) {
          throw createUniqueAccessGrantViolationError();
        }

        if (accessGrantId) {
          seenAccessGrants.add(accessGrantId);
        }

        return checkIn as never;
      },
      async delete() {
        calls.push("checkIns.delete");
        return true;
      },
    },
    guests: {
      async upsert(guest: Guest) {
        calls.push(guest.admissionStatus === "Ingresó" ? "guests.upsert.next" : "guests.upsert.original");
        return guest;
      },
    },
    timeline: {
      async upsert() {
        calls.push("timeline.upsert");
        return buildCompletedCheckInBundle({
          guest: buildGuest(),
          result: buildAdmissionResult(),
          ticket: buildTicket(),
          method: "QR",
          operator: "Escáner",
          timestampIso: "2026-08-11T22:52:00.000Z",
        }).timelineEntry;
      },
    },
  };

  const originalGuest = buildGuest({
    accessGrantId: "grant-atomic",
  });
  const firstBundle = buildCompletedCheckInBundle({
    guest: originalGuest,
    result: buildAdmissionResult(),
    ticket: buildTicket(),
    method: "QR",
    operator: "Escáner",
    timestampIso: "2026-08-11T22:52:00.000Z",
  });
  const secondBundle = buildCompletedCheckInBundle({
    guest: originalGuest,
    result: buildAdmissionResult(),
    ticket: buildTicket(),
    method: "QR",
    operator: "Escáner",
    timestampIso: "2026-08-11T22:52:00.000Z",
  });

  const first = persistCompletedCheckInBundle({
    repositories: repositories as never,
    originalGuest,
    bundle: firstBundle,
  });
  const second = persistCompletedCheckInBundle({
    repositories: repositories as never,
    originalGuest,
    bundle: secondBundle,
  });

  gate.resolve();

  const results = await Promise.allSettled([first, second]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  const rejection = results.find((item): item is PromiseRejectedResult => item.status === "rejected");
  assert.ok(rejection);
  assert.ok(rejection.reason instanceof CheckInAlreadyConsumedError);
  assert.equal(calls.filter((call) => call.startsWith("checkIns.create:")).length, 2);
  assert.equal(calls.filter((call) => call === "guests.upsert.next").length, 1);
  assert.equal(calls.filter((call) => call === "timeline.upsert").length, 1);
  assert.equal(calls.filter((call) => call === "checkIns.delete").length, 0);
});
