import type { GuestDraft } from "@/features/reservations/types";
import type { Resource } from "@/features/domain/types";
import type { PaymentMethod, PaymentStatus, ReservationType } from "@/features/reservations/types";
import { buildGuestList } from "@/features/reservations/domain/reservation-draft";

export type ReservationWizardDefaults = {
  eventName: string;
  date: string;
  time: string;
  guestCount: number;
  reservationType: ReservationType;
  observations: string;
  holderName: string;
  holderLastName: string;
  documentValue: string;
  whatsapp: string;
  email: string;
  preferences: string;
  vip: boolean;
  notes: string;
  guestDrafts: GuestDraft[];
  selectedResourceId: string;
  amount: string;
  advance: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
};

export type ReservationSubmissionGate = {
  tryEnter: () => boolean;
  release: () => void;
  isLocked: () => boolean;
};

export function createReservationSubmissionGate(): ReservationSubmissionGate {
  let locked = false;

  return {
    tryEnter() {
      if (locked) {
        return false;
      }

      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
}

export async function runReservationSubmission<T>(
  gate: ReservationSubmissionGate,
  task: () => Promise<T>,
) {
  if (!gate.tryEnter()) {
    return undefined;
  }

  try {
    return await task();
  } finally {
    gate.release();
  }
}

export function createReservationWizardDefaults(currentEvent: Pick<{ name: string; startAt: string }, "name" | "startAt">): ReservationWizardDefaults {
  const [eventDate, eventTime] = currentEvent.startAt.trim().split(/\s+(?=\d{1,2}:\d{2}$)/);

  return {
    eventName: currentEvent.name,
    date: eventDate ?? currentEvent.startAt,
    time: eventTime ?? "",
    guestCount: 5,
    reservationType: "Mesa",
    observations: "",
    holderName: "",
    holderLastName: "",
    documentValue: "",
    whatsapp: "",
    email: "",
    preferences: "",
    vip: false,
    notes: "",
    guestDrafts: buildGuestList(5),
    selectedResourceId: "",
    amount: "",
    advance: "",
    paymentMethod: "Efectivo",
    paymentStatus: "Pendiente",
  };
}

export function countDraftRegisteredGuests(guestDrafts: GuestDraft[]) {
  return guestDrafts.filter((guest) => guest.name.trim().length > 0).length;
}

export function countDraftPendingGuests(guestCount: number, registeredGuests: number) {
  return Math.max(guestCount - registeredGuests, 0);
}

export function resolveInitialReservationResourceId({
  currentVenueResources,
  resourceId,
  tableId,
}: {
  currentVenueResources: Pick<Resource, "id">[];
  resourceId?: string | null;
  tableId?: string | null;
}) {
  const explicitId = resourceId ?? tableId ?? "";

  if (!explicitId) {
    return "";
  }

  return currentVenueResources.some((resource) => resource.id === explicitId) ? explicitId : "";
}

export function preferEventLayoutMappedResources<T extends { eventLayoutResourceId?: string | null }>(resourceOptions: T[]) {
  const mappedResources = resourceOptions.filter((resource) => Boolean(resource.eventLayoutResourceId));

  return mappedResources.length ? mappedResources : resourceOptions;
}

export function resolveReservationWizardResourceOptions<T extends { eventLayoutResourceId?: string | null; sectorId?: string | null }>(
  resourceOptions: T[],
  preferredSectorId?: string | null,
) {
  const mappedResources = resourceOptions.filter((resource) => Boolean(resource.eventLayoutResourceId));

  if (mappedResources.length) {
    return mappedResources;
  }

  const normalizedPreferredSectorId = preferredSectorId?.trim() ?? "";

  if (!normalizedPreferredSectorId) {
    return resourceOptions;
  }

  const preferredSectorResources = resourceOptions.filter(
    (resource) => resource.sectorId === normalizedPreferredSectorId || !resource.sectorId,
  );

  return preferredSectorResources.length ? preferredSectorResources : resourceOptions;
}

export function resolveReservationCapacityViolation({
  resourceCapacity,
  guestCount,
  existingGuestCount = 0,
  resourceName = "este recurso",
}: {
  resourceCapacity?: number | null;
  guestCount: number;
  existingGuestCount?: number;
  resourceName?: string;
}) {
  if (typeof resourceCapacity !== "number" || !Number.isFinite(resourceCapacity)) {
    return null;
  }

  const totalGuests = existingGuestCount + guestCount;

  if (totalGuests <= resourceCapacity) {
    return null;
  }

  return `La capacidad de ${resourceName} es ${resourceCapacity} personas y esta reserva quedaría en ${totalGuests}/${resourceCapacity}. Reduce invitados o elige otro recurso.`;
}
