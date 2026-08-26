import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import { normalizeWhatsAppPhoneNumber } from "@/features/access/domain/whatsapp-delivery";

import type {
  AccreditationInvitationEligibility,
  AccreditationInvitationSendContext,
} from "./types";

export function normalizeAccreditationInvitationPhone(input?: string | null) {
  return normalizeWhatsAppPhoneNumber(input);
}

export function resolveAccreditationInvitationEligibility(
  context: AccreditationInvitationSendContext,
): AccreditationInvitationEligibility {
  const recipient = normalizeAccreditationInvitationPhone(context.enrollment.phone);

  if (context.enrollment.status === "cancelled") {
    return {
      canSend: false,
      recipient: recipient ?? undefined,
      reason: "enrollment_cancelled",
    };
  }

  if (context.accessGrant.status === "revoked") {
    return {
      canSend: false,
      recipient: recipient ?? undefined,
      reason: "grant_revoked",
    };
  }

  if (!context.enrollment.phone?.trim()) {
    return {
      canSend: false,
      reason: "missing_whatsapp",
    };
  }

  if (!recipient) {
    return {
      canSend: false,
      reason: "invalid_whatsapp",
    };
  }

  return {
    canSend: true,
    recipient,
  };
}

export function assertAccreditationInvitationEligibility(context: AccreditationInvitationSendContext) {
  const eligibility = resolveAccreditationInvitationEligibility(context);

  if (!eligibility.canSend) {
    throw new Error(
      eligibility.reason === "missing_whatsapp"
        ? "La persona inscrita no tiene un WhatsApp válido."
        : eligibility.reason === "invalid_whatsapp"
          ? "La persona inscrita no tiene un WhatsApp válido."
          : eligibility.reason === "enrollment_cancelled"
            ? "La inscripción está cancelada."
            : "El cupo de acreditación fue revocado.",
    );
  }

  return eligibility as Required<AccreditationInvitationEligibility>;
}

export function isAccreditationInvitationSendable(
  enrollment: Pick<AccreditationEnrollment, "phone" | "status">,
  accessGrant: Pick<AccreditationAccessGrant, "status">,
) {
  return resolveAccreditationInvitationEligibility({
    enrollment,
    accessGrant,
    eventName: "",
  } as AccreditationInvitationSendContext).canSend;
}
