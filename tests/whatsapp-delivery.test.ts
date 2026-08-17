import assert from "node:assert/strict";
import test from "node:test";

import {
  canSendWhatsAppInvitation,
  buildInvitationWhatsAppMessage,
  buildWhatsAppDeepLink,
  canUseNativeShareWithFiles,
  normalizeWhatsAppPhoneNumber,
} from "../features/access/domain/whatsapp-delivery";
import { buildGuestWhatsAppUpdate } from "../features/customers/domain/customer-directory";
import { buildTimeline } from "../features/customers/domain/customer-directory";
import type { Guest } from "../features/check-in/types";

test("Bolivia phone normalization accepts local and +591 formats", () => {
  assert.equal(normalizeWhatsAppPhoneNumber("+591 70000097"), "59170000097");
  assert.equal(normalizeWhatsAppPhoneNumber("59170000097"), "59170000097");
  assert.equal(normalizeWhatsAppPhoneNumber("70000097"), "59170000097");
});

test("WhatsApp normalization rejects missing or invalid numbers", () => {
  assert.equal(normalizeWhatsAppPhoneNumber(""), null);
  assert.equal(normalizeWhatsAppPhoneNumber("   "), null);
  assert.equal(normalizeWhatsAppPhoneNumber("abc"), null);
  assert.equal(normalizeWhatsAppPhoneNumber("+1 555 000 0000"), null);
});

test("WhatsApp invitation message interpolates guest, event and invitation code", () => {
  const message = buildInvitationWhatsAppMessage({
    guestName: "Phase C Final Clean",
    eventName: "prueba E2E Rota Carlota",
    invitationCode: "RES-F4306879-01",
  });

  assert.equal(
    message,
    [
      "Hola Phase C Final Clean 👋",
      "",
      "Te compartimos tu invitación para prueba E2E Rota Carlota.",
      "",
      "Código de acceso: RES-F4306879-01",
      "",
      "Presentá el QR de tu invitación al ingresar.",
      "",
      "Esta invitación es personal y de uso único.",
    ].join("\n"),
  );
});

test("WhatsApp deep link encodes the recipient and message", () => {
  const message = "Hola\nMundo";
  const url = buildWhatsAppDeepLink({
    recipient: "59170000097",
    message,
  });

  assert.equal(url, `https://wa.me/59170000097?text=${encodeURIComponent(message)}`);
});

test("native share is selected only when files are supported", () => {
  const file = new File(["png"], "invitation.png", { type: "image/png" });
  const navigatorLike = {
    share: async () => undefined,
    canShare: ({ files }: { files?: File[] }) => Boolean(files?.length),
  };

  assert.equal(canUseNativeShareWithFiles(navigatorLike, [file]), true);
  assert.equal(canUseNativeShareWithFiles(undefined, [file]), false);
  assert.equal(canUseNativeShareWithFiles({ share: async () => undefined } as Navigator, [file]), false);
});

test("guest WhatsApp updates preserve QR, access and admission state", () => {
  const guest: Guest = {
    id: "guest-1",
    guestName: "WhatsApp Delivery E2E",
    reservationName: "Mesa 5 · WhatsApp Delivery E2E",
    reservationCode: "RES-CB498660",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento E2E",
    accessGrantId: "grant-1",
    accessCode: "RES-CB498660-01",
    qrToken: "qr_5b03f52b518af981",
    tableId: "table-1",
    tableName: "Mesa 5",
    eventStatus: "Próximo",
    invitationSequence: "1 de 1",
    invitationCode: "RES-CB498660-01",
    carnet: "WD-0001",
    whatsapp: "",
    deliveryStatus: "Enviada",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    checkInTime: undefined,
    deliveryHistory: [],
    operatorActivity: [],
    qrStatus: "Válido",
    recentChange: false,
    noWhatsApp: true,
    noInvitationSent: false,
    manualAdmission: false,
  };

  const nextGuest = buildGuestWhatsAppUpdate(guest, "  +591 70000097  ", "Operador", "2026-08-12T21:30:00.000Z");

  assert.equal(nextGuest.whatsapp, "+591 70000097");
  assert.equal(nextGuest.noWhatsApp, false);
  assert.equal(nextGuest.recentChange, true);
  assert.equal(nextGuest.accessGrantId, guest.accessGrantId);
  assert.equal(nextGuest.accessCode, guest.accessCode);
  assert.equal(nextGuest.qrToken, guest.qrToken);
  assert.equal(nextGuest.admissionStatus, guest.admissionStatus);
  assert.equal(nextGuest.qrStatus, guest.qrStatus);
  assert.equal(nextGuest.reservationStatus, guest.reservationStatus);
  assert.equal(nextGuest.operatorActivity.at(-1)?.action, "WhatsApp actualizado");
});

test("WhatsApp delivery helper blocks a second submit while the request is in flight", () => {
  assert.equal(canSendWhatsAppInvitation({ isReady: true, isSending: false }), true);
  assert.equal(canSendWhatsAppInvitation({ isReady: true, isSending: true }), false);
  assert.equal(canSendWhatsAppInvitation({ isReady: false, isSending: false }), false);
});

test("guest timeline describes WhatsApp as accepted by provider, not delivered", () => {
  const guest: Guest = {
    id: "guest-2",
    guestName: "WhatsApp Delivery E2E",
    reservationName: "Mesa 5 · WhatsApp Delivery E2E",
    reservationCode: "RES-CB498660",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento E2E",
    invitationSequence: "1 de 1",
    invitationCode: "RES-CB498660-01",
    carnet: "WD-0001",
    whatsapp: "+59170000097",
    eventStatus: "Próximo",
    deliveryStatus: "Enviada",
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    deliveryHistory: [{ time: "18:53", title: "Enviada", detail: "Solicitud enviada" }],
    operatorActivity: [],
    qrStatus: "Válido",
  } as Guest;

  const timeline = buildTimeline(guest);
  const sentEntry = timeline.find((entry) => entry.title === "Invitación enviada");

  assert.ok(sentEntry);
  assert.equal(sentEntry?.detail, "Envío por WhatsApp aceptado por proveedor");
});
