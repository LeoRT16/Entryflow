import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGuestProfileUpdate,
  validateGuestProfileUpdateInput,
} from "../features/customers/domain/customer-directory";
import type { GuestRecord } from "../features/customers/types";

const guestFixture: GuestRecord = {
  id: "guest-1",
  guestName: "  Ana Pérez  ",
  reservationName: "Mesa 3 · Ana Pérez",
  reservationCode: "RES-001",
  eventName: "Gala EntryFlow",
  accessGrantId: "grant-1",
  accessCode: "RES-001-01",
  qrToken: "qr-token-1",
  tableId: "table-1",
  tableName: "Mesa 3",
  eventStatus: "En curso",
  invitationSequence: "1 de 1",
  invitationCode: "RES-001-01",
  carnet: "  CI-1234  ",
  whatsapp: "  +591 70000097  ",
  deliveryStatus: "Enviada",
  admissionStatus: "Pendiente",
  reservationStatus: "Confirmed",
  recentChange: false,
  noWhatsApp: false,
  noInvitationSent: false,
  manualAdmission: false,
  deliveryHistory: [],
  operatorActivity: [],
};

test("guest profile validation trims input and accepts empty WhatsApp", () => {
  const validation = validateGuestProfileUpdateInput({
    guestName: "  Ana Pérez  ",
    carnet: "  CI-1234  ",
    whatsapp: "   ",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) {
    throw new Error("Expected validation to pass.");
  }

  assert.deepEqual(validation.value, {
    guestName: "Ana Pérez",
    carnet: "CI-1234",
    whatsapp: "",
    noWhatsApp: true,
  });
});

test("guest profile validation rejects invalid WhatsApp numbers", () => {
  const validation = validateGuestProfileUpdateInput({
    guestName: "Ana Pérez",
    carnet: "CI-1234",
    whatsapp: "+1 555 000 0000",
  });

  assert.equal(validation.ok, false);
  if (validation.ok) {
    throw new Error("Expected validation to fail.");
  }

  assert.equal(validation.fieldErrors.whatsapp, "Ingresá un WhatsApp boliviano válido o dejalo vacío.");
});

test("guest profile update preserves access identity fields and updates canonical profile data", () => {
  const nextGuest = buildGuestProfileUpdate(guestFixture, {
    guestName: "Ana María Pérez",
    carnet: "CI-5678",
    whatsapp: "59170000097",
    noWhatsApp: false,
  });

  assert.equal(nextGuest.id, guestFixture.id);
  assert.equal(nextGuest.reservationCode, guestFixture.reservationCode);
  assert.equal(nextGuest.reservationName, guestFixture.reservationName);
  assert.equal(nextGuest.accessGrantId, guestFixture.accessGrantId);
  assert.equal(nextGuest.accessCode, guestFixture.accessCode);
  assert.equal(nextGuest.qrToken, guestFixture.qrToken);
  assert.equal(nextGuest.guestName, "Ana María Pérez");
  assert.equal(nextGuest.carnet, "CI-5678");
  assert.equal(nextGuest.whatsapp, "59170000097");
  assert.equal(nextGuest.noWhatsApp, false);
  assert.equal(nextGuest.deliveryStatus, guestFixture.deliveryStatus);
  assert.equal(nextGuest.admissionStatus, guestFixture.admissionStatus);
});
