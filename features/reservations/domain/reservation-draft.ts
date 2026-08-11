import type { GuestDraft } from "@/features/reservations/types";
import type { Guest } from "@/features/check-in/types";

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function isVipTaggedGuest(guest: Guest) {
  const attention = normalizeText(guest.attention ?? "");
  const notes = normalizeText(guest.internalNotes ?? "");
  const gate = normalizeText(guest.gate ?? "");
  const method = normalizeText(guest.method ?? "");

  return attention.includes("vip") || notes.includes("vip") || gate === "vip" || method === "vip";
}

export function createGuestDraft(index: number, presets: Array<Partial<GuestDraft>>) {
  const preset = presets[index] ?? {};

  return {
    id: `guest-${index + 1}`,
    name: preset.name ?? "",
    whatsapp: preset.whatsapp ?? "",
    document: preset.document ?? "",
    invitationState: preset.invitationState ?? "Pendiente",
    vip: preset.vip ?? false,
    transferBadge: preset.transferBadge ?? "Transferible",
  };
}

export function buildGuestList(count: number, presets: Array<Partial<GuestDraft>>) {
  return Array.from({ length: count }, (_, index) => createGuestDraft(index, presets));
}

export function buildGuestDraftsFromGuests(guests: Guest[]) {
  return guests.map<GuestDraft>((guest, index) => ({
    id: guest.id,
    name: guest.guestName,
    whatsapp: guest.whatsapp ?? "",
    document: guest.carnet ?? "",
    invitationState:
      guest.deliveryStatus === "Enviada"
        ? "Enviada"
        : guest.deliveryStatus === "Reenviada"
          ? "Enviada"
        : guest.deliveryStatus === "Vista"
          ? "Lista"
          : "Pendiente",
    vip: isVipTaggedGuest(guest),
    transferBadge: index === 0 ? "Titular" : "Transferible",
  }));
}
