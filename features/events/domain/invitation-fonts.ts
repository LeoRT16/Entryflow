import type { InvitationOverlayFontWeight } from "@/features/events/domain/invitation-overlay";

export type InvitationFontFamilyId =
  | "inter"
  | "montserrat"
  | "playfair-display"
  | "bebas-neue"
  | "oswald"
  | "anton"
  | "cormorant-garamond"
  | "archivo-narrow";

export type InvitationFontOption = {
  id: InvitationFontFamilyId;
  label: string;
  cssFamily: string;
  supportedWeights: InvitationOverlayFontWeight[];
};

export const INVITATION_FONT_OPTIONS = [
  {
    id: "inter",
    label: "Inter",
    cssFamily: 'var(--font-invitation-inter), var(--font-sans), sans-serif',
    supportedWeights: [400, 500, 700],
  },
  {
    id: "montserrat",
    label: "Montserrat",
    cssFamily: 'var(--font-invitation-montserrat), var(--font-sans), sans-serif',
    supportedWeights: [400, 500, 700],
  },
  {
    id: "playfair-display",
    label: "Playfair Display",
    cssFamily: 'var(--font-invitation-playfair-display), Georgia, serif',
    supportedWeights: [400, 500, 700],
  },
  {
    id: "bebas-neue",
    label: "Bebas Neue",
    cssFamily: 'var(--font-invitation-bebas-neue), var(--font-sans), sans-serif',
    supportedWeights: [400],
  },
  {
    id: "oswald",
    label: "Oswald",
    cssFamily: 'var(--font-invitation-oswald), var(--font-sans), sans-serif',
    supportedWeights: [400, 500, 700],
  },
  {
    id: "anton",
    label: "Anton",
    cssFamily: 'var(--font-invitation-anton), var(--font-sans), sans-serif',
    supportedWeights: [400],
  },
  {
    id: "cormorant-garamond",
    label: "Cormorant Garamond",
    cssFamily: 'var(--font-invitation-cormorant-garamond), Georgia, serif',
    supportedWeights: [400, 500, 700],
  },
  {
    id: "archivo-narrow",
    label: "Archivo Narrow",
    cssFamily: 'var(--font-invitation-archivo-narrow), var(--font-sans), sans-serif',
    supportedWeights: [400, 500, 700],
  },
] as const satisfies readonly InvitationFontOption[];

export const INVITATION_FONT_DEFAULT_ID: InvitationFontFamilyId = "inter";

export function getInvitationFontOption(fontFamily?: string | null) {
  return INVITATION_FONT_OPTIONS.find((option) => option.id === fontFamily) ?? INVITATION_FONT_OPTIONS[0];
}

export function normalizeInvitationFontFamily(fontFamily: unknown) {
  const normalized = typeof fontFamily === "string" ? fontFamily.trim() : "";
  const option = INVITATION_FONT_OPTIONS.find((item) => item.id === normalized);

  if (option) {
    return option.id;
  }

  return INVITATION_FONT_DEFAULT_ID;
}

export function resolveInvitationFontWeight(fontFamily: string | null | undefined, fontWeight: InvitationOverlayFontWeight) {
  const option = getInvitationFontOption(fontFamily);
  const supportedWeights = option.supportedWeights as InvitationOverlayFontWeight[];

  if (supportedWeights.includes(fontWeight)) {
    return fontWeight;
  }

  if (supportedWeights.includes(500)) {
    return 500;
  }

  if (supportedWeights.includes(700)) {
    return 700;
  }

  return supportedWeights[0] ?? 400;
}

export async function waitForInvitationFontsReady() {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return;
  }

  await document.fonts.ready;
}
