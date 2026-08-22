import { normalizeWhatsAppPhoneNumber } from "@/features/access/domain/whatsapp-delivery";

export type WhatsAppCloudConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  templateName?: string;
  templateLanguage?: string;
};

export type WhatsAppImageTemplateConfig = Pick<WhatsAppCloudConfig, "templateName" | "templateLanguage">;

export type WhatsAppCloudSendInput = {
  recipient: string;
  guestName: string;
  eventName: string;
  accessCode: string;
  mediaId?: string;
};

export type WhatsAppCloudImageSendInput = {
  recipient: string;
  guestName: string;
  eventName: string;
  mediaId: string;
};

export type WhatsAppCloudMessagePayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text" | "template";
  text?: {
    preview_url: false;
    body: string;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components: Array<
      | {
          type: "header";
          parameters: Array<{
            type: "image";
            image: {
              id: string;
            };
          }>;
        }
      | {
          type: "body";
          parameters: Array<{
            type: "text";
            text: string;
          }>;
        }
    >;
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
const WHATSAPP_MEDIA_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const WHATSAPP_MEDIA_ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export function getWhatsAppCloudConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppCloudConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion = env.WHATSAPP_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION;
  const templateName = env.WHATSAPP_TEMPLATE_NAME?.trim();
  const templateLanguage = env.WHATSAPP_TEMPLATE_LANGUAGE?.trim();

  if (!accessToken || !phoneNumberId) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    apiVersion,
    ...(templateName ? { templateName } : {}),
    ...(templateLanguage ? { templateLanguage } : {}),
  };
}

export function getWhatsAppImageTemplateConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppImageTemplateConfig | null {
  const templateName = env.WHATSAPP_IMAGE_TEMPLATE_NAME?.trim();
  const templateLanguage = env.WHATSAPP_IMAGE_TEMPLATE_LANGUAGE?.trim();

  if (!templateName || !templateLanguage) {
    return null;
  }

  return {
    templateName,
    templateLanguage,
  };
}

export function getRequiredWhatsAppTemplateConfig(env: NodeJS.ProcessEnv = process.env) {
  const templateName = env.WHATSAPP_TEMPLATE_NAME?.trim();
  const templateLanguage = env.WHATSAPP_TEMPLATE_LANGUAGE?.trim();

  if (!templateName || !templateLanguage) {
    throw new WhatsAppCloudError("La plantilla aprobada de WhatsApp no está disponible.", {
      status: 503,
      code: "whatsapp_template_not_configured",
      safeMessage: "La plantilla aprobada de WhatsApp no está disponible.",
    });
  }

  return {
    templateName,
    templateLanguage,
  };
}

export function buildWhatsAppCloudMessage(params: {
  recipient: string;
  guestName: string;
  eventName: string;
  accessCode: string;
}, templateConfig?: Pick<WhatsAppCloudConfig, "templateName" | "templateLanguage">) {
  const recipient = normalizeWhatsAppPhoneNumber(params.recipient);

  if (!recipient) {
    throw new WhatsAppCloudError("Número de WhatsApp no válido.", {
      status: 400,
      code: "invalid_whatsapp_number",
      safeMessage: "Número de WhatsApp no válido.",
    });
  }

  if (templateConfig?.templateName && templateConfig.templateLanguage) {
    return {
      payload: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: templateConfig.templateName,
          language: {
            code: templateConfig.templateLanguage,
          },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: params.guestName },
                { type: "text", text: params.eventName },
              ],
            },
          ],
        },
      } satisfies WhatsAppCloudMessagePayload,
    };
  }

  return {
    payload: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        preview_url: false,
        body: `Hola ${params.guestName}, tienes una invitación para ${params.eventName}.\nCódigo de invitación: ${params.accessCode}.\nTe esperamos.`,
      },
    } satisfies WhatsAppCloudMessagePayload,
  };
}

export function buildWhatsAppCloudImageTemplateMessage(
  params: WhatsAppCloudImageSendInput,
  templateConfig?: WhatsAppImageTemplateConfig,
) {
  const recipient = normalizeWhatsAppPhoneNumber(params.recipient);

  if (!recipient) {
    throw new WhatsAppCloudError("Número de WhatsApp no válido.", {
      status: 400,
      code: "invalid_whatsapp_number",
      safeMessage: "Número de WhatsApp no válido.",
    });
  }

  if (!templateConfig?.templateName || !templateConfig.templateLanguage) {
    throw new WhatsAppCloudError("La plantilla de imagen de WhatsApp no está disponible.", {
      status: 503,
      code: "whatsapp_image_template_not_configured",
      safeMessage: "La plantilla de imagen de WhatsApp no está disponible.",
    });
  }

  const mediaId = params.mediaId.trim();

  if (!mediaId) {
    throw new WhatsAppCloudError("WhatsApp Media API no devolvió un mediaId.", {
      status: 502,
      code: "whatsapp_media_missing_id",
      safeMessage: "WhatsApp Media API no devolvió un mediaId.",
    });
  }

  return {
    payload: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: templateConfig.templateName,
        language: {
          code: templateConfig.templateLanguage,
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: {
                  id: mediaId,
                },
              },
            ],
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: params.guestName },
              { type: "text", text: params.eventName },
            ],
          },
        ],
      },
    } satisfies WhatsAppCloudMessagePayload,
  };
}

export function buildWhatsAppCloudMessagesUrl(config: WhatsAppCloudConfig) {
  return `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
}

export function buildWhatsAppCloudMediaUploadUrl(config: WhatsAppCloudConfig) {
  return `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/media`;
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

export type WhatsAppCloudMediaUploadInput = {
  file: Blob;
  fileName: string;
};

export type WhatsAppCloudMediaUploadResult = {
  mediaId: string;
};

export function validateWhatsAppMediaUpload(input: { mimeType: string; size: number }) {
  if (!WHATSAPP_MEDIA_ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    return {
      ok: false as const,
      message: "Usá una imagen JPG o PNG.",
    };
  }

  if (input.size > WHATSAPP_MEDIA_MAX_IMAGE_SIZE_BYTES) {
    return {
      ok: false as const,
      message: "La imagen debe pesar menos de 5 MB.",
    };
  }

  return { ok: true as const };
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

function extractMediaId(responseBody: unknown) {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const mediaId = (responseBody as { id?: unknown }).id;

  return typeof mediaId === "string" && mediaId.trim() ? mediaId.trim() : null;
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

  const mediaId = params.mediaId?.trim();
  const payload = mediaId
    ? buildWhatsAppCloudImageTemplateMessage(
        {
          recipient: params.recipient,
          guestName: params.guestName,
          eventName: params.eventName,
          mediaId,
        },
        getWhatsAppImageTemplateConfig(env) ?? undefined,
      ).payload
    : buildWhatsAppCloudMessage(params, config).payload;
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

  if (!messageId) {
    throw new WhatsAppCloudError("WhatsApp Cloud API no devolvió un message id.", {
      status: 502,
      code: "whatsapp_cloud_missing_message_id",
      safeMessage: "WhatsApp Cloud API no devolvió un message id.",
    });
  }

  return {
    messageId,
  };
}

export async function uploadWhatsAppCloudMedia(
  params: WhatsAppCloudMediaUploadInput,
  fetchImpl: WhatsAppFetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WhatsAppCloudMediaUploadResult> {
  const config = getWhatsAppCloudConfig(env);

  if (!config) {
    throw new WhatsAppCloudError("La configuración de WhatsApp Cloud API no está disponible.", {
      status: 503,
      code: "whatsapp_cloud_not_configured",
      safeMessage: "La configuración de WhatsApp Cloud API no está disponible.",
    });
  }

  const validation = validateWhatsAppMediaUpload({
    mimeType: params.file.type || "application/octet-stream",
    size: params.file.size,
  });

  if (!validation.ok) {
    throw new WhatsAppCloudError(validation.message, {
      status: 400,
      code: "invalid_whatsapp_media",
      safeMessage: validation.message,
    });
  }

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", params.file, params.fileName);

  const response = await fetchImpl(buildWhatsAppCloudMediaUploadUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: formData,
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const providerMessage = extractSafeMetaErrorMessage(responseBody);
    const metaErrorDetails = extractMetaErrorDetails(responseBody);

    console.error("Meta WhatsApp Media API error", {
      httpStatus: response.status,
      error: {
        message: metaErrorDetails.message,
        type: metaErrorDetails.type,
        code: metaErrorDetails.code,
        error_subcode: metaErrorDetails.errorSubcode,
        fbtrace_id: metaErrorDetails.fbtraceId,
      },
    });

    throw new WhatsAppCloudError(providerMessage ?? "No se pudo subir la imagen a WhatsApp Media API.", {
      status: response.status,
      code: "whatsapp_media_upload_failed",
      safeMessage: providerMessage ?? "No se pudo subir la imagen a WhatsApp Media API.",
    });
  }

  const mediaId = extractMediaId(responseBody);

  if (!mediaId) {
    throw new WhatsAppCloudError("WhatsApp Media API no devolvió un mediaId.", {
      status: 502,
      code: "whatsapp_media_missing_id",
      safeMessage: "WhatsApp Media API no devolvió un mediaId.",
    });
  }

  return {
    mediaId,
  };
}
