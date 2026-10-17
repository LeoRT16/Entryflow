import assert from "node:assert/strict";
import test from "node:test";

import { resolveManualCheckInGuest } from "../features/check-in/domain/check-in-domain";
import type { Guest } from "../features/check-in/types";

const selectedGuest = {
  id: "guest-selected",
  eventId: "event-current",
  guestName: "Alejandro Vargas",
  reservationId: "reservation-1",
  reservationCode: "RES-05532071",
  reservationName: "Mesa 1",
  invitationCode: "RES-05532071-01",
  carnet: "8000001",
  admissionStatus: "Pendiente",
  reservationStatus: "Confirmed",
  qrStatus: "Válido",
} as Guest;

test("manual admission keeps the explicitly selected result when the text search is ambiguous", () => {
  const similarlyNamedGuest = { ...selectedGuest, id: "guest-other", carnet: "8000002" };

  assert.equal(
    resolveManualCheckInGuest({
      guestId: selectedGuest.id,
      eventId: "event-current",
      guests: [selectedGuest, similarlyNamedGuest],
    }),
    selectedGuest,
  );
});

test("manual admission rejects a stale or cross-event selected identity", () => {
  assert.equal(resolveManualCheckInGuest({ guestId: selectedGuest.id, eventId: "event-other", guests: [selectedGuest] }), null);
  assert.equal(resolveManualCheckInGuest({ guestId: "unknown", eventId: "event-current", guests: [selectedGuest] }), null);
});
