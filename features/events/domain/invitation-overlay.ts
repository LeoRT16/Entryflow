import type { Event } from "@/features/domain/types";
import { INVITATION_FONT_DEFAULT_ID, normalizeInvitationFontFamily } from "@/features/events/domain/invitation-fonts";

export const INVITATION_OVERLAY_LAYOUT_VERSION = 2;
export const INVITATION_OVERLAY_TEMPLATE_ID = "entryflow.freeform.v1";
export const INVITATION_OVERLAY_MODE = "freeform";
export const INVITATION_OVERLAY_CANVAS_SIZE = {
  width: 1080,
  height: 1920,
} as const;

export const INVITATION_OVERLAY_TEXT_ELEMENT_TYPES = ["GUEST", "RESERVATION_CONTEXT", "NOTICE"] as const;
export const INVITATION_OVERLAY_ELEMENT_TYPES = [...INVITATION_OVERLAY_TEXT_ELEMENT_TYPES, "QR"] as const;

export type InvitationOverlayTextElementType = (typeof INVITATION_OVERLAY_TEXT_ELEMENT_TYPES)[number];
export type InvitationOverlayElementType = (typeof INVITATION_OVERLAY_ELEMENT_TYPES)[number];
export type InvitationOverlayTextAlign = "left" | "center" | "right";
export type InvitationOverlayFontWeight = 400 | 500 | 700;
export type InvitationOverlayTextTemplateVariableKey =
  | "guestName"
  | "reservationHolder"
  | "eventDate"
  | "eventTime"
  | "venueName";

export type InvitationOverlayTextElement = {
  id: string;
  type: InvitationOverlayTextElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  fontWeight: InvitationOverlayFontWeight;
  textAlign: InvitationOverlayTextAlign;
  template: string;
};

export type InvitationOverlayQrElement = {
  id: string;
  type: "QR";
  x: number;
  y: number;
  size: number;
};

export type InvitationOverlayElement = InvitationOverlayTextElement | InvitationOverlayQrElement;

export type InvitationOverlayLayout = {
  version: number;
  templateId: string;
  mode: typeof INVITATION_OVERLAY_MODE;
  elements: InvitationOverlayElement[];
  updatedAt?: string;
};

export type InvitationOverlayPreviewContext = {
  eventName: string;
  guestName: string;
  reservationName?: string;
  reservationHolderName?: string;
  reservationCode?: string;
  venueName?: string;
  date: string;
  time?: string;
  uniqueCode: string;
  qrToken: string;
  artLabel?: string;
};

type InvitationOverlayTextContent = {
  lines: string[];
};

export type InvitationOverlayTextTemplateContext = Record<InvitationOverlayTextTemplateVariableKey, string>;

export const INVITATION_OVERLAY_TEXT_TEMPLATE_VARIABLES = [
  { key: "guestName", label: "Nombre invitado" },
  { key: "reservationHolder", label: "Titular reserva" },
  { key: "eventDate", label: "Fecha" },
  { key: "eventTime", label: "Hora" },
  { key: "venueName", label: "Lugar" },
] as const satisfies ReadonlyArray<{ key: InvitationOverlayTextTemplateVariableKey; label: string }>;

const DEFAULT_INVITATION_OVERLAY_TEXT_TEMPLATES: Record<InvitationOverlayTextElementType, string> = {
  GUEST: "{{guestName}}, estás invitado.",
  RESERVATION_CONTEXT: "Reserva de {{reservationHolder}}\n{{eventDate}} {{eventTime}} · {{venueName}}",
  NOTICE: "Uso único\nLa captura de pantalla no garantiza el ingreso.",
};

function readTemplateString(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : "";
}

function normalizeInvitationOverlayTextTemplateValue(value: unknown, fallback: string) {
  const normalized = readTemplateString(value);
  return typeof value === "string" ? normalized : fallback;
}

function cleanInvitationOverlayTemplateText(value: string) {
  const lines = value
    .split("\n")
    .map((line) => line.trimEnd().replace(/[ \t]{2,}/g, " "));

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  return lines.join("\n");
}

function getDefaultInvitationOverlayTextTemplate(type: InvitationOverlayTextElementType) {
  return DEFAULT_INVITATION_OVERLAY_TEXT_TEMPLATES[type];
}

export function resolveInvitationTextTemplate(template: string, context: InvitationOverlayTextTemplateContext) {
  const replaced = readTemplateString(template).replace(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (match, token: string) => {
    if (
      token === "guestName" ||
      token === "reservationHolder" ||
      token === "eventDate" ||
      token === "eventTime" ||
      token === "venueName"
    ) {
      return readString(context[token]);
    }

    return match;
  });

  return cleanInvitationOverlayTemplateText(replaced);
}

export function buildInvitationOverlayTextTemplateContext(context: InvitationOverlayPreviewContext): InvitationOverlayTextTemplateContext {
  return {
    guestName: readString(context.guestName),
    reservationHolder: readString(context.reservationHolderName),
    eventDate: readString(context.date),
    eventTime: readString(context.time),
    venueName: readString(context.venueName),
  };
}

const DEFAULT_INVITATION_OVERLAY_LAYOUT: InvitationOverlayLayout = {
  version: INVITATION_OVERLAY_LAYOUT_VERSION,
  templateId: INVITATION_OVERLAY_TEMPLATE_ID,
  mode: INVITATION_OVERLAY_MODE,
  elements: [
    {
      id: "guest",
      type: "GUEST",
      x: 132,
      y: 184,
      width: 816,
      height: 104,
      fontSize: 66,
      fontFamily: "montserrat",
      textColor: "#FFFFFF",
      fontWeight: 700,
      textAlign: "center",
      template: getDefaultInvitationOverlayTextTemplate("GUEST"),
    },
    {
      id: "reservation-context",
      type: "RESERVATION_CONTEXT",
      x: 132,
      y: 336,
      width: 816,
      height: 154,
      fontSize: 38,
      fontFamily: "playfair-display",
      textColor: "#FFFFFF",
      fontWeight: 500,
      textAlign: "center",
      template: getDefaultInvitationOverlayTextTemplate("RESERVATION_CONTEXT"),
    },
    {
      id: "qr",
      type: "QR",
      x: 400,
      y: 820,
      size: 280,
    },
    {
      id: "notice",
      type: "NOTICE",
      x: 160,
      y: 1668,
      width: 760,
      height: 104,
      fontSize: 24,
      fontFamily: "inter",
      textColor: "#FFFFFF",
      fontWeight: 500,
      textAlign: "center",
      template: getDefaultInvitationOverlayTextTemplate("NOTICE"),
    },
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : NaN;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeTextAlign(value: unknown): InvitationOverlayTextAlign {
  const normalized = readString(value).toLowerCase();

  if (normalized === "left" || normalized === "center" || normalized === "right") {
    return normalized;
  }

  return "center";
}

function normalizeFontWeight(value: unknown): InvitationOverlayFontWeight {
  const normalized = readNumber(value);

  if (normalized === 400 || normalized === 500 || normalized === 700) {
    return normalized;
  }

  return 500;
}

export function isValidInvitationOverlayTextColor(value: unknown) {
  const normalized = readString(value);
  return Boolean(normalized.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i));
}

export function normalizeInvitationOverlayTextColor(value: unknown) {
  const normalized = readString(value);
  const match = normalized.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (!match) {
    return "#FFFFFF";
  }

  const hex = match[1].toUpperCase();

  if (hex.length === 3) {
    return `#${hex
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`;
  }

  return `#${hex}`;
}

export function formatInspectableNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Math.round(value * 10) / 10;
  const formatted = rounded.toFixed(1);

  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
}

function getDefaultInvitationOverlayFontFamily(type: InvitationOverlayTextElementType) {
  switch (type) {
    case "GUEST":
      return "montserrat";
    case "RESERVATION_CONTEXT":
      return "playfair-display";
    case "NOTICE":
    default:
      return INVITATION_FONT_DEFAULT_ID;
  }
}

function normalizeElementType(type: unknown): InvitationOverlayElementType | null {
  const normalized = readString(type).toUpperCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "GUEST" || normalized === "RESERVATION_CONTEXT" || normalized === "NOTICE" || normalized === "QR") {
    return normalized;
  }

  if (normalized === "GUEST_IDENTITY") {
    return "GUEST";
  }

  if (normalized === "EVENT_CONTEXT" || normalized === "ACCESS" || normalized === "DISCLAIMER") {
    return normalized === "ACCESS" ? "QR" : normalized === "DISCLAIMER" ? "NOTICE" : "RESERVATION_CONTEXT";
  }

  return null;
}

function formatDateCapitalized(value: Date, timeZone?: string) {
  const formatter = new Intl.DateTimeFormat("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });
  const formatted = formatter.format(value);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatInvitationEventDateLabel(startAt: string, timeZone?: string) {
  const parsed = new Date(startAt);

  if (Number.isNaN(parsed.getTime())) {
    return startAt.trim();
  }

  return formatDateCapitalized(parsed, timeZone);
}

export function getInvitationOverlayElementLabel(type: InvitationOverlayElementType) {
  switch (type) {
    case "GUEST":
      return "Invitado";
    case "RESERVATION_CONTEXT":
      return "Reserva y evento";
    case "QR":
      return "QR";
    case "NOTICE":
      return "Aviso";
    default:
      return "Elemento";
  }
}

export function getDefaultInvitationOverlayTextTemplateForElement(type: InvitationOverlayTextElementType) {
  return getDefaultInvitationOverlayTextTemplate(type);
}

function normalizeTextElementTemplate(input: Record<string, unknown>, type: InvitationOverlayTextElementType) {
  return normalizeInvitationOverlayTextTemplateValue(
    Object.prototype.hasOwnProperty.call(input, "template") ? input.template : undefined,
    getDefaultInvitationOverlayTextTemplate(type),
  );
}

export function getInvitationOverlayElementContent(
  type: InvitationOverlayElementType,
  context: InvitationOverlayPreviewContext,
  template?: string,
): InvitationOverlayTextContent {
  if (type === "QR") {
    return {
      lines: [],
    };
  }

  const resolved = resolveInvitationTextTemplate(
    typeof template === "string" ? template : getDefaultInvitationOverlayTextTemplate(type),
    buildInvitationOverlayTextTemplateContext(context),
  );

  return {
    lines: resolved ? resolved.split("\n") : [],
  };
}

export function getInvitationOverlayTextElementMinimumWidth(type: InvitationOverlayTextElementType) {
  switch (type) {
    case "GUEST":
      return 280;
    case "RESERVATION_CONTEXT":
      return 360;
    case "NOTICE":
    default:
      return 260;
  }
}

export function getInvitationOverlayTextElementMinimumFontSize(type: InvitationOverlayTextElementType) {
  switch (type) {
    case "GUEST":
      return 28;
    case "RESERVATION_CONTEXT":
      return 24;
    case "NOTICE":
    default:
      return 18;
  }
}

export function getInvitationOverlayTextElementMinimumHeight(type: InvitationOverlayTextElementType, fontSize: number) {
  const safeFontSize = Math.max(fontSize, getInvitationOverlayTextElementMinimumFontSize(type));

  switch (type) {
    case "GUEST":
      return Math.round(safeFontSize * 1.35);
    case "RESERVATION_CONTEXT":
      return Math.round(safeFontSize * 2.65);
    case "NOTICE":
    default:
      return Math.round(safeFontSize * 2.15);
  }
}

export function getInvitationOverlayQrMinimumSize() {
  return 180;
}

export function getDefaultInvitationOverlayLayout() {
  return JSON.parse(JSON.stringify(DEFAULT_INVITATION_OVERLAY_LAYOUT)) as InvitationOverlayLayout;
}

function normalizeTextElement(input: Record<string, unknown>, type: InvitationOverlayTextElementType, index: number): InvitationOverlayTextElement {
  const width = clamp(readNumber(input.width), getInvitationOverlayTextElementMinimumWidth(type), INVITATION_OVERLAY_CANVAS_SIZE.width);
  const fontSize = clamp(
    readNumber(input.fontSize),
    getInvitationOverlayTextElementMinimumFontSize(type),
    INVITATION_OVERLAY_CANVAS_SIZE.height,
  );
  const height = clamp(
    readNumber(input.height),
    getInvitationOverlayTextElementMinimumHeight(type, fontSize),
    INVITATION_OVERLAY_CANVAS_SIZE.height,
  );
  const maxX = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.width - width);
  const maxY = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.height - height);

  return {
    id: readString(input.id) || `${type.toLowerCase()}-${index + 1}`,
    type,
    x: clamp(readNumber(input.x), 0, maxX),
    y: clamp(readNumber(input.y), 0, maxY),
    width,
    height,
    fontSize,
    fontFamily: readString(input.fontFamily) ? normalizeInvitationFontFamily(input.fontFamily) : getDefaultInvitationOverlayFontFamily(type),
    textColor: normalizeInvitationOverlayTextColor(input.textColor),
    fontWeight: normalizeFontWeight(input.fontWeight),
    textAlign: normalizeTextAlign(input.textAlign),
    template: normalizeTextElementTemplate(input, type),
  };
}

function normalizeQrElement(input: Record<string, unknown>, index: number): InvitationOverlayQrElement {
  const size = clamp(readNumber(input.size ?? input.width ?? input.height), getInvitationOverlayQrMinimumSize(), INVITATION_RENDER_MAX_SIZE());
  const maxX = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.width - size);
  const maxY = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.height - size);

  return {
    id: readString(input.id) || `qr-${index + 1}`,
    type: "QR",
    x: clamp(readNumber(input.x), 0, maxX),
    y: clamp(readNumber(input.y), 0, maxY),
    size,
  };
}

function INVITATION_RENDER_MAX_SIZE() {
  return Math.min(INVITATION_OVERLAY_CANVAS_SIZE.width, INVITATION_OVERLAY_CANVAS_SIZE.height);
}

function normalizeFreeformElement(input: unknown, index: number): InvitationOverlayElement | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const type = normalizeElementType(input.type);

  if (!type) {
    return null;
  }

  if (type === "QR") {
    return normalizeQrElement(input, index);
  }

  return normalizeTextElement(input, type, index);
}

function convertLegacyBlock(input: unknown, index: number): InvitationOverlayElement | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const type = normalizeElementType(input.type);

  if (!type) {
    return null;
  }

  const x = clamp(readNumber(input.x), 0, 1);
  const y = clamp(readNumber(input.y), 0, 1);
  const width = clamp(readNumber(input.width), 0, 1);
  const height = clamp(readNumber(input.height), 0, 1);
  const logicalX = Math.round(x * INVITATION_OVERLAY_CANVAS_SIZE.width);
  const logicalY = Math.round(y * INVITATION_OVERLAY_CANVAS_SIZE.height);
  const logicalWidth = Math.max(1, Math.round(width * INVITATION_OVERLAY_CANVAS_SIZE.width));
  const logicalHeight = Math.max(1, Math.round(height * INVITATION_OVERLAY_CANVAS_SIZE.height));

  if (type === "QR") {
    return {
      id: readString(input.id) || `qr-${index + 1}`,
      type,
      x: logicalX,
      y: logicalY,
      size: Math.max(getInvitationOverlayQrMinimumSize(), Math.min(logicalWidth, logicalHeight)),
    };
  }

  const defaultFontSize = type === "GUEST" ? 66 : type === "RESERVATION_CONTEXT" ? 38 : 24;

  return {
    id: readString(input.id) || `${type.toLowerCase()}-${index + 1}`,
    type,
    x: logicalX,
    y: logicalY,
    width: logicalWidth,
    height: getInvitationOverlayTextElementMinimumHeight(type, defaultFontSize),
    fontSize: defaultFontSize,
    fontFamily: getDefaultInvitationOverlayFontFamily(type),
    textColor: "#FFFFFF",
    fontWeight: type === "GUEST" ? 700 : 500,
    textAlign: "center",
    template: getDefaultInvitationOverlayTextTemplate(type),
  };
}

export function normalizeInvitationOverlayLayout(input: unknown): InvitationOverlayLayout | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const elements = Array.isArray(input.elements)
    ? input.elements.map((element, index) => normalizeFreeformElement(element, index)).filter((element): element is InvitationOverlayElement => Boolean(element))
    : Array.isArray(input.blocks)
      ? input.blocks.map((block, index) => convertLegacyBlock(block, index)).filter((element): element is InvitationOverlayElement => Boolean(element))
      : [];

  if (!elements.length) {
    return null;
  }

  const version = readNumber(input.version);
  const updatedAt = readString(input.updatedAt);

  return {
    version: Number.isFinite(version) ? version : INVITATION_OVERLAY_LAYOUT_VERSION,
    templateId: readString(input.templateId) || INVITATION_OVERLAY_TEMPLATE_ID,
    mode: INVITATION_OVERLAY_MODE,
    elements,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function getEventInvitationOverlayLayout(eventOrMetadata: Pick<Event, "metadata"> | Record<string, unknown> | null | undefined) {
  const metadata = isPlainObject(eventOrMetadata) && "metadata" in eventOrMetadata && isPlainObject(eventOrMetadata.metadata)
    ? eventOrMetadata.metadata
    : isPlainObject(eventOrMetadata)
      ? eventOrMetadata
      : null;

  if (!metadata) {
    return null;
  }

  const normalized = normalizeInvitationOverlayLayout((metadata as Record<string, unknown>).invitationOverlayLayout);

  return normalized;
}

export function mergeEventInvitationOverlayLayoutMetadata(
  metadata: Record<string, unknown> | undefined,
  layout: InvitationOverlayLayout | null,
) {
  const nextMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
  };

  if (layout) {
    nextMetadata.invitationOverlayLayout = layout;
  } else {
    delete nextMetadata.invitationOverlayLayout;
  }

  return Object.keys(nextMetadata).length ? nextMetadata : undefined;
}
