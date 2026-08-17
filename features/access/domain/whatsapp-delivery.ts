export type WhatsAppShareNavigator = Pick<Navigator, "share" | "canShare"> | undefined;

export function normalizeWhatsAppPhoneNumber(input?: string | null) {
  const digits = (input ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const normalized = digits.startsWith("00") ? digits.slice(2) : digits;

  if (normalized.startsWith("591")) {
    const national = normalized.slice(3);
    if (national.length === 7 || national.length === 8) {
      return `591${national}`;
    }
    return normalized;
  }

  if (normalized.length === 7 || normalized.length === 8) {
    return `591${normalized}`;
  }

  return null;
}

export function buildInvitationWhatsAppMessage(params: {
  guestName: string;
  eventName: string;
  invitationCode: string;
}) {
  const { guestName, eventName, invitationCode } = params;

  return [
    `Hola ${guestName} 👋`,
    "",
    `Te compartimos tu invitación para ${eventName}.`,
    "",
    `Código de acceso: ${invitationCode}`,
    "",
    "Presentá el QR de tu invitación al ingresar.",
    "",
    "Esta invitación es personal y de uso único.",
  ].join("\n");
}

export function buildWhatsAppDeepLink(params: {
  recipient: string;
  message: string;
}) {
  return `https://wa.me/${params.recipient}?text=${encodeURIComponent(params.message)}`;
}

export function canSendWhatsAppInvitation(params: { isReady: boolean; isSending: boolean }) {
  return params.isReady && !params.isSending;
}

export function canUseNativeShareWithFiles(navigatorLike: WhatsAppShareNavigator, files: File[]) {
  if (!navigatorLike?.share || !navigatorLike.canShare) {
    return false;
  }

  try {
    return navigatorLike.canShare({ files });
  } catch {
    return false;
  }
}
