import type { GuestRecord } from "@/features/customers/types";
import { getLegacyWhatsAppDeliveryStatus } from "@/features/access/domain/whatsapp-delivery-tracking";

export type WhatsAppSendAcceptanceStatus = "accepted" | "accepted_but_tracking_failed";

export type WhatsAppSendAcceptanceResponse = {
  ok: true;
  providerAccepted: true;
  trackingPersisted: boolean;
  status: WhatsAppSendAcceptanceStatus;
  warning?: {
    code: "accepted_but_tracking_failed";
    message: string;
  };
};

export type WhatsAppDeliveryAttemptUpsertOutcome = {
  data: { id: string } | null;
  error: { code?: string; message: string } | null;
};

export type WhatsAppTrackingPersistenceResolution =
  | {
      trackingPersisted: true;
      rowId: string;
      branch: "persisted";
    }
  | {
      trackingPersisted: false;
      rowId?: string;
      branch: "upsert_error" | "missing_row";
      error?: { code?: string; message: string };
    };

export function buildWhatsAppSendAcceptedGuestUpdate(params: {
  guest: GuestRecord;
  attemptNumber: number;
  acceptedAt: string;
  messageId: string;
  trackingPersisted: boolean;
}) {
  const legacyDeliveryStatus = getLegacyWhatsAppDeliveryStatus("accepted", params.attemptNumber);
  const trackingWarning = "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.";

  return {
    ...params.guest,
    deliveryStatus: legacyDeliveryStatus,
    noInvitationSent: false,
    recentChange: true,
    deliveryHistory: [
      ...params.guest.deliveryHistory,
      {
        time: params.acceptedAt.slice(11, 16),
        title: legacyDeliveryStatus,
        detail: params.trackingPersisted ? "Envío por WhatsApp aceptado por proveedor" : trackingWarning,
      },
    ],
    whatsappDelivery: {
      messageId: params.messageId,
      attemptNumber: params.attemptNumber,
      currentStatus: "accepted" as const,
      updatedAt: params.acceptedAt,
      acceptedAt: params.acceptedAt,
    },
  };
}

export function buildWhatsAppSendAcceptanceResponse(trackingPersisted: boolean): WhatsAppSendAcceptanceResponse {
  if (trackingPersisted) {
    return {
      ok: true,
      providerAccepted: true,
      trackingPersisted: true,
      status: "accepted",
    };
  }

  return {
    ok: true,
    providerAccepted: true,
    trackingPersisted: false,
    status: "accepted_but_tracking_failed",
    warning: {
      code: "accepted_but_tracking_failed",
      message: "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.",
    },
  };
}

export function resolveWhatsAppTrackingPersistence(outcome: WhatsAppDeliveryAttemptUpsertOutcome): WhatsAppTrackingPersistenceResolution {
  if (outcome.error) {
    return {
      trackingPersisted: false,
      branch: "upsert_error",
      error: outcome.error,
    };
  }

  const rowId = outcome.data?.id?.trim() ?? "";

  if (!rowId) {
    return {
      trackingPersisted: false,
      branch: "missing_row",
    };
  }

  return {
    trackingPersisted: true,
    rowId,
    branch: "persisted",
  };
}
