import type { CheckIn, Guest as CheckInGuest } from "@/features/check-in/types";
import type { ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";
import { isTerminalReservationStatus, normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import type { ReservationRecord, ReservationSummary } from "@/features/reservations/types";
import type { TimelineEvent } from "@/features/timeline/types";

export type LifecycleDecision = {
  allowed: boolean;
  reason?: string;
  dependencies: string[];
};

type GuestDeleteInput = {
  guest: Pick<CheckInGuest, "id" | "admissionStatus" | "deliveryStatus" | "deliveryHistory" | "operatorActivity" | "extraWristbandSaleId">;
  reservation?: Pick<ReservationRecord, "id" | "status" | "reservationType"> | null;
  checkIns?: Array<Pick<CheckIn, "guestId">>;
  timelineEvents?: Array<Pick<TimelineEvent, "guestId">>;
};

type ReservationDeleteInput = {
  reservation: Pick<ReservationRecord, "id" | "status" | "commercialSnapshot" | "amount" | "advance" | "paymentStatus" | "reference" | "timeline">;
  guests?: Array<Pick<CheckInGuest, "id" | "reservationId">>;
  checkIns?: Array<Pick<CheckIn, "reservationId">>;
  timelineEvents?: Array<Pick<TimelineEvent, "reservationId">>;
  extraWristbandSales?: Array<Pick<ExtraWristbandSale, "reservationId">>;
};

function decision(dependencies: string[], reason: string): LifecycleDecision {
  return dependencies.length ? { allowed: false, reason, dependencies } : { allowed: true, dependencies: [] };
}

function hasLegacyCommercialValue(value: string) {
  const normalized = value.trim().replace(",", ".");
  const amount = Number(normalized);
  return normalized !== "" && (!Number.isFinite(amount) || amount !== 0);
}

export function canDeleteGuest({ guest, reservation, checkIns = [], timelineEvents = [] }: GuestDeleteInput): LifecycleDecision {
  const dependencies: string[] = [];

  if (!reservation) dependencies.push("reservation_missing");
  if (reservation && isTerminalReservationStatus(reservation.status)) dependencies.push("reservation_terminal");
  if (reservation?.reservationType === "Preventa") dependencies.push("presale_access");
  if (reservation?.reservationType === "Cortesía") dependencies.push("courtesy_access");
  if (guest.extraWristbandSaleId) dependencies.push("extra_wristband_sale");
  if (guest.admissionStatus === "Ingresó" || checkIns.some((item) => item.guestId === guest.id)) dependencies.push("checkin_history");
  if (guest.deliveryStatus.trim().toLowerCase() !== "pendiente de envío") dependencies.push("delivery_status");
  if (guest.deliveryHistory.length) dependencies.push("delivery_history");
  if (guest.operatorActivity.length) dependencies.push("operator_activity");
  if (timelineEvents.some((item) => item.guestId === guest.id)) dependencies.push("timeline_history");

  return decision([...new Set(dependencies)], "Este invitado ya tiene actividad registrada. Puedes cancelarlo para conservar el historial.");
}

export function canDeleteReservation({ reservation, guests = [], checkIns = [], timelineEvents = [], extraWristbandSales = [] }: ReservationDeleteInput): LifecycleDecision {
  if (normalizeReservationStatus(reservation.status) !== "Draft") {
    return { allowed: false, reason: "Solo un borrador vacío y sin actividad puede eliminarse.", dependencies: ["status_not_draft"] };
  }

  const dependencies: string[] = [];
  if (guests.some((guest) => guest.reservationId === reservation.id)) dependencies.push("guest_history");
  if (checkIns.some((item) => item.reservationId === reservation.id)) dependencies.push("checkin_history");
  if (timelineEvents.some((item) => item.reservationId === reservation.id)) dependencies.push("timeline_history");
  if (extraWristbandSales.some((item) => item.reservationId === reservation.id)) dependencies.push("extra_wristband_history");
  if (reservation.timeline.length) dependencies.push("timeline_history");
  if (reservation.commercialSnapshot) dependencies.push("commercial_snapshot");
  if (hasLegacyCommercialValue(reservation.amount) || hasLegacyCommercialValue(reservation.advance) || reservation.paymentStatus !== "Pendiente") dependencies.push("commercial_value");
  if (reservation.reference?.trim()) dependencies.push("reference");

  return decision([...new Set(dependencies)], "Este borrador ya contiene información que debe preservarse.");
}

export function canCancelReservation(reservation: Pick<ReservationRecord, "status" | "id">, extraWristbandSales: Array<Pick<ExtraWristbandSale, "reservationId" | "status">> = []): LifecycleDecision {
  const status = normalizeReservationStatus(reservation.status);
  if (status !== "Pending" && status !== "Confirmed") {
    return {
      allowed: false,
      reason: status === "Draft" ? "El borrador debe eliminarse, no cancelarse." : "Esta reserva ya es histórica y no admite cancelación.",
      dependencies: [status === "Draft" ? "draft" : "terminal_status"],
    };
  }

  if (extraWristbandSales.some((sale) => sale.reservationId === reservation.id && sale.status === "active")) {
    return { allowed: false, reason: "Cancela primero las ventas activas de manillas extra.", dependencies: ["active_extra_wristband_sale"] };
  }

  return { allowed: true, dependencies: [] };
}

export function canHardDeleteReservation(reservation: Pick<ReservationSummary, "guests"> & Partial<Pick<ReservationSummary, "status" | "commercialSnapshot" | "reference" | "timeline">>) {
  const persistedTimeline = (reservation.timeline ?? []).filter(
    (entry) => entry.title !== "Reserva creada" && entry.title !== "Pago pendiente",
  );

  return normalizeReservationStatus(reservation.status ?? "Draft") === "Draft"
    && reservation.guests.length === 0
    && !reservation.commercialSnapshot
    && !reservation.reference?.trim()
    && persistedTimeline.length === 0;
}

export function canHardDeleteGuest(guest: Pick<ReservationSummary["guests"][number], "admissionStatus" | "deliveryStatus" | "extraWristbandSaleId">) {
  return guest.admissionStatus !== "Ingresó"
    && guest.deliveryStatus.trim().toLowerCase() === "pendiente de envío"
    && !guest.extraWristbandSaleId;
}

export function hasReservationOperationalActivity(guests: CheckInGuest[]) {
  return guests.some((guest) => Boolean(guest.whatsappDelivery) || guest.checkInTime !== undefined || guest.admissionStatus === "Ingresó");
}

const LIFECYCLE_MESSAGES: Record<string, string> = {
  guest_unauthenticated: "Tu sesión ya no es válida. Vuelve a iniciar sesión.",
  guest_forbidden: "No tienes permiso para eliminar este invitado.",
  guest_not_found: "El invitado ya no está disponible.",
  guest_already_deleted: "El invitado ya no está disponible.",
  guest_has_history: "Este invitado ya tiene actividad registrada. Puedes cancelarlo para conservar el historial.",
  guest_cannot_delete: "El invitado no puede eliminarse en su estado actual.",
  guest_reservation_terminal: "La reserva es histórica y no admite eliminar invitados.",
  reservation_unauthenticated: "Tu sesión ya no es válida. Vuelve a iniciar sesión.",
  reservation_forbidden: "No tienes permiso para operar esta reserva.",
  reservation_not_found: "La reserva ya no está disponible.",
  reservation_already_deleted: "La reserva ya no está disponible.",
  reservation_not_draft: "Solo un borrador vacío y sin actividad puede eliminarse.",
  reservation_has_history: "Este borrador contiene información que debe preservarse.",
  reservation_has_active_extras: "Cancela primero las ventas activas de manillas extra.",
  reservation_already_terminal: "Esta reserva no admite cancelación en su estado actual.",
};
const UNSAFE_DETAIL = /(?:row-level security|\bpolicy\b|postgres|postgrest|\bsql\b|\brelation\b|\bcolumn\b|\bconstraint\b|violates)/i;

export function describeReservationLifecycleError(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === "string"
      ? error.trim()
      : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
        ? String((error as { message: string }).message).trim()
        : "";

  return LIFECYCLE_MESSAGES[message] ?? (!message || message === "[object Object]" || UNSAFE_DETAIL.test(message) ? fallback : `${fallback} ${message}`);
}
