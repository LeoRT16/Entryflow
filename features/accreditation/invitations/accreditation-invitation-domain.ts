import { createUuid, nowIso } from "@/lib/supabase/helpers";
import { getWhatsAppDeliveryStatusDetail } from "@/features/access/domain/whatsapp-delivery-tracking";
import type {
  AccreditationWhatsAppDeliveryAttempt,
  AccreditationWhatsAppDeliveryAttemptInput,
  AccreditationInvitationSendContext,
} from "./types";
import { resolveAccreditationInvitationEligibility } from "./accreditation-invitation-rules";

export function resolveAccreditationInvitationSendContext(
  context: AccreditationInvitationSendContext,
) {
  return {
    ...context,
    eligibility: resolveAccreditationInvitationEligibility(context),
  };
}

export function buildAccreditationWhatsAppDeliveryAttempt(
  input: AccreditationWhatsAppDeliveryAttemptInput,
  clock: () => string = nowIso,
): AccreditationWhatsAppDeliveryAttempt {
  const timestamp = input.createdAt ?? clock();
  const acceptedAt = input.acceptedAt ?? timestamp;

  return {
    id: input.id ?? createUuid(),
    organizationId: input.organizationId,
    eventId: input.eventId,
    enrollmentId: input.enrollmentId,
    accessGrantId: input.accessGrantId,
    operatorProfileId: input.operatorProfileId,
    recipient: input.recipient.trim(),
    accessCode: input.accessCode.trim(),
    qrToken: input.qrToken.trim(),
    messageId: input.messageId.trim(),
    attemptNumber: input.attemptNumber ?? 1,
    deliveryStatus: input.deliveryStatus ?? "accepted",
    statusHistory:
      input.statusHistory ??
      [
        {
          status: "accepted",
          timestamp: acceptedAt,
          detail: getWhatsAppDeliveryStatusDetail("accepted"),
        },
      ],
    acceptedAt,
    sentAt: input.sentAt ?? undefined,
    deliveredAt: input.deliveredAt ?? undefined,
    readAt: input.readAt ?? undefined,
    failedAt: input.failedAt ?? undefined,
    failureCode: input.failureCode ?? undefined,
    failureMessage: input.failureMessage ?? undefined,
    failureDetails: input.failureDetails ?? undefined,
    templateName: input.templateName.trim(),
    templateLanguage: input.templateLanguage.trim(),
    mediaId: input.mediaId?.trim() || undefined,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    deletedAt: input.deletedAt ?? null,
  };
}
