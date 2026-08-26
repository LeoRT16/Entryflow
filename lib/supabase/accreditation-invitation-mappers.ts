import type { Json } from "@/lib/supabase/types";

import type {
  AccreditationWhatsAppDeliveryAttempt,
  AccreditationWhatsAppDeliveryAttemptRow,
} from "@/features/accreditation/invitations";

function toMetadata(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toJson(value?: Record<string, unknown> | null) {
  return value ? (value as Json) : null;
}

function toHistory(value: Json | null | undefined) {
  return Array.isArray(value) ? (value as AccreditationWhatsAppDeliveryAttempt["statusHistory"]) : [];
}

export function mapAccreditationWhatsAppDeliveryAttemptRowToDomain(
  row: AccreditationWhatsAppDeliveryAttemptRow,
): AccreditationWhatsAppDeliveryAttempt {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    enrollmentId: row.enrollment_id,
    accessGrantId: row.access_grant_id,
    operatorProfileId: row.operator_profile_id,
    recipient: row.recipient,
    accessCode: row.access_code,
    qrToken: row.qr_token,
    messageId: row.message_id,
    attemptNumber: row.attempt_number,
    deliveryStatus: row.delivery_status,
    statusHistory: toHistory(row.status_history),
    acceptedAt: row.accepted_at ?? undefined,
    sentAt: row.sent_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    failureCode: row.failure_code ?? undefined,
    failureMessage: row.failure_message ?? undefined,
    failureDetails: toMetadata(row.failure_details),
    templateName: row.template_name,
    templateLanguage: row.template_language,
    mediaId: row.media_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapAccreditationWhatsAppDeliveryAttemptToRow(
  attempt: AccreditationWhatsAppDeliveryAttempt,
): Omit<AccreditationWhatsAppDeliveryAttemptRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: attempt.id,
    organization_id: attempt.organizationId,
    event_id: attempt.eventId,
    enrollment_id: attempt.enrollmentId,
    access_grant_id: attempt.accessGrantId,
    operator_profile_id: attempt.operatorProfileId,
    recipient: attempt.recipient,
    access_code: attempt.accessCode,
    qr_token: attempt.qrToken,
    message_id: attempt.messageId,
    attempt_number: attempt.attemptNumber,
    delivery_status: attempt.deliveryStatus,
    status_history: attempt.statusHistory as Json,
    accepted_at: attempt.acceptedAt ?? null,
    sent_at: attempt.sentAt ?? null,
    delivered_at: attempt.deliveredAt ?? null,
    read_at: attempt.readAt ?? null,
    failed_at: attempt.failedAt ?? null,
    failure_code: attempt.failureCode ?? null,
    failure_message: attempt.failureMessage ?? null,
    failure_details: toJson(attempt.failureDetails),
    template_name: attempt.templateName,
    template_language: attempt.templateLanguage,
    media_id: attempt.mediaId ?? null,
  };
}
