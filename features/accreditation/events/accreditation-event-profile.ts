import type { Event } from "@/features/domain/types";
import { getEventTypeLabel, getOperationalModelLabel } from "@/features/events/domain/event-blueprints";

export const ACCREDITATION_PHASE_2_EVENT_TYPES = new Set(["concert", "corporate", "conference", "seminar", "workshop", "theatre"] as const);

export type AccreditationPhase2EventType = "concert" | "corporate" | "conference" | "seminar" | "workshop" | "theatre";

export type AccreditationEventProfile = {
  eventId: string;
  eventName: string;
  eventType: AccreditationPhase2EventType;
  eventTypeLabel: string;
  operationalModel: Event["operationalModel"];
  operationalModelLabel: string;
  scheduleLabel: string;
  venueLabel: string;
  participantCount: number;
  activeParticipantCount: number;
  cancelledParticipantCount: number;
};

function formatEventSchedule(event: Pick<Event, "startAt" | "endAt" | "timezone">) {
  try {
    const formatter = new Intl.DateTimeFormat("es-BO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: event.timezone,
    });

    const start = formatter.format(new Date(event.startAt));

    if (!event.endAt) {
      return start;
    }

    const end = formatter.format(new Date(event.endAt));
    return `${start} · ${end}`;
  } catch {
    return event.endAt ? `${event.startAt} · ${event.endAt}` : event.startAt;
  }
}

export function isAccreditationPhase2EventType(eventType: string): eventType is AccreditationPhase2EventType {
  return ACCREDITATION_PHASE_2_EVENT_TYPES.has(eventType as AccreditationPhase2EventType);
}

export function buildAccreditationEventProfile(
  event: Pick<Event, "id" | "name" | "eventType" | "operationalModel" | "startAt" | "endAt" | "timezone" | "venue">,
  participantStats: {
    participantCount: number;
    activeParticipantCount: number;
    cancelledParticipantCount: number;
  },
): AccreditationEventProfile | null {
  if (!isAccreditationPhase2EventType(event.eventType)) {
    return null;
  }

  return {
    eventId: event.id,
    eventName: event.name,
    eventType: event.eventType,
    eventTypeLabel: getEventTypeLabel(event.eventType),
    operationalModel: event.operationalModel,
    operationalModelLabel: getOperationalModelLabel(event.operationalModel),
    scheduleLabel: formatEventSchedule(event),
    venueLabel: event.venue?.trim() || "Sin venue",
    participantCount: participantStats.participantCount,
    activeParticipantCount: participantStats.activeParticipantCount,
    cancelledParticipantCount: participantStats.cancelledParticipantCount,
  };
}
