import { normalizeWhatsAppPhoneNumber } from "@/features/access/domain/whatsapp-delivery";

export type WhatsAppCloudConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
};

export type WhatsAppCloudSendInput = {
  recipient: string;
  guestName: string;
  eventName: string;
  invitationCode: string;
};

export type WhatsAppCloudMessagePayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "template";
  template: {
    name: string;
    language: {
      code: string;
    };
  };
};

export type WhatsAppCloudSendResult = {
  messageId: string | null;
};

export type WhatsAppFetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class WhatsAppCloudError extends Error {
  status: number;
  code: string;
  safeMessage: string;

  constructor(message: string, options?: { status?: number; code?: string; safeMessage?: string }) {
    super(message);
    this.name = "WhatsAppCloudError";
    this.status = options?.status ?? 500;
    this.code = options?.code ?? "whatsapp_cloud_error";
    this.safeMessage = options?.safeMessage ?? message;
  }
}

const DEFAULT_WHATSAPP_API_VERSION = "v23.0";
const DEFAULT_WHATSAPP_TEMPLATE_NAME = "hello_world";
const DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE_CODE = "en_US";

export function getWhatsAppCloudConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppCloudConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion = env.WHATSAPP_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION;

  if (!accessToken || !phoneNumberId) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    apiVersion,
  };
}

export function buildWhatsAppCloudMessage(params: {
  recipient: string;
  guestName: string;
  eventName: string;
  invitationCode: string;
}) {
  const recipient = normalizeWhatsAppPhoneNumber(params.recipient);

  if (!recipient) {
    throw new WhatsAppCloudError("Número de WhatsApp no válido.", {
      status: 400,
      code: "invalid_whatsapp_number",
      safeMessage: "Número de WhatsApp no válido.",
    });
  }

  return {
    payload: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME?.trim() || DEFAULT_WHATSAPP_TEMPLATE_NAME,
        language: {
          code: process.env.WHATSAPP_TEMPLATE_LANGUAGE_CODE?.trim() || DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
        },
      },
    } satisfies WhatsAppCloudMessagePayload,
  };
}

export function buildWhatsAppCloudMessagesUrl(config: WhatsAppCloudConfig) {
  return `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
}

export function buildWhatsAppCloudRequestInit(config: WhatsAppCloudConfig, payload: WhatsAppCloudMessagePayload): RequestInit {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

function extractSafeMetaErrorMessage(errorBody: unknown) {
  if (!errorBody || typeof errorBody !== "object") {
    return null;
  }

  const maybeError = (errorBody as { error?: unknown }).error;

  if (!maybeError || typeof maybeError !== "object") {
    return null;
  }

  const message = (maybeError as { message?: unknown }).message;

  return typeof message === "string" && message.trim() ? message.trim() : null;
}

export async function sendWhatsAppCloudMessage(
  params: WhatsAppCloudSendInput,
  fetchImpl: WhatsAppFetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WhatsAppCloudSendResult> {
  const config = getWhatsAppCloudConfig(env);

  if (!config) {
    throw new WhatsAppCloudError("La configuración de WhatsApp Cloud API no está disponible.", {
      status: 503,
      code: "whatsapp_cloud_not_configured",
      safeMessage: "La configuración de WhatsApp Cloud API no está disponible.",
    });
  }

  const { payload } = buildWhatsAppCloudMessage(params);
  const response = await fetchImpl(buildWhatsAppCloudMessagesUrl(config), buildWhatsAppCloudRequestInit(config, payload));
  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const providerMessage = extractSafeMetaErrorMessage(responseBody);

    throw new WhatsAppCloudError(providerMessage ?? "No se pudo enviar la invitación por WhatsApp.", {
      status: response.status,
      code: "whatsapp_cloud_send_failed",
      safeMessage: providerMessage ?? "No se pudo enviar la invitación por WhatsApp.",
    });
  }

  const messageId =
    responseBody && typeof responseBody === "object" && "messages" in responseBody && Array.isArray((responseBody as { messages?: unknown[] }).messages)
      ? ((responseBody as { messages?: Array<{ id?: unknown }> }).messages?.[0]?.id as string | undefined) ?? null
      : null;

  return {
    messageId,
  };
}
