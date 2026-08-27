import type { OrganizationMembership } from "@/features/accounts/types";
import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationCategory, AccreditationEnrollment } from "@/features/accreditation/types";
import type { AccreditationWhatsAppDeliveryAttempt } from "../types";
import { normalizeAccreditationInvitationPhone } from "../accreditation-invitation-rules";
import {
  getWhatsAppDeliveryStatusTone,
  type WhatsAppDeliveryStatus,
} from "@/features/access/domain/whatsapp-delivery-tracking";
import type { Sector } from "@/features/domain/types";

export type AccreditationInvitationDeliveryState = "never_sent" | WhatsAppDeliveryStatus;

export type AccreditationInvitationCredentialState = "missing" | "active" | "revoked";

export type AccreditationInvitationOperationalHistoryEntry = {
  attemptNumber: number;
  status: WhatsAppDeliveryStatus;
  statusLabel: string;
  timestamp: string;
  recipient: string;
  operatorDisplayName?: string;
  messageId: string;
  errorSummary?: string;
  tone: "success" | "warning" | "danger" | "info";
};

export type AccreditationInvitationOperationalRow = {
  enrollmentId: string;
  attendeeName: string;
  phone: string;
  normalizedPhone?: string;
  categoryName?: string;
  sectorName?: string;
  credentialState: AccreditationInvitationCredentialState;
  credentialStateLabel: string;
  accessCodePresent: boolean;
  latestDeliveryState: AccreditationInvitationDeliveryState;
  latestDeliveryLabel: string;
  latestDeliveryTone: "success" | "warning" | "danger" | "info";
  latestDeliveryTimestamp?: string;
  latestAttemptNumber?: number;
  canSend: boolean;
  sendDisabledReason?: string;
  actionLabel: string;
  history: AccreditationInvitationOperationalHistoryEntry[];
};

export type AccreditationInvitationOperationalSummary = {
  total: number;
  sendable: number;
  neverSent: number;
  accepted: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  revoked: number;
};

export type AccreditationInvitationOperationalReadModel = {
  eventName: string;
  venueName?: string;
  rows: AccreditationInvitationOperationalRow[];
  summary: AccreditationInvitationOperationalSummary;
};

type BuildOperationalReadModelInput = {
  eventName: string;
  venueName?: string;
  canIssueAccess: boolean;
  enrollments: AccreditationEnrollment[];
  categories: AccreditationCategory[];
  sectors: Pick<Sector, "id" | "name">[];
  accessGrants: AccreditationAccessGrant[];
  deliveryAttempts: AccreditationWhatsAppDeliveryAttempt[];
  profiles: Pick<OrganizationMembership, "id" | "displayName">[];
};

function compareAttemptsDesc(left: AccreditationWhatsAppDeliveryAttempt, right: AccreditationWhatsAppDeliveryAttempt) {
  if (left.attemptNumber !== right.attemptNumber) {
    return right.attemptNumber - left.attemptNumber;
  }

  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }

  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  return 0;
}

function resolveDeliveryTimestamp(attempt: AccreditationWhatsAppDeliveryAttempt) {
  return attempt.readAt ?? attempt.deliveredAt ?? attempt.sentAt ?? attempt.acceptedAt ?? attempt.updatedAt;
}

function resolveAttemptErrorSummary(attempt: AccreditationWhatsAppDeliveryAttempt) {
  if (attempt.deliveryStatus !== "failed") {
    return undefined;
  }

  return attempt.failureMessage || attempt.statusHistory.find((entry) => entry.status === "failed")?.detail || undefined;
}

function buildHistoryEntry(
  attempt: AccreditationWhatsAppDeliveryAttempt,
  operatorDisplayName?: string,
): AccreditationInvitationOperationalHistoryEntry {
  return {
    attemptNumber: attempt.attemptNumber,
    status: attempt.deliveryStatus,
    statusLabel: buildDeliveryStateLabel(attempt.deliveryStatus),
    timestamp: resolveDeliveryTimestamp(attempt),
    recipient: attempt.recipient,
    operatorDisplayName,
    messageId: attempt.messageId,
    errorSummary: resolveAttemptErrorSummary(attempt),
    tone: getWhatsAppDeliveryStatusTone(attempt.deliveryStatus),
  };
}

function getLatestAttempt(attempts: AccreditationWhatsAppDeliveryAttempt[]) {
  return [...attempts].sort(compareAttemptsDesc)[0];
}

function resolveCredentialState(accessGrant?: AccreditationAccessGrant) {
  if (!accessGrant) {
    return {
      credentialState: "missing" as const,
      credentialStateLabel: "Sin acceso",
      accessCodePresent: false,
    };
  }

  if (accessGrant.status === "revoked") {
    return {
      credentialState: "revoked" as const,
      credentialStateLabel: "Revocado",
      accessCodePresent: Boolean(accessGrant.accessCode.trim()),
    };
  }

  return {
    credentialState: "active" as const,
    credentialStateLabel: "Activo",
    accessCodePresent: Boolean(accessGrant.accessCode.trim()),
  };
}

function resolveSendDisabledReason(params: {
  enrollment: AccreditationEnrollment;
  accessGrant: AccreditationAccessGrant | undefined;
  canIssueAccess: boolean;
  normalizedPhone: string | null;
}) {
  const { enrollment, accessGrant, canIssueAccess, normalizedPhone } = params;

  if (!canIssueAccess) {
    return "Sin permiso para enviar";
  }

  if (enrollment.status === "cancelled") {
    return "Acreditación cancelada";
  }

  if (!enrollment.phone?.trim()) {
    return "Sin teléfono";
  }

  if (!normalizedPhone) {
    return "Teléfono inválido";
  }

  if (!accessGrant) {
    return "Sin acceso emitido";
  }

  if (accessGrant.status === "revoked") {
    return "Acceso revocado";
  }

  return undefined;
}

function buildDeliveryStateLabel(state: AccreditationInvitationDeliveryState) {
  switch (state) {
    case "never_sent":
      return "No enviada";
    case "accepted":
      return "Aceptada por WhatsApp";
    case "sent":
      return "Enviada";
    case "delivered":
      return "Entregada";
    case "read":
      return "Leída";
    case "failed":
      return "Falló";
  }
}

export function buildAccreditationInvitationOperationalReadModel(
  input: BuildOperationalReadModelInput,
): AccreditationInvitationOperationalReadModel {
  const categoryById = new Map(input.categories.map((category) => [category.id, category] as const));
  const sectorById = new Map(input.sectors.map((sector) => [sector.id, sector] as const));
  const accessGrantByEnrollmentId = new Map(input.accessGrants.map((grant) => [grant.enrollmentId, grant] as const));
  const attemptsByEnrollmentId = new Map<string, AccreditationWhatsAppDeliveryAttempt[]>();
  const operatorDisplayNameById = new Map(input.profiles.map((profile) => [profile.id, profile.displayName] as const));

  for (const attempt of input.deliveryAttempts) {
    const current = attemptsByEnrollmentId.get(attempt.enrollmentId) ?? [];
    current.push(attempt);
    attemptsByEnrollmentId.set(attempt.enrollmentId, current);
  }

  const rows: AccreditationInvitationOperationalRow[] = input.enrollments.map((enrollment) => {
    const category = enrollment.categoryId ? categoryById.get(enrollment.categoryId) : undefined;
    const sector = enrollment.sectorId ? sectorById.get(enrollment.sectorId) : undefined;
    const accessGrant = accessGrantByEnrollmentId.get(enrollment.id);
    const normalizedPhone = normalizeAccreditationInvitationPhone(enrollment.phone ?? undefined);
    const attempts = attemptsByEnrollmentId.get(enrollment.id) ?? [];
    const latestAttempt = getLatestAttempt(attempts);
    const history = [...attempts].sort(compareAttemptsDesc).map((attempt) => buildHistoryEntry(attempt, operatorDisplayNameById.get(attempt.operatorProfileId)));
    const credentialState = resolveCredentialState(accessGrant);
    const sendDisabledReason = resolveSendDisabledReason({
      enrollment,
      accessGrant,
      canIssueAccess: input.canIssueAccess,
      normalizedPhone,
    });
    const canSend = Boolean(
      input.canIssueAccess &&
        !sendDisabledReason &&
        (accessGrant ? true : false) &&
        enrollment.status === "active" &&
        accessGrant?.status !== "revoked" &&
        normalizedPhone,
    );

    return {
      enrollmentId: enrollment.id,
      attendeeName: enrollment.name,
      phone: enrollment.phone?.trim() || "Sin teléfono",
      normalizedPhone: normalizedPhone ?? undefined,
      categoryName: category?.name,
      sectorName: sector?.name,
      ...credentialState,
      latestDeliveryState: latestAttempt?.deliveryStatus ?? "never_sent",
      latestDeliveryLabel: latestAttempt ? buildDeliveryStateLabel(latestAttempt.deliveryStatus) : "No enviada",
      latestDeliveryTone: latestAttempt ? getWhatsAppDeliveryStatusTone(latestAttempt.deliveryStatus) : "warning",
      latestDeliveryTimestamp: latestAttempt ? resolveDeliveryTimestamp(latestAttempt) : undefined,
      latestAttemptNumber: latestAttempt?.attemptNumber,
      canSend,
      sendDisabledReason,
      actionLabel: latestAttempt ? "Reenviar invitación" : "Enviar invitación",
      history,
    };
  });

  const summary = rows.reduce<AccreditationInvitationOperationalSummary>(
    (accumulator, row) => {
      accumulator.total += 1;
      accumulator.sendable += row.canSend ? 1 : 0;

      if (row.latestDeliveryState === "never_sent") {
        accumulator.neverSent += 1;
      } else if (row.latestDeliveryState === "accepted") {
        accumulator.accepted += 1;
      } else if (row.latestDeliveryState === "sent") {
        accumulator.sent += 1;
      } else if (row.latestDeliveryState === "delivered") {
        accumulator.delivered += 1;
      } else if (row.latestDeliveryState === "read") {
        accumulator.read += 1;
      } else if (row.latestDeliveryState === "failed") {
        accumulator.failed += 1;
      }

      if (row.credentialState === "revoked") {
        accumulator.revoked += 1;
      }

      return accumulator;
    },
    {
      total: 0,
      sendable: 0,
      neverSent: 0,
      accepted: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      revoked: 0,
    },
  );

  return {
    eventName: input.eventName,
    venueName: input.venueName,
    rows,
    summary,
  };
}

export function getAccreditationInvitationDeliveryLabel(state: AccreditationInvitationDeliveryState) {
  return buildDeliveryStateLabel(state);
}

export function getAccreditationInvitationDeliveryTone(state: AccreditationInvitationDeliveryState) {
  return state === "never_sent" ? "warning" : getWhatsAppDeliveryStatusTone(state);
}
