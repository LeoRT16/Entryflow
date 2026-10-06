import assert from "node:assert/strict";
import test from "node:test";

import { buildGuestInvitationDesign } from "../features/access/domain/whatsapp-reservation-invitations";
import { createAccessGrantToken } from "../features/access/domain/access-ledger";

const event = { name: "Evento", startAt: "2026-10-06T20:00:00.000Z", timezone: "America/La_Paz" };

test("invitation design preserves hydrated canonical grant credentials", () => {
  const invitation = buildGuestInvitationDesign({
    guest: {
      id: "guest-1",
      reservationId: "reservation-1",
      eventId: "event-1",
      guestName: "Guest",
      reservationName: "Reservation",
      reservationCode: "RES-1",
      seat: undefined,
      tableName: undefined,
      invitationCode: "RES-1-01",
      accessCode: "canonical-code",
      qrToken: "canonical-qr",
    },
    currentEvent: event,
  });

  assert.equal(invitation.uniqueCode, "canonical-code");
  assert.equal(invitation.qrValue, "canonical-qr");
});

test("invitation design uses deterministic QR only when no grant credential is hydrated", () => {
  const guest = {
    id: "guest-1",
    reservationId: "reservation-1",
    eventId: "event-1",
    guestName: "Guest",
    reservationName: "Reservation",
    reservationCode: "RES-1",
    seat: undefined,
    tableName: undefined,
    invitationCode: "RES-1-01",
    accessCode: undefined,
    qrToken: undefined,
  };
  const invitation = buildGuestInvitationDesign({ guest, currentEvent: event });

  assert.equal(invitation.qrValue, createAccessGrantToken({
    guestId: guest.id,
    reservationId: guest.reservationId,
    eventId: guest.eventId,
    code: guest.invitationCode,
  }));
});
