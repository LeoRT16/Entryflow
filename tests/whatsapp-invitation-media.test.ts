import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareWhatsAppInvitationMediaBlob,
  WHATSAPP_INVITATION_MEDIA_SAFE_TARGET_BYTES,
} from "../features/access/domain/whatsapp-invitation-media";

function buildSourceBlob(size: number, mimeType: string) {
  return new Blob([new Uint8Array(size)], { type: mimeType });
}

function buildCanvasRecorder() {
  const drawCalls: Array<[string, unknown[]]> = [];
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low" as ImageSmoothingQuality,
    fillStyle: "",
    fillRect: (...args: number[]) => {
      drawCalls.push(["fillRect", args]);
    },
    drawImage: (...args: unknown[]) => {
      drawCalls.push(["drawImage", args]);
    },
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: "2d") => (kind === "2d" ? context : null),
    toBlob: () => {
      throw new Error("toBlob should not be called in this test.");
    },
  };

  return { canvas, context, drawCalls };
}

test("prepareWhatsAppInvitationMediaBlob returns the source blob when it is already under the safe target", async () => {
  const sourceBlob = buildSourceBlob(1024, "image/png");
  let decodeCalled = false;
  let createCanvasCalled = false;
  let encodeCanvasCalled = false;

  const result = await prepareWhatsAppInvitationMediaBlob(sourceBlob, "invitation-res-001.png", {
    decodeImage: async () => {
      decodeCalled = true;
      return {
        width: 1080,
        height: 1920,
      };
    },
    createCanvas: () => {
      createCanvasCalled = true;
      return buildCanvasRecorder().canvas as unknown as HTMLCanvasElement;
    },
    encodeCanvas: async () => {
      encodeCanvasCalled = true;
      return null;
    },
  });

  assert.equal(decodeCalled, false);
  assert.equal(createCanvasCalled, false);
  assert.equal(encodeCanvasCalled, false);
  assert.equal(result.blob, sourceBlob);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.filename, "invitation-res-001.png");
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.equal(result.optimized, false);
});

test("prepareWhatsAppInvitationMediaBlob keeps PNG when the canvas output is safely under the limit", async () => {
  const sourceBlob = buildSourceBlob(5_400_000, "image/png");
  const recorder = buildCanvasRecorder();
  const calls: Array<{ mimeType: string; quality?: number }> = [];

  const result = await prepareWhatsAppInvitationMediaBlob(sourceBlob, "invitation-res-001.png", {
    decodeImage: async () => ({
      width: 1080,
      height: 1920,
    }),
    createCanvas: (width, height) => {
      recorder.canvas.width = width;
      recorder.canvas.height = height;
      return recorder.canvas as unknown as HTMLCanvasElement;
    },
    encodeCanvas: async (_canvas, mimeType, quality) => {
      calls.push({ mimeType, quality });

      if (mimeType === "image/png") {
        return buildSourceBlob(4_200_000, "image/png");
      }

      return buildSourceBlob(5_200_000, "image/jpeg");
    },
  });

  assert.equal(result.mimeType, "image/png");
  assert.equal(result.filename, "invitation-res-001.png");
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.equal(result.optimized, true);
  assert.equal(result.blob.type, "image/png");
  assert.equal(result.blob.size <= WHATSAPP_INVITATION_MEDIA_SAFE_TARGET_BYTES, true);
  assert.deepEqual(calls, [{ mimeType: "image/png", quality: undefined }]);
  assert.equal(recorder.canvas.width, 1080);
  assert.equal(recorder.canvas.height, 1920);
  assert.equal(recorder.drawCalls.length > 0, true);
});

test("prepareWhatsAppInvitationMediaBlob falls back to JPEG when PNG is still too large", async () => {
  const sourceBlob = buildSourceBlob(5_400_000, "image/png");
  const recorder = buildCanvasRecorder();
  const calls: Array<{ mimeType: string; quality?: number }> = [];

  const result = await prepareWhatsAppInvitationMediaBlob(sourceBlob, "invitation-res-001.png", {
    decodeImage: async () => ({
      width: 1080,
      height: 1920,
    }),
    createCanvas: (width, height) => {
      recorder.canvas.width = width;
      recorder.canvas.height = height;
      return recorder.canvas as unknown as HTMLCanvasElement;
    },
    encodeCanvas: async (_canvas, mimeType, quality) => {
      calls.push({ mimeType, quality });

      if (mimeType === "image/png") {
        return buildSourceBlob(5_100_000, "image/png");
      }

      if (quality === 0.96) {
        return buildSourceBlob(4_800_000, "image/jpeg");
      }

      if (quality === 0.94) {
        return buildSourceBlob(4_300_000, "image/jpeg");
      }

      return buildSourceBlob(4_700_000, "image/jpeg");
    },
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.filename, "invitation-res-001.jpg");
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.equal(result.optimized, true);
  assert.equal(result.qualityUsed, 0.94);
  assert.equal(result.blob.type, "image/jpeg");
  assert.equal(result.blob.size <= WHATSAPP_INVITATION_MEDIA_SAFE_TARGET_BYTES, true);
  assert.deepEqual(calls, [
    { mimeType: "image/png", quality: undefined },
    { mimeType: "image/jpeg", quality: 0.96 },
    { mimeType: "image/jpeg", quality: 0.94 },
  ]);
  assert.equal(recorder.canvas.width, 1080);
  assert.equal(recorder.canvas.height, 1920);
});

test("prepareWhatsAppInvitationMediaBlob fails when no valid output fits under the safe target", async () => {
  const sourceBlob = buildSourceBlob(5_400_000, "image/png");

  await assert.rejects(
    () =>
      prepareWhatsAppInvitationMediaBlob(sourceBlob, "invitation-res-001.png", {
        decodeImage: async () => ({
          width: 1080,
          height: 1920,
        }),
        createCanvas: (width, height) => {
          const recorder = buildCanvasRecorder();
          recorder.canvas.width = width;
          recorder.canvas.height = height;
          return recorder.canvas as unknown as HTMLCanvasElement;
        },
        encodeCanvas: async (_canvas, mimeType) =>
          buildSourceBlob(mimeType === "image/png" ? 5_200_000 : 5_100_000, mimeType),
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error).message, "La imagen de WhatsApp sigue superando el límite permitido.");
      return true;
    },
  );
});
