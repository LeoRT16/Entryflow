"use client";

import { renderReservationWhatsAppInvitationMedia, type ReservationWhatsAppInvitationMediaResult } from "@/features/access/domain/whatsapp-reservation-invitation-media";
import type { ReservationWhatsAppInvitationCandidate } from "@/features/access/domain/whatsapp-reservation-invitations";
import { getWhatsAppDeliveryAcceptedMessage } from "@/features/access/domain/whatsapp-reservation-invitations";

export type ReservationWhatsAppInvitationDeliveryResult = {
  ok: true;
  providerAccepted: true;
  status: "accepted";
  guestId: string;
  accessCode: string;
  mediaId: string;
  messageId: string;
  trackingPersisted: boolean;
  detail: string;
  warning?: {
    code: "accepted_but_tracking_failed";
    message: string;
  };
  invitation: ReservationWhatsAppInvitationMediaResult;
};

export class ReservationWhatsAppInvitationDeliveryError extends Error {
  stage:
    | "render_failed"
    | "media_upload_failed"
    | "invalid_media_response"
    | "send_failed"
    | "invalid_send_response";

  constructor(
    stage:
      | "render_failed"
      | "media_upload_failed"
      | "invalid_media_response"
      | "send_failed"
      | "invalid_send_response",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ReservationWhatsAppInvitationDeliveryError";
    this.stage = stage;
  }
}

type MediaUploadResponsePayload = {
  ok?: boolean;
  mediaId?: string;
  error?: { message?: string };
};

type SendResponsePayload = {
  ok?: boolean;
  providerAccepted?: boolean;
  status?: "accepted";
  trackingPersisted?: boolean;
  messageId?: string;
  warning?: {
    code?: string;
    message?: string;
  };
  error?: { message?: string };
};

export type ReservationWhatsAppInvitationDeliveryDependencies = {
  invitationNode?: HTMLElement;
  renderReservationWhatsAppInvitationMediaImpl?: typeof renderReservationWhatsAppInvitationMedia;
  fetchImpl?: typeof fetch;
};

export async function sendReservationWhatsAppInvitation(
  candidate: ReservationWhatsAppInvitationCandidate,
  currentEventName: string,
  dependencies: ReservationWhatsAppInvitationDeliveryDependencies = {},
): Promise<ReservationWhatsAppInvitationDeliveryResult> {
  const renderReservationWhatsAppInvitationMediaImpl =
    dependencies.renderReservationWhatsAppInvitationMediaImpl ?? renderReservationWhatsAppInvitationMedia;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const renderedInvitation = await renderReservationWhatsAppInvitationMediaImpl(candidate, {
    invitationNode: dependencies.invitationNode as HTMLElement,
  }).catch((error: unknown) => {
    throw new ReservationWhatsAppInvitationDeliveryError(
      "render_failed",
      error instanceof Error ? error.message : "No se pudo preparar la invitación para WhatsApp.",
      { cause: error },
    );
  });

  const formData = new FormData();
  formData.append(
    "file",
    new File([renderedInvitation.mediaAsset.blob], renderedInvitation.mediaAsset.filename, {
      type: renderedInvitation.mediaAsset.mimeType,
    }),
  );

  const mediaResponse = await fetchImpl("/api/whatsapp/media", {
    method: "POST",
    body: formData,
  });
  const mediaPayload = (await mediaResponse.json().catch(() => null)) as MediaUploadResponsePayload | null;

  if (!mediaResponse.ok) {
    throw new ReservationWhatsAppInvitationDeliveryError(
      "media_upload_failed",
      mediaPayload?.error?.message ?? "No se pudo subir la imagen de WhatsApp.",
    );
  }

  if (!mediaPayload?.ok || !mediaPayload.mediaId) {
    throw new ReservationWhatsAppInvitationDeliveryError(
      "invalid_media_response",
      mediaPayload?.error?.message ?? "No se pudo subir la imagen de WhatsApp.",
    );
  }

  const sendResponse = await fetchImpl("/api/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guestId: renderedInvitation.guestId,
      recipient: candidate.recipient,
      guestName: candidate.guest.guestName,
      eventName: currentEventName,
      accessCode: renderedInvitation.accessCode,
      mediaId: mediaPayload.mediaId,
    }),
  });
  const sendPayload = (await sendResponse.json().catch(() => null)) as SendResponsePayload | null;

  if (!sendResponse.ok) {
    throw new ReservationWhatsAppInvitationDeliveryError(
      "send_failed",
      sendPayload?.error?.message ?? "No se pudo enviar la invitación por WhatsApp.",
    );
  }

  if (!sendPayload?.ok || !sendPayload.messageId) {
    throw new ReservationWhatsAppInvitationDeliveryError(
      "invalid_send_response",
      sendPayload?.error?.message ?? "No se pudo enviar la invitación por WhatsApp.",
    );
  }

  const trackingPersisted = Boolean(sendPayload.trackingPersisted);
  const detail = getWhatsAppDeliveryAcceptedMessage(trackingPersisted);

  return {
    ok: true,
    providerAccepted: true,
    status: "accepted",
    guestId: renderedInvitation.guestId,
    accessCode: renderedInvitation.accessCode,
    mediaId: mediaPayload.mediaId,
    messageId: sendPayload.messageId,
    trackingPersisted,
    detail,
    warning: trackingPersisted
      ? undefined
      : {
          code: "accepted_but_tracking_failed",
          message:
            sendPayload.warning?.message ?? "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.",
        },
    invitation: renderedInvitation,
  };
}
