import assert from "node:assert/strict";
import test from "node:test";

import {
  ReservationWhatsAppInvitationDeliveryError,
  sendReservationWhatsAppInvitation,
} from "../features/access/domain/whatsapp-reservation-invitation-delivery";
import type { ReservationWhatsAppInvitationCandidate } from "../features/access/domain/whatsapp-reservation-invitations";
import type { ReservationWhatsAppInvitationMediaResult } from "../features/access/domain/whatsapp-reservation-invitation-media";

function buildCandidate(guestId: string, guestName: string, accessCode: string, recipient: string): ReservationWhatsAppInvitationCandidate {
  return {
    guest: {
      id: guestId,
      guestName,
      reservationName: "Mesa 1",
      reservationCode: "RES-1",
      reservationId: "reservation-1",
      eventId: "event-1",
      eventName: "Evento Principal",
      invitationSequence: "01",
      invitationCode: accessCode,
      accessCode,
      seat: "Mesa 1",
      tableName: "Mesa 1",
      whatsapp: recipient,
      deliveryStatus: "Pendiente de envío",
      admissionStatus: "Pendiente",
      reservationStatus: "Pending",
      deliveryHistory: [],
      operatorActivity: [],
      qrStatus: "Válido",
    } as never,
    recipient,
    accessCode,
    invitation: {
      id: guestId,
      eventName: "Evento Principal",
      guestName,
      reservationName: "Mesa 1",
      reservationHolderName: "Holder",
      reservationCode: "RES-1",
      tableName: "Mesa 1",
      zoneName: "Mesa 1",
      venueName: "Venue Canonico",
      date: "22 de agosto de 2026",
      time: "22:00",
      uniqueCode: accessCode,
      qrValue: `qr-${guestId}`,
      artUrl: undefined,
      artPath: undefined,
      artLabel: undefined,
      overlayLayout: undefined,
      theme: "Pieza lista para compartir y validar operativamente.",
      variant: "general",
    },
    isRetry: false,
  };
}

function buildRenderedInvitation(candidate: ReservationWhatsAppInvitationCandidate): ReservationWhatsAppInvitationMediaResult {
  return {
    guestId: candidate.guest.id,
    accessCode: candidate.accessCode,
    invitationImage: {
      blob: new Blob([new Uint8Array(4096)], { type: "image/png" }),
      mimeType: "image/png",
      filename: `invitation-${candidate.guest.id}.png`,
    },
    mediaAsset: {
      blob: new Blob([new Uint8Array(4096)], { type: "image/png" }),
      mimeType: "image/png",
      filename: `invitation-${candidate.guest.id}.png`,
      width: 1080,
      height: 1920,
      optimized: false,
    },
  };
}

test("media upload failure stops that candidate before send and does not leak mediaId", async () => {
  const calls: string[] = [];

  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/whatsapp/media")) {
      if (calls.filter((item) => item.endsWith("/api/whatsapp/media")).length === 1) {
        return new Response(JSON.stringify({ ok: false, error: { message: "Upload boom" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, mediaId: "media-B" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/api/whatsapp/send")) {
      return new Response(JSON.stringify({ ok: true, trackingPersisted: false, messageId: "wamid-B" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  await assert.rejects(
    () =>
      sendReservationWhatsAppInvitation(buildCandidate("guest-A", "Guest A", "CODE-A", "59170000000"), "Evento Principal", {
        fetchImpl,
        renderReservationWhatsAppInvitationMediaImpl: async (candidate) => buildRenderedInvitation(candidate),
      }),
    (error: unknown) => {
      assert.ok(error instanceof ReservationWhatsAppInvitationDeliveryError);
      assert.equal((error as ReservationWhatsAppInvitationDeliveryError).stage, "media_upload_failed");
      return true;
    },
  );

  const resultB = await sendReservationWhatsAppInvitation(buildCandidate("guest-B", "Guest B", "CODE-B", "59170000001"), "Evento Principal", {
    fetchImpl,
    renderReservationWhatsAppInvitationMediaImpl: async (candidate) => buildRenderedInvitation(candidate),
  });

  assert.equal(resultB.guestId, "guest-B");
  assert.equal(resultB.accessCode, "CODE-B");
  assert.equal(resultB.mediaId, "media-B");
  assert.equal(resultB.messageId, "wamid-B");
  assert.equal(resultB.ok, true);
  assert.equal(resultB.providerAccepted, true);
  assert.equal(resultB.status, "accepted");
  assert.equal(resultB.trackingPersisted, false);
  assert.equal(resultB.warning?.code, "accepted_but_tracking_failed");
  assert.equal(calls.filter((item) => item.endsWith("/api/whatsapp/media")).length, 2);
  assert.equal(calls.filter((item) => item.endsWith("/api/whatsapp/send")).length, 1);
});

test("two successful candidates keep identity distinct through render, media and send", async () => {
  const mediaIds: string[] = [];
  const sendBodies: Array<{ guestId: string; accessCode: string; recipient: string; mediaId: string; guestName: string; eventName: string }> = [];

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/api/whatsapp/media")) {
      const currentIndex = mediaIds.length + 1;
      const mediaId = currentIndex === 1 ? "media-A" : "media-B";
      mediaIds.push(mediaId);
      return new Response(JSON.stringify({ ok: true, mediaId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/api/whatsapp/send")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        guestId: string;
        accessCode: string;
        recipient: string;
        mediaId: string;
        guestName: string;
        eventName: string;
      };
      sendBodies.push(body);
      return new Response(JSON.stringify({ ok: true, trackingPersisted: false, messageId: `wamid-${body.guestId}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const resultA = await sendReservationWhatsAppInvitation(buildCandidate("guest-A", "Guest A", "CODE-A", "59170000000"), "Evento Principal", {
    fetchImpl,
    renderReservationWhatsAppInvitationMediaImpl: async (candidate) => buildRenderedInvitation(candidate),
  });
  const resultB = await sendReservationWhatsAppInvitation(buildCandidate("guest-B", "Guest B", "CODE-B", "59170000001"), "Evento Principal", {
    fetchImpl,
    renderReservationWhatsAppInvitationMediaImpl: async (candidate) => buildRenderedInvitation(candidate),
  });

  assert.equal(resultA.guestId, "guest-A");
  assert.equal(resultB.guestId, "guest-B");
  assert.equal(resultA.accessCode, "CODE-A");
  assert.equal(resultB.accessCode, "CODE-B");
  assert.equal(resultA.invitation.mediaAsset.filename, "invitation-guest-A.png");
  assert.equal(resultB.invitation.mediaAsset.filename, "invitation-guest-B.png");
  assert.equal(resultA.mediaId, "media-A");
  assert.equal(resultB.mediaId, "media-B");
  assert.equal(sendBodies.length, 2);
  assert.deepEqual(sendBodies, [
    { guestId: "guest-A", accessCode: "CODE-A", recipient: "59170000000", mediaId: "media-A", guestName: "Guest A", eventName: "Evento Principal" },
    { guestId: "guest-B", accessCode: "CODE-B", recipient: "59170000001", mediaId: "media-B", guestName: "Guest B", eventName: "Evento Principal" },
  ]);
});
