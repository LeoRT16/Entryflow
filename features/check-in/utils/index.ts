import type { Guest } from "@/features/check-in/types";

export function normalizeCheckInText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function buildGuestSearchIndex(guest: Guest) {
  return normalizeCheckInText([
    guest.guestName,
    guest.reservationName,
    guest.reservationCode,
    guest.invitationCode,
    guest.carnet,
    guest.whatsapp || "Sin WhatsApp",
    guest.eventName,
  ].join(" "));
}
