import type { GuestDraft } from "@/features/reservations/types";

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
