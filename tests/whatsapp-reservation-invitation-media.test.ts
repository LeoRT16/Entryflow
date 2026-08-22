import assert from "node:assert/strict";
import test from "node:test";

import { renderReservationWhatsAppInvitationMedia } from "../features/access/domain/whatsapp-reservation-invitation-media";
import type { ReservationWhatsAppInvitationCandidate } from "../features/access/domain/whatsapp-reservation-invitations";

function buildCandidate(params: {
  guestId: string;
  guestName: string;
  accessCode: string;
  recipient: string;
  isRetry?: boolean;
}): ReservationWhatsAppInvitationCandidate {
  const { guestId, guestName, accessCode, recipient, isRetry = false } = params;

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
    isRetry,
  };
}

function buildReadyNode(guestId: string, accessCode: string, guestName: string, images: HTMLImageElement[] = []) {
  return {
    dataset: {
      exportGuestId: guestId,
      exportAccessCode: accessCode,
      exportGuestName: guestName,
    },
    isConnected: true,
    getBoundingClientRect: () => ({ width: 1080, height: 1920, top: 0, left: 0, right: 1080, bottom: 1920, x: 0, y: 0, toJSON: () => undefined }),
    querySelectorAll: () => images as unknown as NodeListOf<Element>,
    remove: () => undefined,
  } as unknown as HTMLElement;
}

test("reservation WhatsApp invitation media is rendered and bound per candidate", async () => {
  const renderCalls: Array<{ guestId: string; accessCode: string; guestName: string }> = [];
  const prepareCalls: Array<{ guestId: string; filename: string }> = [];

  const stubRender = async (node: HTMLElement, options: { filename: string }) => {
    const dataset = node.dataset;
    renderCalls.push({
      guestId: dataset.exportGuestId ?? "",
      accessCode: dataset.exportAccessCode ?? "",
      guestName: dataset.exportGuestName ?? "",
    });

    return {
      blob: new Blob([new Uint8Array(4096)], { type: "image/png" }),
      mimeType: "image/png",
      filename: options.filename,
    };
  };

  const stubPrepare = async (
    blob: Blob,
    filename: string,
  ): Promise<{
    blob: Blob;
    mimeType: "image/png";
    filename: string;
    width: number;
    height: number;
    optimized: boolean;
  }> => {
    prepareCalls.push({
      guestId: filename.replace(/\.png$/, ""),
      filename,
    });

    return {
      blob,
      mimeType: "image/png" as const,
      filename,
      width: 1080,
      height: 1920,
      optimized: false,
    };
  };

  const resultA = await renderReservationWhatsAppInvitationMedia(buildCandidate({
    guestId: "guest-A",
    guestName: "Guest A",
    accessCode: "CODE-A",
    recipient: "59170000000",
  }), {
    invitationNode: buildReadyNode("guest-A", "CODE-A", "Guest A"),
    renderInvitationImageBlobImpl: stubRender,
    prepareWhatsAppInvitationMediaBlobImpl: stubPrepare,
  });

  const resultB = await renderReservationWhatsAppInvitationMedia(buildCandidate({
    guestId: "guest-B",
    guestName: "Guest B",
    accessCode: "CODE-B",
    recipient: "59170000001",
    isRetry: true,
  }), {
    invitationNode: buildReadyNode("guest-B", "CODE-B", "Guest B"),
    renderInvitationImageBlobImpl: stubRender,
    prepareWhatsAppInvitationMediaBlobImpl: stubPrepare,
  });

  assert.equal(resultA.guestId, "guest-A");
  assert.equal(resultA.accessCode, "CODE-A");
  assert.equal(resultA.mediaAsset.filename, "invitation-code-a.png");
  assert.equal(resultB.guestId, "guest-B");
  assert.equal(resultB.accessCode, "CODE-B");
  assert.equal(resultB.mediaAsset.filename, "invitation-code-b.png");
  assert.deepEqual(renderCalls, [
    { guestId: "guest-A", accessCode: "CODE-A", guestName: "Guest A" },
    { guestId: "guest-B", accessCode: "CODE-B", guestName: "Guest B" },
  ]);
  assert.deepEqual(prepareCalls, [
    { guestId: "invitation-code-a", filename: "invitation-code-a.png" },
    { guestId: "invitation-code-b", filename: "invitation-code-b.png" },
  ]);
});

test("reservation WhatsApp invitation media waits for mounted images before capture", async () => {
  let decodeReleased = false;
  let captureCalled = false;
  let renderCalled = false;
  let resolveDecode!: () => void;

  const image = {
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    decode: async () =>
      new Promise<void>((resolve) => {
        resolveDecode = () => {
          decodeReleased = true;
          const mutableImage = image as unknown as { complete: boolean; naturalWidth: number; naturalHeight: number };
          mutableImage.complete = true;
          mutableImage.naturalWidth = 1080;
          mutableImage.naturalHeight = 1920;
          resolve();
        };
      }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLImageElement;

  const candidate = buildCandidate({
    guestId: "guest-ready",
    guestName: "Guest Ready",
    accessCode: "CODE-READY",
    recipient: "59170000002",
  });

  const resultPromise = renderReservationWhatsAppInvitationMedia(candidate, {
    invitationNode: buildReadyNode("guest-ready", "CODE-READY", "Guest Ready", [image]),
    renderInvitationImageBlobImpl: async (node) => {
      renderCalled = true;
      const dataset = node.dataset;
      assert.equal(dataset.exportGuestId, "guest-ready");
      assert.equal(dataset.exportAccessCode, "CODE-READY");
      captureCalled = true;
      return {
        blob: new Blob([new Uint8Array(4096)], { type: "image/png" }),
        mimeType: "image/png",
        filename: "invitation-code-ready.png",
      };
    },
    prepareWhatsAppInvitationMediaBlobImpl: async (blob, filename) => ({
      blob,
      mimeType: "image/png" as const,
      filename,
      width: 1080,
      height: 1920,
      optimized: false,
    }),
  });

  await Promise.resolve();
  assert.equal(renderCalled, false);
  assert.equal(captureCalled, false);
  assert.equal(decodeReleased, false);

  resolveDecode();
  const result = await resultPromise;

  assert.equal(result.guestId, "guest-ready");
  assert.equal(renderCalled, true);
  assert.equal(captureCalled, true);
  assert.equal(decodeReleased, true);
});

test("reservation WhatsApp invitation media rejects mismatched identity bindings", async () => {
  await assert.rejects(
    () =>
      renderReservationWhatsAppInvitationMedia(
        buildCandidate({
          guestId: "guest-B",
          guestName: "Guest B",
          accessCode: "CODE-A",
          recipient: "59170000001",
        }),
        {
          invitationNode: buildReadyNode("guest-other", "CODE-Z", "Guest B"),
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error).message, "No se pudo preparar la invitación para WhatsApp.");
      return true;
    },
  );
});
