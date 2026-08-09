import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import { buildTimelineEvents } from "@/features/timeline/domain/timeline-domain";

export function getReservationsForEvent(eventId: string, reservations: ReservationRecord[]) {
  return reservations.filter((reservation) => reservation.eventId === eventId);
}

export function getAttendeesForEvent(eventId: string, attendees: Guest[]) {
  return attendees.filter((attendee) => attendee.eventId === eventId);
}

export function getResourcesForEvent(eventId: string, resources: TableRecord[]) {
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

