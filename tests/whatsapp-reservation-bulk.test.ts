import assert from "node:assert/strict";
import test from "node:test";

import { resolveWhatsAppSendDetails } from "../app/api/whatsapp/send/route";
import { buildReservationWhatsAppInvitationPlan } from "../features/access/domain/whatsapp-reservation-invitations";
import type { Guest as CheckInGuest } from "../features/check-in/types";

test("reservation WhatsApp bulk plan skips already delivered guests and retries failures", () => {
  const plan = buildReservationWhatsAppInvitationPlan({
    reservation: {
      id: "reservation-1",
      holderName: "Holder",
      name: "Mesa 1",
      code: "RES-1",
      tableName: "Mesa 1",
    },
    currentEvent: {
      name: "Evento Principal",
      startAt: "2026-08-21T20:30:00.000Z",
      timezone: "America/La_Paz",
      venue: "Sede Canónica",
    },
    currentVenueName: "Sede Canónica",
    guests: [
      {
        id: "guest-1",
        guestName: "Pendiente",
        reservationName: "Mesa 1",
        reservationCode: "RES-1",
        reservationId: "reservation-1",
        eventId: "event-1",
        eventName: "Evento Principal",
        invitationSequence: "01",
        invitationCode: "INV-1",
        carnet: "123",
        whatsapp: "+59170000000",
        deliveryStatus: "Pendiente de envío",
        admissionStatus: "Pendiente",
        reservationStatus: "Pending",
        deliveryHistory: [],
        operatorActivity: [],
        qrStatus: "Válido",
      } as never,
      {
        id: "guest-2",
        guestName: "Fallida",
        reservationName: "Mesa 1",
        reservationCode: "RES-1",
        reservationId: "reservation-1",
        eventId: "event-1",
        eventName: "Evento Principal",
        invitationSequence: "02",
        invitationCode: "INV-2",
        carnet: "456",
        whatsapp: "70000001",
        deliveryStatus: "Fallida",
        admissionStatus: "Pendiente",
        reservationStatus: "Pending",
        deliveryHistory: [],
        operatorActivity: [],
        qrStatus: "Válido",
        whatsappDelivery: {
          messageId: "msg-2",
          attemptNumber: 1,
          currentStatus: "failed",
          updatedAt: "2026-08-21T20:02:00.000Z",
          failedAt: "2026-08-21T20:02:00.000Z",
          failureCode: "mock_failure",
          failureMessage: "Mock failure",
        },
      } as never,
      {
        id: "guest-3",
        guestName: "Ya enviada",
        reservationName: "Mesa 1",
        reservationCode: "RES-1",
        reservationId: "reservation-1",
        eventId: "event-1",
        eventName: "Evento Principal",
        invitationSequence: "03",
        invitationCode: "INV-3",
        carnet: "789",
        whatsapp: "+59170000002",
        deliveryStatus: "Enviada",
        admissionStatus: "Pendiente",
        reservationStatus: "Pending",
        deliveryHistory: [],
        operatorActivity: [],
        qrStatus: "Válido",
        whatsappDelivery: {
          messageId: "msg-3",
          attemptNumber: 1,
          currentStatus: "accepted",
          updatedAt: "2026-08-21T20:03:00.000Z",
          acceptedAt: "2026-08-21T20:03:00.000Z",
        },
      } as never,
      {
        id: "guest-4",
        guestName: "Sin WhatsApp",
        reservationName: "Mesa 1",
        reservationCode: "RES-1",
        reservationId: "reservation-1",
        eventId: "event-1",
        eventName: "Evento Principal",
        invitationSequence: "04",
        invitationCode: "INV-4",
        carnet: "999",
        whatsapp: "",
        deliveryStatus: "Pendiente de envío",
        admissionStatus: "Pendiente",
        reservationStatus: "Pending",
        deliveryHistory: [],
        operatorActivity: [],
        qrStatus: "Válido",
      } as never,
    ],
  });

  assert.equal(plan.eligibleCount, 2);
  assert.equal(plan.retryableCount, 1);
  assert.equal(plan.alreadySentCount, 1);
  assert.equal(plan.missingWhatsAppCount, 1);
  assert.equal(plan.missingCodeCount, 0);
  assert.equal(plan.eligibleGuests[0]?.guest.id, "guest-1");
  assert.equal(plan.eligibleGuests[0]?.isRetry, false);
  assert.equal(plan.eligibleGuests[1]?.guest.id, "guest-2");
  assert.equal(plan.eligibleGuests[1]?.isRetry, true);
  assert.equal(plan.eligibleGuests[0]?.invitation.venueName, "Sede Canónica");
  assert.equal(plan.eligibleGuests[0]?.invitation.eventName, "Evento Principal");
  assert.equal(plan.eligibleGuests[0]?.invitation.reservationHolderName, "Holder");
});

test("legacy invitation deliveryStatus alone does not mark a guest as already sent for WhatsApp bulk", () => {
  const plan = buildReservationWhatsAppInvitationPlan({
    reservation: {
      id: "reservation-1",
      holderName: "Holder",
      name: "Mesa 1",
      code: "RES-1",
      tableName: "Mesa 1",
    },
    currentEvent: {
      name: "Evento Principal",
      startAt: "2026-08-21T20:30:00.000Z",
      timezone: "America/La_Paz",
      venue: "Sede Canónica",
    },
    currentVenueName: "Sede Canónica",
    guests: [
      {
        id: "guest-legacy",
        guestName: "Legacy",
        reservationName: "Mesa 1",
        reservationCode: "RES-1",
        reservationId: "reservation-1",
        eventId: "event-1",
        eventName: "Evento Principal",
        invitationSequence: "05",
        invitationCode: "INV-5",
        carnet: "555",
        whatsapp: "+59170000005",
        deliveryStatus: "Enviada",
        admissionStatus: "Pendiente",
        reservationStatus: "Pending",
        deliveryHistory: [],
        operatorActivity: [],
        qrStatus: "Válido",
      } as never,
    ],
  });

  assert.equal(plan.eligibleCount, 1);
  assert.equal(plan.alreadySentCount, 0);
  assert.equal(plan.skippedCount, 0);
  assert.equal(plan.eligibleGuests[0]?.guest.id, "guest-legacy");
  assert.equal(plan.eligibleGuests[0]?.isRetry, false);
});

test("reservation WhatsApp bulk plan preserves the real invitation artwork from a raw event snapshot", () => {
  const plan = buildReservationWhatsAppInvitationPlan({
    reservation: {
      id: "reservation-f427",
      holderName: "Leo Toro",
      name: "Msa 1 · Leo Toro",
      code: "RES-07F86829",
      tableName: "Msa 1",
    },
    currentEvent: {
      id: "f427cd0d-e541-41a5-b0d1-f6f9d988f68a",
      name: "Sabado 22 de Agosto",
      start_at: "22 de agosto de 2026 21:00",
      timezone: "America/La_Paz",
      venue: "Rotita",
      metadata: {
        venueId: "1e172020-68b3-4762-996f-e776de89889b",
        blueprint: "nightlife",
        createdFromWizard: true,
        invitationArtwork: {
          url: "https://zbiaqiofkupprtqnhvzm.supabase.co/storage/v1/object/public/event-invitation-artwork/organizations/52e98580-ac77-442a-858f-5d301775c945/events/f427cd0d-e541-41a5-b0d1-f6f9d988f68a/invitation-artwork/1787290452376-diseno-sin-titulo-3.png",
          path: "organizations/52e98580-ac77-442a-858f-5d301775c945/events/f427cd0d-e541-41a5-b0d1-f6f9d988f68a/invitation-artwork/1787290452376-diseno-sin-titulo-3.png",
          size: 3118375,
          label: "Diseño sin título (3)",
          width: 1080,
          height: 1920,
          fileName: "Diseño sin título (3).png",
          mimeType: "image/png",
          updatedAt: "2026-08-21T05:34:14.232Z",
        },
        invitationOverlayLayout: {
          mode: "freeform",
          version: 2,
          templateId: "entryflow.freeform.v1",
          updatedAt: "2026-08-21T18:33:17.556Z",
          elements: [
            {
              id: "guest",
              type: "GUEST",
              x: 132,
              y: 689.6197158604452,
              width: 816,
              height: 132,
              fontSize: 98,
              fontFamily: "bebas-neue",
              textColor: "#FFFFFF",
              fontWeight: 700,
              textAlign: "center",
              template: "{{guestName}}, estás invitado.",
            },
            {
              id: "reservation-context",
              type: "RESERVATION_CONTEXT",
              x: 148.52515651755138,
              y: 952.1183981699485,
              width: 816,
              height: 186,
              fontSize: 70,
              fontFamily: "bebas-neue",
              textColor: "#FFFFFF",
              fontWeight: 500,
              textAlign: "center",
              template: "Reserva de {{reservationHolder}}\n{{eventDate}} {{eventTime}} · {{venueName}}",
            },
            {
              id: "qr",
              type: "QR",
              x: 400,
              y: 1327.400253504923,
              size: 280,
            },
            {
              id: "notice",
              type: "NOTICE",
              x: 159.50516374143837,
              y: 1666.7198670269693,
              width: 760,
              height: 108,
              fontSize: 50,
              fontFamily: "bebas-neue",
              textColor: "#FFFFFF",
              fontWeight: 500,
              textAlign: "center",
              template: "Uso único\nLa captura de pantalla no garantiza el ingreso.",
            },
          ],
        },
      },
      guests: [
        {
          id: "b6eb1314-2ed4-4a14-b1ab-ca6c27b70c04",
          guestName: "Leonardo Rodríguez",
          reservationName: "Msa 1 · Leo Toro",
          reservationCode: "RES-07F86829",
          reservationId: "reservation-f427",
          eventId: "f427cd0d-e541-41a5-b0d1-f6f9d988f68a",
          eventName: "Sabado 22 de Agosto",
          invitationSequence: "01",
          invitationCode: "RES-07F86829-01",
          accessCode: "RES-07F86829-01",
          carnet: "12345678",
          whatsapp: "+59177374577",
          deliveryStatus: "Pendiente de envío",
          admissionStatus: "Pendiente",
          reservationStatus: "Cancelled",
          deliveryHistory: [],
          operatorActivity: [],
          qrStatus: "Válido",
          seat: "Mesa 1",
          tableName: "Msa 1",
          qrToken: "RES-07F86829-01",
        } as never,
      ],
    },
    currentVenueName: "Rotita",
    guests: [
      {
        id: "b6eb1314-2ed4-4a14-b1ab-ca6c27b70c04",
        guestName: "Leonardo Rodríguez",
        reservationName: "Msa 1 · Leo Toro",
        reservationCode: "RES-07F86829",
        reservationId: "reservation-f427",
        eventId: "f427cd0d-e541-41a5-b0d1-f6f9d988f68a",
        eventName: "Sabado 22 de Agosto",
        invitationSequence: "01",
        invitationCode: "RES-07F86829-01",
        accessCode: "RES-07F86829-01",
        carnet: "12345678",
        whatsapp: "+59177374577",
        deliveryStatus: "Pendiente de envío",
        admissionStatus: "Pendiente",
        reservationStatus: "Cancelled",
        deliveryHistory: [],
        operatorActivity: [],
        qrStatus: "Válido",
        seat: "Mesa 1",
        tableName: "Msa 1",
        qrToken: "RES-07F86829-01",
      } as never,
    ],
  });

  assert.equal(plan.eligibleCount, 1);
  assert.equal(plan.eligibleGuests[0]?.invitation.eventName, "Sabado 22 de Agosto");
  assert.equal(plan.eligibleGuests[0]?.invitation.venueName, "Rotita");
  assert.equal(
    plan.eligibleGuests[0]?.invitation.artUrl,
    "https://zbiaqiofkupprtqnhvzm.supabase.co/storage/v1/object/public/event-invitation-artwork/organizations/52e98580-ac77-442a-858f-5d301775c945/events/f427cd0d-e541-41a5-b0d1-f6f9d988f68a/invitation-artwork/1787290452376-diseno-sin-titulo-3.png",
  );
  assert.equal(plan.eligibleGuests[0]?.invitation.overlayLayout?.elements.length, 4);
  assert.equal(plan.eligibleGuests[0]?.invitation.date, "22 de agosto de 2026 21:00");
});

test("reservation WhatsApp bulk plan skips accepted guests on a second batch and retries only failed guests", () => {
  const baseGuest = {
    id: "guest-base",
    guestName: "Base",
    reservationName: "Mesa 1",
    reservationCode: "RES-1",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento Principal",
    eventStatus: "En curso",
    invitationSequence: "01",
    invitationCode: "INV-1",
    carnet: "123",
    whatsapp: "+59170000000",
    deliveryStatus: "Pendiente de envío",
    admissionStatus: "Pendiente",
    reservationStatus: "Pending",
    deliveryHistory: [],
    operatorActivity: [],
    qrStatus: "Válido",
  } as CheckInGuest;

  const acceptedGuests: CheckInGuest[] = Array.from({ length: 5 }, (_, index) => ({
    ...baseGuest,
    id: `guest-${index + 1}`,
    guestName: `Aceptado ${index + 1}`,
    invitationSequence: String(index + 1).padStart(2, "0"),
    invitationCode: `INV-${index + 1}`,
    whatsappDelivery: {
      messageId: `msg-${index + 1}`,
      attemptNumber: 1,
      currentStatus: "accepted",
      updatedAt: `2026-08-21T20:3${index}:00.000Z`,
      acceptedAt: `2026-08-21T20:3${index}:00.000Z`,
    },
  }));

  const acceptedPlan = buildReservationWhatsAppInvitationPlan({
    reservation: {
      id: "reservation-1",
      holderName: "Holder",
      name: "Mesa 1",
      code: "RES-1",
      tableName: "Mesa 1",
    },
    currentEvent: {
      name: "Evento Principal",
      startAt: "2026-08-21T20:30:00.000Z",
      timezone: "America/La_Paz",
      venue: "Sede Canónica",
    },
    currentVenueName: "Sede Canónica",
    guests: acceptedGuests,
  });

  assert.equal(acceptedPlan.eligibleCount, 0);
  assert.equal(acceptedPlan.alreadySentCount, 5);
  assert.equal(acceptedPlan.retryableCount, 0);

  const retryGuests: CheckInGuest[] = acceptedGuests.map((guest, index) =>
    index === 2
      ? {
          ...guest,
          guestName: "Fallida",
          deliveryStatus: "Fallida",
          whatsappDelivery: {
            ...guest.whatsappDelivery!,
            currentStatus: "failed",
          },
        }
      : guest,
  );

  const retryPlan = buildReservationWhatsAppInvitationPlan({
    reservation: {
      id: "reservation-1",
      holderName: "Holder",
      name: "Mesa 1",
      code: "RES-1",
      tableName: "Mesa 1",
    },
    currentEvent: {
      name: "Evento Principal",
      startAt: "2026-08-21T20:30:00.000Z",
      timezone: "America/La_Paz",
      venue: "Sede Canónica",
    },
    currentVenueName: "Sede Canónica",
    guests: retryGuests,
  });

  assert.equal(retryPlan.eligibleCount, 1);
  assert.equal(retryPlan.retryableCount, 1);
  assert.equal(retryPlan.alreadySentCount, 4);
  assert.equal(retryPlan.eligibleGuests[0]?.guest.id, "guest-3");
  assert.equal(retryPlan.eligibleGuests[0]?.isRetry, true);
});

test("reservation WhatsApp bulk plan can explicitly resend already sent guests after operator confirmation", () => {
  const acceptedGuests: CheckInGuest[] = Array.from({ length: 2 }, (_, index) => ({
    id: `guest-${index + 1}`,
    guestName: `Aceptado ${index + 1}`,
    reservationName: "Mesa 1",
    reservationCode: "RES-1",
    reservationId: "reservation-1",
    eventId: "event-1",
    eventName: "Evento Principal",
    eventStatus: "En curso",
    invitationSequence: String(index + 1).padStart(2, "0"),
    invitationCode: `INV-${index + 1}`,
    carnet: "123",
    whatsapp: "+59170000000",
    deliveryStatus: "Pendiente de envío",
    admissionStatus: "Pendiente",
    reservationStatus: "Pending",
    deliveryHistory: [],
    operatorActivity: [],
    qrStatus: "Válido",
    whatsappDelivery: {
      messageId: `msg-${index + 1}`,
      attemptNumber: 1,
      currentStatus: "accepted",
      updatedAt: "2026-08-21T20:30:00.000Z",
      acceptedAt: "2026-08-21T20:30:00.000Z",
    },
  }));

  const explicitResendPlan = buildReservationWhatsAppInvitationPlan({
    reservation: {
      id: "reservation-1",
      holderName: "Holder",
      name: "Mesa 1",
      code: "RES-1",
      tableName: "Mesa 1",
    },
    currentEvent: {
      name: "Evento Principal",
      startAt: "2026-08-21T20:30:00.000Z",
      timezone: "America/La_Paz",
      venue: "Sede Canónica",
    },
    currentVenueName: "Sede Canónica",
    includeAlreadySentGuests: true,
    guests: acceptedGuests,
  });

  assert.equal(explicitResendPlan.eligibleCount, 2);
  assert.equal(explicitResendPlan.alreadySentCount, 2);
  assert.equal(explicitResendPlan.skippedCount, 0);
  assert.equal(explicitResendPlan.eligibleGuests[0]?.guest.id, "guest-1");
  assert.equal(explicitResendPlan.eligibleGuests[0]?.isRetry, false);
});

test("reservation WhatsApp guest-scoped send details prefer the guest record when guestId is provided", () => {
  const resolved = resolveWhatsAppSendDetails(
    {
      recipient: "+591 7777 7777",
      guestName: "Wrong",
      eventName: "Wrong",
      accessCode: "WRONG",
      invitationCode: "WRONG",
    },
    {
      whatsapp: "+591 7000 0000",
      guestName: "Real Guest",
      eventName: "Real Event",
      accessCode: "ACC-1",
      invitationCode: "INV-1",
    },
  );

  assert.deepEqual(resolved, {
    recipient: "59170000000",
    guestName: "Real Guest",
    eventName: "Real Event",
    accessCode: "ACC-1",
  });
});
