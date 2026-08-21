import type { Event as PlatformEvent, Venue } from "@/features/domain/types";
import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import { buildTimelineEvents } from "@/features/timeline/domain/timeline-domain";

export function getReservationsForEvent(eventId: string, reservations: ReservationRecord[]) {
  return reservations.filter((reservation) => reservation.eventId === eventId);
}

export function getEventsForOrganization(organizationId: string, events: PlatformEvent[]) {
  return events.filter((event) => event.organizationId === organizationId);
}

export function getVenuesForOrganization(organizationId: string, venues: Venue[]) {
  return venues.filter((venue) => venue.organizationId === organizationId);
}

export function getReservationsForOrganization(organizationId: string, events: PlatformEvent[], reservations: ReservationRecord[]) {
  const organizationEventIds = new Set(getEventsForOrganization(organizationId, events).map((event) => event.id));
  return reservations.filter((reservation) => organizationEventIds.has(reservation.eventId));
}

export function getGuestsForOrganization(organizationId: string, events: PlatformEvent[], guests: Guest[]) {
  const organizationEventIds = new Set(getEventsForOrganization(organizationId, events).map((event) => event.id));
  return guests.filter((guest) => organizationEventIds.has(guest.eventId));
}

export function getTablesForOrganization(organizationId: string, events: PlatformEvent[], tables: TableRecord[]) {
  const organizationEventIds = new Set(getEventsForOrganization(organizationId, events).map((event) => event.id));
  return tables.filter((table) => Boolean(table.eventId) && organizationEventIds.has(table.eventId as string));
}

export function getCheckInsForOrganization(organizationId: string, events: PlatformEvent[], checkIns: CheckIn[]) {
  const organizationEventIds = new Set(getEventsForOrganization(organizationId, events).map((event) => event.id));
  return checkIns.filter((checkIn) => organizationEventIds.has(checkIn.eventId));
}

export function getTimelineEventsForOrganization(organizationId: string, events: PlatformEvent[], timelineEvents: TimelineEvent[]) {
  const organizationEventIds = new Set(getEventsForOrganization(organizationId, events).map((event) => event.id));
  return timelineEvents.filter((timelineEvent) => Boolean(timelineEvent.eventId) && organizationEventIds.has(timelineEvent.eventId as string));
}

export function getAttendeesForEvent(eventId: string, attendees: Guest[]) {
  return attendees.filter((attendee) => attendee.eventId === eventId);
}

export function getResourcesForEvent(eventId: string, resources: TableRecord[], venueId?: string) {
  const venueResources = venueId ? resources.filter((resource) => resource.venueId === venueId) : [];

  if (venueResources.length) {
    return venueResources;
  }

  return resources.filter((resource) => resource.eventId === eventId);
}

export function getAdmissionsForEvent(eventId: string, admissions: CheckIn[]) {
  return admissions.filter((admission) => admission.eventId === eventId);
}

export function getActivityForEvent({
  eventId,
  reservations,
  attendees,
  admissions,
  attempts,
}: {
  eventId: string;
  reservations: ReservationRecord[];
  attendees: Guest[];
  admissions: CheckIn[];
  attempts: CheckInAttempt[];
}) {
  return buildTimelineEvents({
    eventId,
    reservations,
    guests: attendees,
    checkIns: admissions,
    attempts,
  });
}
