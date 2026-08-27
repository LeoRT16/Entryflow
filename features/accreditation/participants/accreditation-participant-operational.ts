import type { OrganizationMembership } from "@/features/accounts/types";
import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationCategory, AccreditationEnrollment } from "@/features/accreditation/types";
import type { AccreditationCheckIn } from "@/features/accreditation/check-in";
import type { AccreditationWhatsAppDeliveryAttempt } from "@/features/accreditation/invitations";
import { getAccreditationInvitationDeliveryLabel, getAccreditationInvitationDeliveryTone } from "@/features/accreditation/invitations";
import type { Event } from "@/features/domain/types";
import { buildAccreditationEventProfile, isAccreditationPhase2EventType, type AccreditationEventProfile } from "../events/accreditation-event-profile";
import {
  mergeAccreditationParticipantMetadata,
  resolveAccreditationParticipantProfile,
  type AccreditationParticipantProfile,
  type AccreditationParticipantProfileInput,
} from "./accreditation-participant-profile";

export type AccreditationParticipantInvitationState = "never_sent" | AccreditationWhatsAppDeliveryAttempt["deliveryStatus"];

export type AccreditationParticipantCheckInState = "not_checked_in" | "checked_in";

export type AccreditationParticipantOperationalRow = {
  enrollmentId: string;
  displayName: string;
  participantName: string;
  email?: string;
  phone?: string;
  categoryId?: string;
  categoryName?: string;
  status: AccreditationEnrollment["status"];
  statusLabel: string;
  profile: AccreditationParticipantProfile;
  credentialState: "missing" | "active" | "revoked";
  credentialStateLabel: string;
  invitationState: AccreditationParticipantInvitationState;
  invitationStateLabel: string;
  invitationTone: "success" | "warning" | "danger" | "info";
  invitationTimestamp?: string;
  checkInState: AccreditationParticipantCheckInState;
  checkInStateLabel: string;
  checkInTimestamp?: string;
  checkInSource?: AccreditationCheckIn["source"];
  accessCodePresent: boolean;
  qrTokenPresent: boolean;
  canEdit: boolean;
  canCancel: boolean;
};

export type AccreditationParticipantOperationalSummary = {
  total: number;
  active: number;
  cancelled: number;
  credentialActive: number;
  credentialRevoked: number;
  credentialMissing: number;
  invited: number;
  checkedIn: number;
};

export type AccreditationParticipantOperationalReadModel = {
  eventProfile: AccreditationEventProfile;
  rows: AccreditationParticipantOperationalRow[];
  summary: AccreditationParticipantOperationalSummary;
};

type BuildAccreditationParticipantOperationalReadModelInput = {
  event: Pick<Event, "id" | "name" | "eventType" | "operationalModel" | "startAt" | "endAt" | "timezone" | "venue">;
  canEdit: boolean;
  canCancel: boolean;
  enrollments: AccreditationEnrollment[];
  categories: AccreditationCategory[];
  accessGrants: AccreditationAccessGrant[];
  deliveryAttempts: AccreditationWhatsAppDeliveryAttempt[];
  checkIns: AccreditationCheckIn[];
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

function compareCheckInsDesc(left: AccreditationCheckIn, right: AccreditationCheckIn) {
  if (left.checkedInAt !== right.checkedInAt) {
    return left.checkedInAt < right.checkedInAt ? 1 : -1;
  }

  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }

  return 0;
}

function resolveCredentialState(accessGrant?: AccreditationAccessGrant) {
  if (!accessGrant) {
    return {
      credentialState: "missing" as const,
      credentialStateLabel: "Sin acceso",
      accessCodePresent: false,
      qrTokenPresent: false,
    };
  }

  if (accessGrant.status === "revoked") {
    return {
      credentialState: "revoked" as const,
      credentialStateLabel: "Revocado",
      accessCodePresent: Boolean(accessGrant.accessCode.trim()),
      qrTokenPresent: Boolean(accessGrant.qrToken.trim()),
    };
  }

  return {
    credentialState: "active" as const,
    credentialStateLabel: "Activo",
    accessCodePresent: Boolean(accessGrant.accessCode.trim()),
    qrTokenPresent: Boolean(accessGrant.qrToken.trim()),
  };
}

function buildCheckInState(checkIn?: AccreditationCheckIn) {
  if (!checkIn) {
    return {
      checkInState: "not_checked_in" as const,
      checkInStateLabel: "Sin ingreso",
      checkInTimestamp: undefined,
      checkInSource: undefined,
    };
  }

  return {
    checkInState: "checked_in" as const,
    checkInStateLabel: "Ingresado",
    checkInTimestamp: checkIn.checkedInAt,
    checkInSource: checkIn.source,
  };
}

export function buildAccreditationParticipantOperationalReadModel(
  input: BuildAccreditationParticipantOperationalReadModelInput,
): AccreditationParticipantOperationalReadModel | null {
  if (!isAccreditationPhase2EventType(input.event.eventType)) {
    return null;
  }

  const categoryById = new Map(input.categories.map((category) => [category.id, category] as const));
  const accessGrantByEnrollmentId = new Map(input.accessGrants.map((grant) => [grant.enrollmentId, grant] as const));
  const attemptsByEnrollmentId = new Map<string, AccreditationWhatsAppDeliveryAttempt[]>();
  const checkInByEnrollmentId = new Map<string, AccreditationCheckIn>();

  for (const attempt of input.deliveryAttempts) {
    const current = attemptsByEnrollmentId.get(attempt.enrollmentId) ?? [];
    current.push(attempt);
    attemptsByEnrollmentId.set(attempt.enrollmentId, current);
  }

  for (const checkIn of input.checkIns) {
    const current = checkInByEnrollmentId.get(checkIn.enrollmentId);

    if (!current || compareCheckInsDesc(checkIn, current) < 0) {
      checkInByEnrollmentId.set(checkIn.enrollmentId, checkIn);
    }
  }

  const rows: AccreditationParticipantOperationalRow[] = input.enrollments
    .map((enrollment) => {
      const category = enrollment.categoryId ? categoryById.get(enrollment.categoryId) : undefined;
      const accessGrant = accessGrantByEnrollmentId.get(enrollment.id);
      const attempts = attemptsByEnrollmentId.get(enrollment.id) ?? [];
      const latestAttempt = [...attempts].sort(compareAttemptsDesc)[0];
      const latestCheckIn = checkInByEnrollmentId.get(enrollment.id);
      const profile = resolveAccreditationParticipantProfile(enrollment.metadata);
      const credentialState = resolveCredentialState(accessGrant);
      const checkInState = buildCheckInState(latestCheckIn);

      return {
        enrollmentId: enrollment.id,
        displayName: profile.badgeName || enrollment.name,
        participantName: enrollment.name,
        email: enrollment.email ?? undefined,
        phone: enrollment.phone ?? undefined,
        categoryId: enrollment.categoryId ?? undefined,
        categoryName: category?.name,
        status: enrollment.status,
        statusLabel: enrollment.status === "active" ? "Activo" : "Cancelado",
        profile,
        ...credentialState,
        invitationState: latestAttempt?.deliveryStatus ?? "never_sent",
        invitationStateLabel: latestAttempt
          ? getAccreditationInvitationDeliveryLabel(latestAttempt.deliveryStatus)
          : "No enviada",
        invitationTone: latestAttempt
          ? getAccreditationInvitationDeliveryTone(latestAttempt.deliveryStatus)
          : "warning",
        invitationTimestamp: latestAttempt?.acceptedAt ?? undefined,
        ...checkInState,
        canEdit: input.canEdit,
        canCancel: input.canCancel,
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
      }

      return left.displayName.localeCompare(right.displayName, "es-BO");
    });

  const summary = rows.reduce<AccreditationParticipantOperationalSummary>(
    (accumulator, row) => {
      accumulator.total += 1;
      accumulator.active += row.status === "active" ? 1 : 0;
      accumulator.cancelled += row.status === "cancelled" ? 1 : 0;
      accumulator.credentialActive += row.credentialState === "active" ? 1 : 0;
      accumulator.credentialRevoked += row.credentialState === "revoked" ? 1 : 0;
      accumulator.credentialMissing += row.credentialState === "missing" ? 1 : 0;
      accumulator.invited += row.invitationState === "never_sent" ? 0 : 1;
      accumulator.checkedIn += row.checkInState === "checked_in" ? 1 : 0;
      return accumulator;
    },
    {
      total: 0,
      active: 0,
      cancelled: 0,
      credentialActive: 0,
      credentialRevoked: 0,
      credentialMissing: 0,
      invited: 0,
      checkedIn: 0,
    },
  );

  const eventProfile = buildAccreditationEventProfile(input.event, {
    participantCount: summary.total,
    activeParticipantCount: summary.active,
    cancelledParticipantCount: summary.cancelled,
  });

  if (!eventProfile) {
    return null;
  }

  return {
    eventProfile,
    rows,
    summary,
  };
}

export function mergeAccreditationParticipantProfileMetadata(
  current: Record<string, unknown> | null | undefined,
  patch: AccreditationParticipantProfileInput,
) {
  return mergeAccreditationParticipantMetadata(current, patch);
}
