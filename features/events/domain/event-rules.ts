import type { EventStatus } from "@/features/domain/types";

export type EventSelectionCandidate = {
  id: string;
  organizationId: string;
  status: EventStatus;
  updatedAt?: string;
  startAt?: string;
  deletedAt?: string | null;
};

const TERMINAL_EVENT_STATUSES: ReadonlySet<EventStatus> = new Set(["finished", "cancelled"]);

function compareDatesDesc(a?: string, b?: string) {
  if (a === b) {
    return 0;
  }

  if (!a) {
    return 1;
  }

  if (!b) {
    return -1;
  }

  return a < b ? 1 : -1;
}

export function isTerminalEventStatus(status: EventStatus) {
  return TERMINAL_EVENT_STATUSES.has(status);
}

export function isOperationalEventStatus(status: EventStatus) {
  return !isTerminalEventStatus(status);
}

export function buildEventSelectionCandidate(
  event: {
    id: string;
    organizationId: string;
    status: EventStatus;
    startAt?: string;
    updatedAt?: string;
    deletedAt?: string | null;
  },
): EventSelectionCandidate {
  return {
    id: event.id,
    organizationId: event.organizationId,
    status: event.status,
    updatedAt: event.updatedAt,
    startAt: event.startAt,
    deletedAt: event.deletedAt ?? null,
  };
}

export function pickCurrentEventCandidate(
  events: readonly EventSelectionCandidate[],
  organizationId: string,
  currentEventId: string,
) {
  const organizationEvents = [...events].filter((event) => event.organizationId === organizationId && event.deletedAt == null);
  const currentEvent = organizationEvents.find((event) => event.id === currentEventId) ?? null;

  if (currentEvent && isOperationalEventStatus(currentEvent.status)) {
    return currentEvent;
  }

  const liveEvent = organizationEvents.find((event) => event.status === "live");
  if (liveEvent) {
    return liveEvent;
  }

  const operationalEvents = organizationEvents
    .filter((event) => isOperationalEventStatus(event.status))
    .sort((a, b) => {
      const statusOrder = a.status === "live" ? 0 : a.status === "published" ? 1 : 2;
      const otherStatusOrder = b.status === "live" ? 0 : b.status === "published" ? 1 : 2;

      if (statusOrder !== otherStatusOrder) {
        return statusOrder - otherStatusOrder;
      }

      const updatedComparison = compareDatesDesc(a.updatedAt, b.updatedAt);
      if (updatedComparison !== 0) {
        return updatedComparison;
      }

      return compareDatesDesc(a.startAt, b.startAt);
    });

  if (operationalEvents.length) {
    return operationalEvents[0];
  }

  if (currentEvent) {
    return currentEvent;
  }

  return organizationEvents
    .sort((a, b) => {
      const statusOrder = a.status === "live" ? 0 : a.status === "published" ? 1 : a.status === "draft" ? 2 : 3;
      const otherStatusOrder = b.status === "live" ? 0 : b.status === "published" ? 1 : b.status === "draft" ? 2 : 3;

      if (statusOrder !== otherStatusOrder) {
        return statusOrder - otherStatusOrder;
      }

      const updatedComparison = compareDatesDesc(a.updatedAt, b.updatedAt);
      if (updatedComparison !== 0) {
        return updatedComparison;
      }

      return compareDatesDesc(a.startAt, b.startAt);
    })[0] ?? null;
}

export function pickCurrentEventId(
  events: readonly EventSelectionCandidate[],
  organizationId: string,
  currentEventId: string,
) {
  return pickCurrentEventCandidate(events, organizationId, currentEventId)?.id ?? "";
}
