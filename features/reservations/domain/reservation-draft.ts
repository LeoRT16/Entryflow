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

export function createGuestDraft(index: number): GuestDraft {
  return {
    id: `guest-${index + 1}`,
    name: "",
    whatsapp: "",
    document: "",
    invitationState: "Pendiente",
    vip: false,
    transferBadge: index === 0 ? "Titular" : "Transferible",
  };
}

export function buildGuestList(count: number) {
  return Array.from({ length: count }, (_, index) => createGuestDraft(index));
}

export function syncGuestDraftsWithHolder(
  guestDrafts: GuestDraft[],
  holder: {
    holderName: string;
    holderLastName: string;
    documentValue: string;
    whatsapp: string;
  },
) {
  const holderName = [holder.holderName, holder.holderLastName].filter(Boolean).join(" ").trim();

  return guestDrafts.map((guest, index) =>
    index === 0
      ? {
          ...guest,
          name: holderName,
          document: holder.documentValue,
          whatsapp: holder.whatsapp,
          invitationState: guest.invitationState || "Pendiente",
          vip: false,
          transferBadge: "Titular",
        }
      : guest,
  );
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
