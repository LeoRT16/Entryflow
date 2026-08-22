import type { Guest as CheckInGuest } from "@/features/check-in/types";
import type { ReservationSummary } from "@/features/reservations/types";

function normalizeDeliveryStatus(value: string) {
  return value.trim().toLowerCase();
}

export function canHardDeleteReservation(reservation: Pick<ReservationSummary, "guests">) {
  return reservation.guests.length === 0;
}

export function canHardDeleteGuest(guest: Pick<ReservationSummary["guests"][number], "admissionStatus" | "deliveryStatus">) {
  return guest.admissionStatus !== "Ingresó" && normalizeDeliveryStatus(guest.deliveryStatus) === "pendiente de envío";
}

export function hasReservationOperationalActivity(guests: CheckInGuest[]) {
  return guests.some((guest) => Boolean(guest.whatsappDelivery) || guest.checkInTime !== undefined || guest.admissionStatus === "Ingresó");
}
