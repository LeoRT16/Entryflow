import type { InvitationDesign } from "@/features/access/domain/access-domain";
import type { InvitationOverlayLayout } from "@/features/events/domain/invitation-overlay";

export const INVITATION_RENDER_SIZE = {
  width: 1080,
  height: 1920,
} as const;

export type InvitationRenderVariant = NonNullable<InvitationDesign["variant"]>;

export type InvitationRenderData = {
  eventName: string;
  venueName?: string;
  guestName: string;
  reservationName: string;
  reservationHolderName?: string;
  reservationCode: string;
  tableName?: string;
  zoneName?: string;
  date: string;
  time: string;
  accessTypeLabel: string;
  uniqueCode: string;
  qrToken: string;
  artUrl?: string;
  artPath?: string;
  message?: string;
  theme?: string;
  logoLabel?: string;
  artLabel?: string;
  overlayLayout?: InvitationOverlayLayout | null;
  variant: InvitationRenderVariant;
};

export type InvitationCompositionTemplate = {
  width: number;
  height: number;
  variant: InvitationRenderVariant;
  mode: "preview" | "print" | "download" | "wallet";
};

export type InvitationComposition = {
  template: InvitationCompositionTemplate;
  data: InvitationRenderData;
};

const variantAccessLabels: Record<InvitationRenderVariant, string> = {
  general: "GENERAL",
  vip: "VIP",
  staff: "STAFF",
  media: "MEDIA",
  sponsor: "SPONSOR",
};

export function buildInvitationRenderData(invitation: InvitationDesign): InvitationRenderData {
  return {
    eventName: invitation.eventName,
    venueName: invitation.venueName,
    guestName: invitation.guestName,
    reservationName: invitation.reservationName,
    reservationHolderName: invitation.reservationHolderName,
    reservationCode: invitation.reservationCode,
    tableName: invitation.tableName,
    zoneName: invitation.zoneName,
    date: invitation.date,
    time: invitation.time,
    accessTypeLabel: variantAccessLabels[invitation.variant ?? "general"],
    uniqueCode: invitation.uniqueCode,
    qrToken: invitation.qrValue,
    artUrl: invitation.artUrl,
    artPath: invitation.artPath,
    message: invitation.message,
    theme: invitation.theme,
    logoLabel: invitation.logoLabel,
    artLabel: invitation.artLabel,
    overlayLayout: invitation.overlayLayout ?? undefined,
    variant: invitation.variant ?? "general",
  };
}

export function buildInvitationComposition(
  invitation: InvitationDesign,
  mode: InvitationCompositionTemplate["mode"] = "preview",
): InvitationComposition {
  return {
    template: {
      ...INVITATION_RENDER_SIZE,
      variant: invitation.variant ?? "general",
      mode,
    },
    data: buildInvitationRenderData(invitation),
  };
}

export function getInvitationDownloadFilename(invitationCode: string) {
  const slug = invitationCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `invitation-${slug || "access"}.png`;
}
