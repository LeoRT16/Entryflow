import type { Event } from "@/features/domain/types";

export const DEFAULT_EVENT_INVITATION_ARTWORK_BUCKET = "event-invitation-artwork";
export const MIN_EVENT_INVITATION_ARTWORK_WIDTH = 720;
export const MIN_EVENT_INVITATION_ARTWORK_HEIGHT = 1280;
export const RECOMMENDED_EVENT_INVITATION_ARTWORK_WIDTH = 1080;
export const RECOMMENDED_EVENT_INVITATION_ARTWORK_HEIGHT = 1920;
export const MAX_EVENT_INVITATION_ARTWORK_SIZE_BYTES = 8 * 1024 * 1024;
export const EVENT_INVITATION_ARTWORK_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type EventInvitationArtwork = {
  path: string;
  url: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  label?: string;
  updatedAt: string;
};

export type InvitationArtworkValidationInput = {
  width: number;
  height: number;
  mimeType: string;
  size: number;
};

export type InvitationArtworkValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function isValidInvitationArtworkDimensions(width: number, height: number) {
  return width >= MIN_EVENT_INVITATION_ARTWORK_WIDTH && height >= MIN_EVENT_INVITATION_ARTWORK_HEIGHT && height > width;
}

export function getInvitationArtworkDimensionErrorMessage() {
  return `La imagen debe ser vertical y tener al menos ${MIN_EVENT_INVITATION_ARTWORK_WIDTH} × ${MIN_EVENT_INVITATION_ARTWORK_HEIGHT} px. Recomendado: ${RECOMMENDED_EVENT_INVITATION_ARTWORK_WIDTH} × ${RECOMMENDED_EVENT_INVITATION_ARTWORK_HEIGHT} px.`;
}

export function validateInvitationArtworkUpload(input: InvitationArtworkValidationInput): InvitationArtworkValidationResult {
  if (!EVENT_INVITATION_ARTWORK_MIME_TYPES.has(input.mimeType)) {
    return {
      ok: false,
      message: "Usá una imagen JPG, PNG o WEBP.",
    };
  }

  if (input.size > MAX_EVENT_INVITATION_ARTWORK_SIZE_BYTES) {
    return {
      ok: false,
      message: "La pieza de invitación debe pesar menos de 8 MB.",
    };
  }

  if (!isValidInvitationArtworkDimensions(input.width, input.height)) {
    return {
      ok: false,
      message: getInvitationArtworkDimensionErrorMessage(),
    };
  }

  return { ok: true };
}

export function getEventInvitationArtwork(eventOrMetadata: Pick<Event, "metadata"> | Record<string, unknown> | null | undefined): EventInvitationArtwork | null {
  const metadata = isPlainObject(eventOrMetadata) && "metadata" in eventOrMetadata && isPlainObject(eventOrMetadata.metadata)
    ? eventOrMetadata.metadata
    : isPlainObject(eventOrMetadata)
      ? eventOrMetadata
      : null;

  if (!metadata) {
    return null;
  }

  const normalizedMetadata = metadata as Record<string, unknown>;
  const artwork = isPlainObject(normalizedMetadata.invitationArtwork) ? normalizedMetadata.invitationArtwork : null;

  const url = readString(artwork?.url ?? normalizedMetadata.invitationArtworkUrl);
  const path = readString(artwork?.path ?? normalizedMetadata.invitationArtworkPath);

  if (!url && !path) {
    return null;
  }

  const fileName = readString(artwork?.fileName ?? normalizedMetadata.invitationArtworkFileName) || "invitation-artwork";
  const mimeType = readString(artwork?.mimeType ?? normalizedMetadata.invitationArtworkMimeType) || "image/png";
  const width = readNumber(artwork?.width ?? normalizedMetadata.invitationArtworkWidth);
  const height = readNumber(artwork?.height ?? normalizedMetadata.invitationArtworkHeight);
  const size = readNumber(artwork?.size ?? normalizedMetadata.invitationArtworkSize);
  const label = readString(artwork?.label ?? normalizedMetadata.invitationArtworkLabel) || undefined;
  const updatedAt = readString(artwork?.updatedAt ?? normalizedMetadata.invitationArtworkUpdatedAt);

  return {
    path,
    url,
    fileName,
    mimeType,
    width,
    height,
    size,
    label,
    updatedAt,
  };
}

export function mergeEventInvitationArtworkMetadata(
  metadata: Record<string, unknown> | undefined,
  artwork: EventInvitationArtwork | null,
) {
  const nextMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
  };

  if (artwork) {
    nextMetadata.invitationArtwork = artwork;
    delete nextMetadata.invitationArtworkUrl;
    delete nextMetadata.invitationArtworkPath;
    delete nextMetadata.invitationArtworkFileName;
    delete nextMetadata.invitationArtworkMimeType;
    delete nextMetadata.invitationArtworkWidth;
    delete nextMetadata.invitationArtworkHeight;
    delete nextMetadata.invitationArtworkSize;
    delete nextMetadata.invitationArtworkLabel;
    delete nextMetadata.invitationArtworkUpdatedAt;
  } else {
    delete nextMetadata.invitationArtwork;
    delete nextMetadata.invitationArtworkUrl;
    delete nextMetadata.invitationArtworkPath;
    delete nextMetadata.invitationArtworkFileName;
    delete nextMetadata.invitationArtworkMimeType;
    delete nextMetadata.invitationArtworkWidth;
    delete nextMetadata.invitationArtworkHeight;
    delete nextMetadata.invitationArtworkSize;
    delete nextMetadata.invitationArtworkLabel;
    delete nextMetadata.invitationArtworkUpdatedAt;
  }

  return Object.keys(nextMetadata).length ? nextMetadata : undefined;
}

function slugifySegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildInvitationArtworkStoragePath(params: {
  organizationId: string;
  eventId: string;
  fileName: string;
  mimeType: string;
}) {
  const extension = params.mimeType === "image/jpeg"
    ? "jpg"
    : params.mimeType === "image/png"
      ? "png"
      : params.mimeType === "image/webp"
        ? "webp"
        : "img";
  const fileSlug = slugifySegment(params.fileName.replace(/\.[^.]+$/, "")) || "artwork";
  const organizationSlug = slugifySegment(params.organizationId) || "organization";
  const eventSlug = slugifySegment(params.eventId) || "event";

  return `organizations/${organizationSlug}/events/${eventSlug}/invitation-artwork/${Date.now()}-${fileSlug}.${extension}`;
}

export function buildInvitationArtworkLabel(fileName: string, eventName: string) {
  const fileLabel = fileName.trim().replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return fileLabel || eventName.trim() || "Arte de invitación";
}

export function getEventInvitationArtworkBucket() {
  return (
    process.env.NEXT_PUBLIC_EVENT_INVITATION_ARTWORK_BUCKET ??
    process.env.SUPABASE_EVENT_INVITATION_ARTWORK_BUCKET ??
    DEFAULT_EVENT_INVITATION_ARTWORK_BUCKET
  );
}
