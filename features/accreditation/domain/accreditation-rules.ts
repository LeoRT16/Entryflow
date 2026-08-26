import type { AccreditationCategory, AccreditationStatus, AccreditationValidationContext } from "@/features/accreditation/types";
import type { Sector } from "@/features/domain/types";

export type AccreditationValidationErrorCode =
  | "invalid_status"
  | "organization_mismatch"
  | "event_mismatch"
  | "category_mismatch"
  | "sector_mismatch"
  | "missing_event_venue";

export class AccreditationValidationError extends Error {
  code: AccreditationValidationErrorCode;

  constructor(code: AccreditationValidationErrorCode, message: string) {
    super(message);
    this.name = "AccreditationValidationError";
    this.code = code;
  }
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOptionalText(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeAccreditationStatus(status?: string | null): AccreditationStatus {
  if (status === "active" || status === "cancelled") {
    return status;
  }

  throw new AccreditationValidationError("invalid_status", `Invalid accreditation status: ${status ?? "undefined"}`);
}

export function isAccreditationActive(status: AccreditationStatus | string) {
  return status === "active";
}

export function assertAccreditationCategoryOwnership(params: {
  organizationId: string;
  eventId: string;
  category?: Pick<AccreditationCategory, "organizationId" | "eventId"> | null;
}) {
  const { organizationId, eventId, category } = params;

  if (!category) {
    return;
  }

  if (category.organizationId !== organizationId) {
    throw new AccreditationValidationError("organization_mismatch", "Accreditation category belongs to another organization.");
  }

  if (category.eventId !== eventId) {
    throw new AccreditationValidationError("event_mismatch", "Accreditation category belongs to another event.");
  }
}

export function assertAccreditationSectorAssignment(params: {
  organizationId: string;
  eventId: string;
  eventVenueId: string | null | undefined;
  sector?: Pick<Sector, "id" | "venueId"> | null;
}) {
  const { organizationId, eventId, eventVenueId, sector } = params;

  if (!sector) {
    return;
  }

  if (!eventVenueId) {
    throw new AccreditationValidationError("missing_event_venue", "Accreditation sector assignment requires the event to have a canonical venue.");
  }

  if (sector.venueId !== eventVenueId) {
    throw new AccreditationValidationError("sector_mismatch", "Accreditation sector belongs to a different venue.");
  }

  void organizationId;
  void eventId;
}

export function assertAccreditationEnrollmentScope(params: AccreditationValidationContext) {
  const { organizationId, eventId, event, category, sector } = params;

  if (!event) {
    throw new AccreditationValidationError("event_mismatch", "Accreditation event was not found.");
  }

  if (event.organizationId !== organizationId) {
    throw new AccreditationValidationError("organization_mismatch", "Accreditation enrollment belongs to another organization.");
  }

  if (event.id !== eventId) {
    throw new AccreditationValidationError("event_mismatch", "Accreditation enrollment belongs to another event.");
  }

  assertAccreditationCategoryOwnership({ organizationId, eventId, category });
  assertAccreditationSectorAssignment({
    organizationId,
    eventId,
    eventVenueId: event.venueId,
    sector,
  });
}

export function normalizeAccreditationEnrollmentName(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error("Accreditation enrollment name is required.");
  }

  return normalized;
}

export function normalizeAccreditationCategorySlug(value: string) {
  const normalized = normalizeSlug(value);

  if (!normalized) {
    throw new Error("Accreditation category slug is required.");
  }

  return normalized;
}

export function normalizeAccreditationEnrollmentEmail(value?: string | null) {
  return normalizeOptionalText(value)?.toLowerCase();
}

export function normalizeAccreditationEnrollmentPhone(value?: string | null) {
  return normalizeOptionalText(value);
}

export function normalizeAccreditationMetadata(value?: Record<string, unknown> | null) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return value;
}
