import { WhatsAppCloudError } from "@/features/access/domain/whatsapp-cloud";

import type { AccreditationInvitationWhatsAppTemplateConfig } from "./types";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTemplateConfig(env: NodeJS.ProcessEnv, prefix: string): AccreditationInvitationWhatsAppTemplateConfig | null {
  const templateName = readString(env[`${prefix}_TEMPLATE_NAME`]);
  const templateLanguage = readString(env[`${prefix}_TEMPLATE_LANGUAGE`]);

  if (!templateName || !templateLanguage) {
    return null;
  }

  return {
    templateName,
    templateLanguage,
  };
}

export function getRequiredAccreditationWhatsAppTemplateConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = readTemplateConfig(env, "WHATSAPP_ACCREDITATION");

  if (!config) {
    throw new WhatsAppCloudError("La plantilla de WhatsApp para acreditaciones no está disponible.", {
      status: 503,
      code: "accreditation_whatsapp_template_not_configured",
      safeMessage: "La plantilla de WhatsApp para acreditaciones no está disponible.",
    });
  }

  return config;
}

export function getRequiredAccreditationWhatsAppImageTemplateConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = readTemplateConfig(env, "WHATSAPP_ACCREDITATION_IMAGE");

  if (!config) {
    throw new WhatsAppCloudError("La plantilla de imagen de WhatsApp para acreditaciones no está disponible.", {
      status: 503,
      code: "accreditation_whatsapp_image_template_not_configured",
      safeMessage: "La plantilla de imagen de WhatsApp para acreditaciones no está disponible.",
    });
  }

  return config;
}

export function buildAccreditationWhatsAppEnv(params: { mediaId: boolean; env?: NodeJS.ProcessEnv } = { mediaId: false }) {
  const env = { ...(params.env ?? process.env) };
  const templateConfig = getRequiredAccreditationWhatsAppTemplateConfig(env);

  env.WHATSAPP_TEMPLATE_NAME = templateConfig.templateName;
  env.WHATSAPP_TEMPLATE_LANGUAGE = templateConfig.templateLanguage;

  if (params.mediaId) {
    const imageTemplateConfig = getRequiredAccreditationWhatsAppImageTemplateConfig(env);
    env.WHATSAPP_IMAGE_TEMPLATE_NAME = imageTemplateConfig.templateName;
    env.WHATSAPP_IMAGE_TEMPLATE_LANGUAGE = imageTemplateConfig.templateLanguage;
  }

  return env;
}
