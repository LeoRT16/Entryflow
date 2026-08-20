"use client";

import { INVITATION_RENDER_SIZE } from "@/features/access/domain/invitation-rendering";

export const WHATSAPP_INVITATION_MEDIA_SAFE_TARGET_BYTES = 4.5 * 1024 * 1024;
const WHATSAPP_INVITATION_MEDIA_MAX_JPEG_QUALITY = 0.96;
const WHATSAPP_INVITATION_MEDIA_MIN_JPEG_QUALITY = 0.84;
const WHATSAPP_INVITATION_MEDIA_JPEG_QUALITY_STEP = 0.02;
const WHATSAPP_INVITATION_MEDIA_COMPATIBLE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const WHATSAPP_INVITATION_MEDIA_JPEG_QUALITIES = Array.from(
  {
    length: Math.floor((WHATSAPP_INVITATION_MEDIA_MAX_JPEG_QUALITY - WHATSAPP_INVITATION_MEDIA_MIN_JPEG_QUALITY) /
      WHATSAPP_INVITATION_MEDIA_JPEG_QUALITY_STEP) + 1,
  },
  (_value, index) =>
    Number(
      (WHATSAPP_INVITATION_MEDIA_MAX_JPEG_QUALITY - index * WHATSAPP_INVITATION_MEDIA_JPEG_QUALITY_STEP).toFixed(2),
    ),
);

type DecodedImage = {
  width: number;
  height: number;
  close?: () => void;
};

type CanvasLike = HTMLCanvasElement;

type DecodeImageImpl = (blob: Blob) => Promise<DecodedImage>;
type CreateCanvasImpl = (width: number, height: number) => CanvasLike;
type EncodeCanvasImpl = (canvas: CanvasLike, mimeType: "image/png" | "image/jpeg", quality?: number) => Promise<Blob | null>;

export type WhatsAppInvitationMediaOptimizationResult = {
  blob: Blob;
  mimeType: "image/png" | "image/jpeg";
  filename: string;
  width: number;
  height: number;
  optimized: boolean;
  qualityUsed?: number;
};

export type WhatsAppInvitationMediaOptimizationDependencies = {
  decodeImage?: DecodeImageImpl;
  createCanvas?: CreateCanvasImpl;
  encodeCanvas?: EncodeCanvasImpl;
};

export function isWhatsAppInvitationMediaCompatible(blob: Blob) {
  return WHATSAPP_INVITATION_MEDIA_COMPATIBLE_MIME_TYPES.has(blob.type || "image/png");
}

function getWhatsAppInvitationMediaFilename(filename: string, mimeType: "image/png" | "image/jpeg") {
  const baseName = filename.trim().replace(/\.[^.]+$/, "") || "invitation";
  return `${baseName}.${mimeType === "image/jpeg" ? "jpg" : "png"}`;
}

async function decodeImageBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await globalThis.createImageBitmap(blob);

    return bitmap;
  }

  if (typeof document === "undefined") {
    throw new Error("No se pudo preparar la imagen de WhatsApp.");
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;

    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("No se pudo preparar la imagen de WhatsApp."));
      });
    }

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createCanvas(width: number, height: number): CanvasLike {
  if (typeof document === "undefined") {
    throw new Error("No se pudo preparar la imagen de WhatsApp.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encodeCanvasBlob(canvas: CanvasLike, mimeType: "image/png" | "image/jpeg", quality?: number) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), mimeType, quality);
  });

  if (!blob) {
    throw new Error("No se pudo preparar la imagen de WhatsApp.");
  }

  return blob;
}

function drawImageToCanvas(canvas: CanvasLike, image: Pick<DecodedImage, "width" | "height">) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("No se pudo preparar la imagen de WhatsApp.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#0b111a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
}

export async function prepareWhatsAppInvitationMediaBlob(
  sourceBlob: Blob,
  filename: string,
  dependencies: WhatsAppInvitationMediaOptimizationDependencies = {},
): Promise<WhatsAppInvitationMediaOptimizationResult> {
  if (isWhatsAppInvitationMediaCompatible(sourceBlob) && sourceBlob.size <= WHATSAPP_INVITATION_MEDIA_SAFE_TARGET_BYTES) {
    return {
      blob: sourceBlob,
      mimeType: (sourceBlob.type || "image/png") as "image/png" | "image/jpeg",
      filename: getWhatsAppInvitationMediaFilename(filename, (sourceBlob.type || "image/png") as "image/png" | "image/jpeg"),
      width: INVITATION_RENDER_SIZE.width,
      height: INVITATION_RENDER_SIZE.height,
      optimized: false,
    };
  }

  const decodeImage = dependencies.decodeImage ?? decodeImageBlob;
  const createCanvasImpl = dependencies.createCanvas ?? createCanvas;
  const encodeCanvas = dependencies.encodeCanvas ?? encodeCanvasBlob;

  const decoded = await decodeImage(sourceBlob);
  const canvas = createCanvasImpl(decoded.width, decoded.height);
  drawImageToCanvas(canvas, decoded);

  try {
    const pngBlob = await encodeCanvas(canvas, "image/png");

    if (!pngBlob) {
      throw new Error("No se pudo preparar la imagen de WhatsApp.");
    }

    if (pngBlob.size <= WHATSAPP_INVITATION_MEDIA_SAFE_TARGET_BYTES) {
      return {
        blob: pngBlob,
        mimeType: "image/png",
        filename: getWhatsAppInvitationMediaFilename(filename, "image/png"),
        width: decoded.width,
        height: decoded.height,
        optimized: true,
      };
    }

    for (const quality of WHATSAPP_INVITATION_MEDIA_JPEG_QUALITIES) {
      const jpegBlob = await encodeCanvas(canvas, "image/jpeg", quality);

      if (!jpegBlob) {
        continue;
      }

      if (jpegBlob.size <= WHATSAPP_INVITATION_MEDIA_SAFE_TARGET_BYTES) {
        return {
          blob: jpegBlob,
          mimeType: "image/jpeg",
          filename: getWhatsAppInvitationMediaFilename(filename, "image/jpeg"),
          width: decoded.width,
          height: decoded.height,
          optimized: true,
          qualityUsed: quality,
        };
      }
    }

    throw new Error("La imagen de WhatsApp sigue superando el límite permitido.");
  } finally {
    decoded.close?.();
  }
}
