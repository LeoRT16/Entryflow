import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsAppSendAcceptedGuestUpdate,
  buildWhatsAppSendAcceptanceResponse,
  resolveWhatsAppTrackingPersistence,
} from "../features/access/domain/whatsapp-send-acceptance";
import type { GuestRecord } from "../features/customers/types";

function buildGuest(overrides: Partial<GuestRecord> = {}): GuestRecord {
  return {
    id: "guest-1",
    guestName: "Guest One",
    reservationName: "Mesa principal",
    reservationCode: "RES-001",
    eventName: "EntryFlow Summit",
    accessCode: "CODE-001",
    qrToken: "qr-001",
    eventStatus: "En curso",
    invitationSequence: "001",
    invitationCode: "INV-001",
    carnet: "1234567",
    whatsapp: "77374577",
    deliveryStatus: "Pendiente de envío",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    deliveryHistory: [],
    operatorActivity: [],
    ...overrides,
  } as GuestRecord;
}

test("accepted WhatsApp sends build a persisted success response", () => {
  const response = buildWhatsAppSendAcceptanceResponse(true);

  assert.deepEqual(response, {
    ok: true,
    providerAccepted: true,
    trackingPersisted: true,
    status: "accepted",
  });
});

test("accepted WhatsApp sends keep the guest state coherent when tracking persistence fails", () => {
  const guest = buildGuest();
  const updated = buildWhatsAppSendAcceptedGuestUpdate({
    guest,
    attemptNumber: 1,
    acceptedAt: "2026-08-20T01:02:03.000Z",
    messageId: "wamid.mock-1",
    trackingPersisted: false,
  });

  assert.equal(updated.deliveryStatus, "Enviada");
  assert.equal(updated.recentChange, true);
  assert.equal(updated.noInvitationSent, false);
  assert.equal(updated.whatsappDelivery?.currentStatus, "accepted");
  assert.equal(updated.whatsappDelivery?.messageId, "wamid.mock-1");
  assert.equal(updated.deliveryHistory.at(-1)?.detail, "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.");
});

test("accepted WhatsApp sends expose an explicit tracking failure response without provider failure semantics", () => {
  const response = buildWhatsAppSendAcceptanceResponse(false);

  assert.equal(response.ok, true);
  assert.equal(response.providerAccepted, true);
  assert.equal(response.trackingPersisted, false);
  assert.equal(response.status, "accepted_but_tracking_failed");
  assert.equal(response.warning?.message, "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.");
  assert.equal("failed" in response, false);
});

test("tracking persistence resolves only when Supabase returns an id", () => {
  const persisted = resolveWhatsAppTrackingPersistence({
    data: { id: "attempt-1" },
    error: null,
  });

  assert.equal(persisted.trackingPersisted, true);
  assert.equal(persisted.branch, "persisted");
  assert.equal(persisted.rowId, "attempt-1");
});

test("tracking persistence fails when Supabase returns an error without throwing", () => {
  const failed = resolveWhatsAppTrackingPersistence({
    data: null,
    error: { code: "42501", message: "row-level security violation" },
  });

  assert.equal(failed.trackingPersisted, false);
  assert.equal(failed.branch, "upsert_error");
  assert.equal(failed.error?.code, "42501");
});

test("tracking persistence fails when Supabase returns no row id", () => {
  const failed = resolveWhatsAppTrackingPersistence({
    data: { id: "" },
    error: null,
  });

  assert.equal(failed.trackingPersisted, false);
  assert.equal(failed.branch, "missing_row");
});
