"use client";

import { toBlob } from "html-to-image";

import { waitForInvitationFontsReady } from "@/features/events/domain/invitation-fonts";

export type InvitationImageBlobResult = {
  blob: Blob;
  mimeType: string;
  filename: string;
};

export type InvitationImageExportOptions = {
  filename: string;
  mimeType?: string;
  pixelRatio?: number;
  backgroundColor?: string;
  cacheBust?: boolean;
};

type HtmlToImageToBlob = typeof toBlob;
type WaitForInvitationFontsReady = typeof waitForInvitationFontsReady;

const INVITATION_READY_PAINT_FRAMES = 2;

export type InvitationImageReadyDependencies = {
  requestAnimationFrameImpl?: typeof requestAnimationFrame;
};

async function waitForInvitationPaint(requestAnimationFrameImpl: typeof requestAnimationFrame) {
  if (typeof requestAnimationFrameImpl !== "function") {
    return;
  }

  await new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      requestAnimationFrameImpl(() => step(remaining - 1));
    };

    step(INVITATION_READY_PAINT_FRAMES);
  });
}

async function waitForInvitationImagesReady(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));

  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        return;
      }

      if (typeof image.decode === "function") {
        await image.decode().catch(() => undefined);
      }

      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const onLoad = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("No se pudo preparar la imagen de la invitación."));
        };
        const cleanup = () => {
          image.removeEventListener("load", onLoad);
          image.removeEventListener("error", onError);
        };

        image.addEventListener("load", onLoad, { once: true });
        image.addEventListener("error", onError, { once: true });
      });
    }),
  );
}

export async function waitForInvitationImageNodeReady(
  node: HTMLElement,
  dependencies: InvitationImageReadyDependencies = {},
) {
  if (!node.isConnected) {
    throw new Error("No se pudo preparar la imagen de la invitación.");
  }

  await waitForInvitationImagesReady(node);
  const requestAnimationFrameImpl = dependencies.requestAnimationFrameImpl ?? globalThis.requestAnimationFrame;

  await waitForInvitationPaint(requestAnimationFrameImpl);

  const rect = node.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error("No se pudo preparar la imagen de la invitación.");
  }
}

export async function renderInvitationImageBlob(
  node: HTMLElement,
  options: InvitationImageExportOptions,
  dependencies?: {
    toBlobImpl?: HtmlToImageToBlob;
    waitForFontsReady?: WaitForInvitationFontsReady;
  },
): Promise<InvitationImageBlobResult> {
  const toBlobImpl = dependencies?.toBlobImpl ?? toBlob;
  const waitForFontsReady = dependencies?.waitForFontsReady ?? waitForInvitationFontsReady;

  await waitForFontsReady();

  const blob = await toBlobImpl(node, {
    cacheBust: options.cacheBust ?? true,
    pixelRatio: options.pixelRatio ?? 1,
    backgroundColor: options.backgroundColor ?? "#0b111a",
    type: options.mimeType ?? "image/png",
  });

  if (!blob) {
    throw new Error("No se pudo generar la imagen de la invitación.");
  }

  return {
    blob,
    mimeType: blob.type || options.mimeType || "image/png",
    filename: options.filename,
  };
}
