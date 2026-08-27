import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type { Json } from "@/lib/supabase/types";
import type { WhatsAppDeliveryHistoryEntry, WhatsAppDeliveryStatus } from "@/features/access/domain/whatsapp-delivery-tracking";

export type AccreditationInvitationSendBlockReason =
  | "missing_whatsapp"
  | "invalid_whatsapp"
  | "enrollment_cancelled"
  | "grant_revoked";

export type AccreditationInvitationEligibility = {
  canSend: boolean;
  recipient?: string;
  reason?: AccreditationInvitationSendBlockReason;
};

export type AccreditationInvitationWhatsAppTemplateConfig = {
  templateName: string;
  templateLanguage: string;
};

export type AccreditationWhatsAppDeliveryAttempt = {
  id: string;
  organizationId: string;
  eventId: string;
  enrollmentId: string;
  accessGrantId: string;
  operatorProfileId: string;
  recipient: string;
  accessCode: string;
  qrToken: string;
  messageId: string;
  attemptNumber: number;
  deliveryStatus: WhatsAppDeliveryStatus;
  statusHistory: WhatsAppDeliveryHistoryEntry[];
  acceptedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
  failureDetails?: Record<string, unknown>;
  templateName: string;
  templateLanguage: string;
  mediaId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AccreditationWhatsAppDeliveryAttemptInput = {
  id?: string;
  organizationId: string;
  eventId: string;
  enrollmentId: string;
  accessGrantId: string;
  operatorProfileId: string;
  recipient: string;
  accessCode: string;
  qrToken: string;
  messageId: string;
  attemptNumber?: number;
  deliveryStatus?: WhatsAppDeliveryStatus;
  statusHistory?: WhatsAppDeliveryHistoryEntry[];
  acceptedAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  failureDetails?: Record<string, unknown> | null;
  templateName: string;
  templateLanguage: string;
  mediaId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type AccreditationWhatsAppDeliveryAttemptRow = {
  id: string;
  organization_id: string;
  event_id: string;
  enrollment_id: string;
  access_grant_id: string;
  operator_profile_id: string;
  recipient: string;
  access_code: string;
  qr_token: string;
  message_id: string;
  attempt_number: number;
  delivery_status: WhatsAppDeliveryStatus;
  status_history: Json;
  accepted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  failure_details: Json | null;
  template_name: string;
  template_language: string;
  media_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AccreditationInvitationDeliveryRepository = {
  create(attempt: AccreditationWhatsAppDeliveryAttempt): Promise<AccreditationWhatsAppDeliveryAttempt>;
  getByMessageId(scope: { organizationId: string; eventId: string }, messageId: string): Promise<AccreditationWhatsAppDeliveryAttempt | undefined>;
  listByEnrollment(scope: { organizationId: string; eventId: string }, enrollmentId: string): Promise<AccreditationWhatsAppDeliveryAttempt[]>;
  listByEvent(scope: { organizationId: string; eventId: string }): Promise<AccreditationWhatsAppDeliveryAttempt[]>;
};

export type AccreditationInvitationScope = {
  organizationId: string;
  eventId: string;
};

export type AccreditationInvitationSendContext = {
  enrollment: Pick<AccreditationEnrollment, "id" | "organizationId" | "eventId" | "name" | "phone" | "status">;
  accessGrant: Pick<AccreditationAccessGrant, "id" | "organizationId" | "eventId" | "accessCode" | "qrToken" | "status">;
  eventName: string;
};
