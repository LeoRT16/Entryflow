import type { Guest } from "@/features/check-in/types";
import type { EventLayoutResource, Resource, ResourceStatus, VenueLayoutResource } from "@/features/domain/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";

export type ResourceDeleteDecision = {
  allowed: boolean;
  reason?: "history_associated";
  dependencies: {
    reservations: string[];
    guests: string[];
    venueLayoutResources: string[];
    eventLayoutResources: string[];
    legacyTables: string[];
    timelineEvents: string[];
  };
};

export function isResourceAvailableForNewOperations(status: ResourceStatus) {
  return status !== "Closed" && status !== "Blocked";
}

export function canDeleteResource({
  resourceId,
  reservations,
  guests,
  venueLayoutResources,
  eventLayoutResources,
  tables,
  timelineEvents,
}: {
  resourceId: string;
  reservations: ReservationRecord[];
  guests: Guest[];
  venueLayoutResources: VenueLayoutResource[];
  eventLayoutResources: EventLayoutResource[];
  tables: TableRecord[];
  timelineEvents: TimelineEvent[];
}): ResourceDeleteDecision {
  const linkedReservations = reservations.filter(
    (reservation) => reservation.resourceId === resourceId || reservation.tableId === resourceId,
  );
  const linkedReservationIds = new Set(linkedReservations.map((reservation) => reservation.id));
  const linkedVenueLayoutResources = venueLayoutResources.filter(
    (layoutResource) => layoutResource.sourceResourceId === resourceId,
  );
  const linkedVenueLayoutResourceIds = new Set(linkedVenueLayoutResources.map((layoutResource) => layoutResource.id));
  const dependencies = {
    reservations: linkedReservations.map((reservation) => reservation.id),
    guests: guests
      .filter((guest) => guest.tableId === resourceId || linkedReservationIds.has(guest.reservationId))
      .map((guest) => guest.id),
    venueLayoutResources: linkedVenueLayoutResources.map((layoutResource) => layoutResource.id),
    eventLayoutResources: eventLayoutResources
      .filter((layoutResource) => Boolean(
        layoutResource.sourceVenueLayoutResourceId
        && linkedVenueLayoutResourceIds.has(layoutResource.sourceVenueLayoutResourceId),
      ))
      .map((layoutResource) => layoutResource.id),
    legacyTables: tables.filter((table) => table.id === resourceId).map((table) => table.id),
    timelineEvents: timelineEvents.filter((event) => event.tableId === resourceId).map((event) => event.id),
  };
  const allowed = Object.values(dependencies).every((ids) => ids.length === 0);

  return {
    allowed,
    ...(allowed ? {} : { reason: "history_associated" as const }),
    dependencies,
  };
}

export function removeResourceFromWorkspace(resources: Resource[], resourceId: string) {
  return resources.filter((resource) => resource.id !== resourceId);
}

const RESOURCE_DELETE_FALLBACK = "No se pudo eliminar el espacio.";
const RESOURCE_HISTORY_MESSAGE = "Este espacio ya tiene historial asociado. Puedes desactivarlo, pero no eliminarlo.";
const RESOURCE_DELETE_ERROR_MESSAGES: Record<string, string> = {
  resource_has_history: RESOURCE_HISTORY_MESSAGE,
  resource_unauthenticated: "Tu sesión ya no es válida. Vuelve a iniciar sesión.",
  resource_forbidden: "No tienes permiso para eliminar este espacio.",
  resource_not_found: "El espacio ya no está disponible.",
  resource_already_deleted: "El espacio ya no está disponible.",
};
const UNSAFE_PERSISTENCE_DETAIL = /(?:row-level security|\bpolicy\b|postgres|postgrest|\bsql\b|\brelation\b|\bcolumn\b|\bconstraint\b|violates)/i;

function readErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  if (!error || typeof error !== "object") return "";

  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message.trim() : "";
}

export function describeResourceDeleteError(error: unknown) {
  const detail = readErrorMessage(error);
  const domainMessage = RESOURCE_DELETE_ERROR_MESSAGES[detail];

  if (domainMessage) return domainMessage;

  if (!detail || detail === "[object Object]" || UNSAFE_PERSISTENCE_DETAIL.test(detail)) {
    return RESOURCE_DELETE_FALLBACK;
  }

  if (detail === RESOURCE_DELETE_FALLBACK || detail.startsWith(`${RESOURCE_DELETE_FALLBACK} `)) {
    return detail;
  }

  return `${RESOURCE_DELETE_FALLBACK} ${detail}`;
}

export async function runOptimisticResourceDelete({
  resourceId,
  removeOptimistically,
  persistDelete,
  restoreSnapshot,
}: {
  resourceId: string;
  removeOptimistically: () => void;
  persistDelete: (resourceId: string) => Promise<boolean>;
  restoreSnapshot: () => void;
}) {
  removeOptimistically();

  try {
    const deleted = await persistDelete(resourceId);
    if (!deleted) throw new Error(RESOURCE_DELETE_FALLBACK);
  } catch (error) {
    restoreSnapshot();
    throw new Error(describeResourceDeleteError(error));
  }
}
