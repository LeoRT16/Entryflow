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
