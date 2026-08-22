import type { Guest as CheckInGuest } from "@/features/check-in/types";
import type { ReservationSummary } from "@/features/reservations/types";
import type { InvitationDesign } from "@/features/access/domain/access-domain";
import { getEventInvitationArtwork } from "@/features/events/domain/invitation-artwork";
import { formatInvitationEventDateLabel, getEventInvitationOverlayLayout } from "@/features/events/domain/invitation-overlay";
import { resolveEventVenueDisplayName } from "@/features/events/domain/event-venue-boundary";
import { formatTimelineDisplayTime } from "@/features/timeline/domain/timeline-domain";
import { normalizeWhatsAppPhoneNumber } from "@/features/access/domain/whatsapp-delivery";

type ReservationInvitationEventSource = {
  name?: string;
  startAt?: string;
  start_at?: string;
  timezone?: string;
  venue?: string;
  metadata?: Record<string, unknown> | null;
} & Record<string, unknown>;

export type ReservationWhatsAppInvitationDesignInput = {
  guest: Pick<CheckInGuest, "id" | "guestName" | "reservationName" | "reservationCode" | "seat" | "tableName" | "accessCode" | "invitationCode" | "qrToken">;
  currentEvent: ReservationInvitationEventSource;
  currentVenueName?: string | null;
  reservationHolderName?: string | null;
};

export type ReservationWhatsAppInvitationCandidate = {
  guest: CheckInGuest;
  recipient: string;
  accessCode: string;
  invitation: InvitationDesign;
  isRetry: boolean;
};

export type ReservationWhatsAppInvitationSkipReason = "already_sent" | "missing_whatsapp" | "missing_code";

export type ReservationWhatsAppInvitationSkip = {
  guest: CheckInGuest;
  reason: ReservationWhatsAppInvitationSkipReason;
};

export type ReservationWhatsAppInvitationPlan = {
  guests: CheckInGuest[];
  eligibleGuests: ReservationWhatsAppInvitationCandidate[];
  skippedGuests: ReservationWhatsAppInvitationSkip[];
  eligibleCount: number;
  skippedCount: number;
  retryableCount: number;
  alreadySentCount: number;
  missingWhatsAppCount: number;
  missingCodeCount: number;
};

export type ReservationWhatsAppInvitationPlanOptions = {
  includeAlreadySentGuests?: boolean;
};

function getLatestWhatsAppDeliveryStatus(guest: CheckInGuest) {
  return guest.whatsappDelivery?.currentStatus ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function resolveInvitationEventSource(currentEvent: ReservationInvitationEventSource) {
  const event = isPlainObject(currentEvent) ? currentEvent : {};
  const metadata = isPlainObject(event.metadata) ? event.metadata : undefined;

  return {
    eventName: readString(event.name),
    startAt: readString(event.startAt ?? event.start_at),
    timezone: readString(event.timezone) || "America/La_Paz",
    venue: readString(event.venue),
    metadata: metadata ?? event,
  };
}

export function isReservationWhatsAppDeliveryAlreadySent(guest: CheckInGuest) {
  const latestStatus = getLatestWhatsAppDeliveryStatus(guest);

  return latestStatus === "accepted" || latestStatus === "sent" || latestStatus === "delivered" || latestStatus === "read";
}

export function isReservationWhatsAppDeliveryRetryable(guest: CheckInGuest) {
  const latestStatus = getLatestWhatsAppDeliveryStatus(guest);

  return latestStatus === "failed";
}

export function buildGuestInvitationDesign({
  guest,
  currentEvent,
  currentVenueName,
  reservationHolderName,
}: ReservationWhatsAppInvitationDesignInput): InvitationDesign {
  const invitationEvent = resolveInvitationEventSource(currentEvent);
  const visibleInvitationCode = guest.accessCode ?? guest.invitationCode;
  const invitationQrToken = guest.qrToken ?? visibleInvitationCode;
  const invitationArtwork = getEventInvitationArtwork(invitationEvent);
  const invitationOverlayLayout = getEventInvitationOverlayLayout(invitationEvent);

  return {
    id: guest.id,
    eventName: invitationEvent.eventName,
    guestName: guest.guestName,
    reservationName: guest.reservationName,
    reservationHolderName: reservationHolderName ?? undefined,
    reservationCode: guest.reservationCode,
    tableName: guest.tableName,
    zoneName: guest.seat,
    venueName: resolveEventVenueDisplayName({
      currentVenueName,
      eventVenue: invitationEvent.venue,
    }),
    date: formatInvitationEventDateLabel(invitationEvent.startAt, invitationEvent.timezone),
    time: formatTimelineDisplayTime(invitationEvent.startAt),
    uniqueCode: visibleInvitationCode,
    qrValue: invitationQrToken,
    artUrl: invitationArtwork?.url,
    artPath: invitationArtwork?.path,
    artLabel: invitationArtwork?.label,
    overlayLayout: invitationOverlayLayout ?? undefined,
    theme: "Pieza lista para compartir y validar operativamente.",
    variant: "general",
  };
}

export function buildReservationWhatsAppInvitationPlan({
  reservation,
  guests,
  currentEvent,
  currentVenueName,
  includeAlreadySentGuests = false,
}: {
  reservation: Pick<ReservationSummary, "id" | "holderName"> & Pick<ReservationSummary, "name" | "code" | "tableName">;
  guests: CheckInGuest[];
  currentEvent: ReservationInvitationEventSource;
  currentVenueName?: string | null;
} & ReservationWhatsAppInvitationPlanOptions): ReservationWhatsAppInvitationPlan {
  const reservationGuests = guests.filter((guest) => guest.reservationId === reservation.id);
  const eligibleGuests: ReservationWhatsAppInvitationCandidate[] = [];
  const skippedGuests: ReservationWhatsAppInvitationSkip[] = [];
  let alreadySentCount = 0;
  let missingWhatsAppCount = 0;
  let missingCodeCount = 0;
  let retryableCount = 0;

  for (const guest of reservationGuests) {
    const recipient = normalizeWhatsAppPhoneNumber(guest.whatsapp) ?? "";
    const accessCode = guest.accessCode ?? guest.invitationCode;

    const alreadySent = isReservationWhatsAppDeliveryAlreadySent(guest);

    if (alreadySent && !includeAlreadySentGuests) {
      alreadySentCount += 1;
      skippedGuests.push({ guest, reason: "already_sent" });
      continue;
    }

    if (alreadySent) {
      alreadySentCount += 1;
    }

    if (!recipient) {
      missingWhatsAppCount += 1;
      skippedGuests.push({ guest, reason: "missing_whatsapp" });
      continue;
    }

    if (!accessCode.trim()) {
      missingCodeCount += 1;
      skippedGuests.push({ guest, reason: "missing_code" });
      continue;
    }

    if (isReservationWhatsAppDeliveryRetryable(guest)) {
      retryableCount += 1;
    }

    eligibleGuests.push({
      guest,
      recipient,
      accessCode,
      invitation: buildGuestInvitationDesign({
        guest,
        currentEvent,
        currentVenueName,
        reservationHolderName: reservation.holderName,
      }),
      isRetry: isReservationWhatsAppDeliveryRetryable(guest),
    });
  }

  return {
    guests: reservationGuests,
    eligibleGuests,
    skippedGuests,
    eligibleCount: eligibleGuests.length,
    skippedCount: skippedGuests.length,
    retryableCount,
    alreadySentCount,
    missingWhatsAppCount,
    missingCodeCount,
  };
}

export function getWhatsAppDeliveryAttemptNumber(guest: Pick<CheckInGuest, "whatsappDelivery">) {
  return (guest.whatsappDelivery?.attemptNumber ?? 0) + 1;
}

export function getWhatsAppDeliveryTimestampLabel(timestamp: string) {
  return timestamp.slice(11, 16);
}

export function getWhatsAppDeliveryAcceptedMessage(trackingPersisted: boolean) {
  return trackingPersisted
    ? "Envío por WhatsApp aceptado por proveedor"
    : "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.";
}
