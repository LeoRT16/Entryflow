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
  type: "text";
  text: {
    preview_url: false;
    body: string;
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
      type: "text",
      text: {
        preview_url: false,
        body: `Hola ${params.guestName}, tienes una invitación para ${params.eventName}.\nCódigo de invitación: ${params.invitationCode}.\nTe esperamos.`,
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

type MetaErrorDetails = {
  message: string | null;
  type: string | null;
  code: number | null;
  errorSubcode: number | null;
  fbtraceId: string | null;
};

function extractMetaErrorDetails(errorBody: unknown): MetaErrorDetails {
  if (!errorBody || typeof errorBody !== "object") {
    return {
      message: null,
      type: null,
      code: null,
      errorSubcode: null,
      fbtraceId: null,
    };
  }

  const maybeError = (errorBody as { error?: unknown }).error;

  if (!maybeError || typeof maybeError !== "object") {
    return {
      message: null,
      type: null,
      code: null,
      errorSubcode: null,
      fbtraceId: null,
    };
  }

  const error = maybeError as {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
    fbtrace_id?: unknown;
  };

  return {
    message: typeof error.message === "string" && error.message.trim() ? error.message.trim() : null,
    type: typeof error.type === "string" && error.type.trim() ? error.type.trim() : null,
    code: typeof error.code === "number" ? error.code : null,
    errorSubcode: typeof error.error_subcode === "number" ? error.error_subcode : null,
    fbtraceId: typeof error.fbtrace_id === "string" && error.fbtrace_id.trim() ? error.fbtrace_id.trim() : null,
  };
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
    const metaErrorDetails = extractMetaErrorDetails(responseBody);

    console.error("Meta WhatsApp Cloud API error", {
      httpStatus: response.status,
      error: {
        message: metaErrorDetails.message,
        type: metaErrorDetails.type,
        code: metaErrorDetails.code,
        error_subcode: metaErrorDetails.errorSubcode,
        fbtrace_id: metaErrorDetails.fbtraceId,
      },
    });

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
