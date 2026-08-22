"use client";

import type { InvitationImageBlobResult } from "@/features/access/domain/invitation-image-export";
import { renderInvitationImageBlob, waitForInvitationImageNodeReady } from "@/features/access/domain/invitation-image-export";
import { getInvitationDownloadFilename } from "@/features/access/domain/invitation-rendering";
import {
  prepareWhatsAppInvitationMediaBlob,
  type WhatsAppInvitationMediaOptimizationResult,
} from "@/features/access/domain/whatsapp-invitation-media";
import type { ReservationWhatsAppInvitationCandidate } from "@/features/access/domain/whatsapp-reservation-invitations";

const WHATSAPP_INVITATION_RENDER_MIN_BYTES = 2048;

export class ReservationWhatsAppInvitationRenderError extends Error {
  stage:
    | "identity_mismatch"
    | "node_not_connected"
    | "layout_not_ready"
    | "image_not_ready"
    | "empty_blob"
    | "invalid_blob";

  constructor(
    stage:
      | "identity_mismatch"
      | "node_not_connected"
      | "layout_not_ready"
      | "image_not_ready"
      | "empty_blob"
      | "invalid_blob",
    message: string,
  ) {
    super(message);
    this.name = "ReservationWhatsAppInvitationRenderError";
    this.stage = stage;
  }
}

export type ReservationWhatsAppInvitationMediaResult = {
  guestId: string;
  accessCode: string;
  invitationImage: InvitationImageBlobResult;
  mediaAsset: WhatsAppInvitationMediaOptimizationResult;
};

export type ReservationWhatsAppInvitationMediaDependencies = {
  invitationNode?: HTMLElement;
  renderInvitationImageBlobImpl?: typeof renderInvitationImageBlob;
  prepareWhatsAppInvitationMediaBlobImpl?: typeof prepareWhatsAppInvitationMediaBlob;
};

function assertReservationInvitationIdentity(node: HTMLElement, candidate: ReservationWhatsAppInvitationCandidate) {
  const guestId = node.dataset.exportGuestId?.trim() ?? "";
  const accessCode = node.dataset.exportAccessCode?.trim() ?? "";

  if (guestId !== candidate.guest.id || accessCode !== candidate.accessCode) {
    throw new ReservationWhatsAppInvitationRenderError(
      "identity_mismatch",
      "No se pudo preparar la invitación para WhatsApp.",
    );
  }
}

function validateReservationInvitationBlob(blob: Blob) {
  const mimeType = blob.type || "";

  if (!mimeType || (mimeType !== "image/png" && mimeType !== "image/jpeg")) {
    throw new ReservationWhatsAppInvitationRenderError("invalid_blob", "No se pudo generar la imagen de la invitación.");
  }

  if (blob.size < WHATSAPP_INVITATION_RENDER_MIN_BYTES) {
    throw new ReservationWhatsAppInvitationRenderError("empty_blob", "No se pudo generar la imagen de la invitación.");
  }
}

export async function renderReservationWhatsAppInvitationMedia(
  candidate: ReservationWhatsAppInvitationCandidate,
  dependencies: ReservationWhatsAppInvitationMediaDependencies = {},
): Promise<ReservationWhatsAppInvitationMediaResult> {
  if (candidate.invitation.id !== candidate.guest.id) {
    throw new ReservationWhatsAppInvitationRenderError("identity_mismatch", "No se pudo preparar la invitación para WhatsApp.");
  }

  if (candidate.invitation.uniqueCode !== candidate.accessCode) {
    throw new ReservationWhatsAppInvitationRenderError("identity_mismatch", "No se pudo preparar la invitación para WhatsApp.");
  }

  const invitationNode = dependencies.invitationNode;
  const renderInvitation = dependencies.renderInvitationImageBlobImpl ?? renderInvitationImageBlob;
  const prepareMedia = dependencies.prepareWhatsAppInvitationMediaBlobImpl ?? prepareWhatsAppInvitationMediaBlob;
  if (!invitationNode) {
    throw new ReservationWhatsAppInvitationRenderError("layout_not_ready", "No se pudo preparar la invitación para WhatsApp.");
  }

  if (!invitationNode.isConnected) {
    throw new ReservationWhatsAppInvitationRenderError("node_not_connected", "No se pudo preparar la invitación para WhatsApp.");
  }

  assertReservationInvitationIdentity(invitationNode, candidate);
  await waitForInvitationImageNodeReady(invitationNode);

  const invitationImage = await renderInvitation(invitationNode, {
    filename: getInvitationDownloadFilename(candidate.accessCode),
  });
  validateReservationInvitationBlob(invitationImage.blob);
  const mediaAsset = await prepareMedia(invitationImage.blob, invitationImage.filename);

  return {
    guestId: candidate.guest.id,
    accessCode: candidate.accessCode,
    invitationImage,
    mediaAsset,
  };
}
