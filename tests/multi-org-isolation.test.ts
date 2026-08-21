import assert from "node:assert/strict";
import test from "node:test";

import {
  getCheckInsForOrganization,
  getEventsForOrganization,
  getGuestsForOrganization,
  getReservationsForOrganization,
  getTablesForOrganization,
  getTimelineEventsForOrganization,
  getVenuesForOrganization,
} from "../features/domain/selectors";
import { resolveOrganizationSwitchState } from "../services/workspace-service";
import type { Event, Venue } from "../features/domain/types";
import type { CheckIn } from "../features/check-in/types";
import type { Guest } from "../features/check-in/types";
import type { ReservationRecord } from "../features/reservations/types";
import type { TableRecord } from "../features/tables/types";
import type { TimelineEvent } from "../features/timeline/types";
import type { OrganizationMembership } from "../features/accounts/types";

function buildEvent(id: string, organizationId: string): Event {
  return {
    id,
    organizationId,
    name: `${organizationId}-${id}`,
    eventType: "custom",
    status: "live",
    startAt: "2026-08-21T20:00:00.000Z",
    timezone: "America/La_Paz",
    venueId: `${organizationId}-venue`,
    venue: `${organizationId} venue`,
    capacity: 100,
    enabledModules: [],
    operationalModel: "mixed",
    admissionMethods: [],
    resourceTypes: [],
    metadata: {},
  };
}

function buildVenue(id: string, organizationId: string): Venue {
  return {
    id,
    organizationId,
    name: `${organizationId} venue`,
    status: "active",
    createdAt: "2026-08-21T10:00:00.000Z",
    updatedAt: "2026-08-21T10:00:00.000Z",
    metadata: {},
  };
}

function buildMembership(id: string, organizationId: string, roleId: string): OrganizationMembership {
  return {
    id,
    organizationId,
    userId: "user-1",
    roleId,
    displayName: `${organizationId} member`,
    attributes: {},
    status: "active",
    createdAt: "2026-08-21T10:00:00.000Z",
    updatedAt: "2026-08-21T10:00:00.000Z",
    deletedAt: null,
  };
}

test("organization switch clears cross-organization event selection and preserves roundtrip context", () => {
  const events = [buildEvent("event-a", "org-a")];
  const profiles = [buildMembership("profile-a", "org-a", "role-owner"), buildMembership("profile-b", "org-b", "role-admin")];

  const switchedToB = resolveOrganizationSwitchState({
    organizationId: "org-b",
    events,
    profiles,
    currentEventId: "event-a",
    currentProfileId: "profile-a",
    currentUserId: "user-1",
  });

  assert.equal(switchedToB.currentOrganizationId, "org-b");
  assert.equal(switchedToB.currentEventId, "");
  assert.equal(switchedToB.currentProfileId, "profile-b");

  const switchedBackToA = resolveOrganizationSwitchState({
    organizationId: "org-a",
    events,
    profiles,
    currentEventId: switchedToB.currentEventId,
    currentProfileId: switchedToB.currentProfileId,
    currentUserId: "user-1",
  });

  assert.equal(switchedBackToA.currentOrganizationId, "org-a");
  assert.equal(switchedBackToA.currentEventId, "event-a");
  assert.equal(switchedBackToA.currentProfileId, "profile-a");
});

test("organization-scoped selectors exclude data from other organizations", () => {
  const orgAEvents = [buildEvent("event-a", "org-a"), buildEvent("event-b", "org-b")];
  const venues: Venue[] = [buildVenue("venue-a", "org-a"), buildVenue("venue-b", "org-b")];
  const reservations: ReservationRecord[] = [
    { id: "reservation-a", code: "A", name: "A", eventId: "event-a", eventName: "A", date: "2026-08-21", time: "20:00", tableName: "", tableId: "", tableCapacity: 0, holderName: "", holderDocument: "", holderWhatsapp: "", holderEmail: "", reservationType: "Mesa", paymentStatus: "Pendiente", amount: "0", advance: "0", notes: "", guestIds: [], status: "Pending", timeline: [], createdAt: "2026-08-21T10:00:00.000Z", updatedAt: "2026-08-21T10:00:00.000Z" },
    { id: "reservation-b", code: "B", name: "B", eventId: "event-b", eventName: "B", date: "2026-08-21", time: "20:00", tableName: "", tableId: "", tableCapacity: 0, holderName: "", holderDocument: "", holderWhatsapp: "", holderEmail: "", reservationType: "Mesa", paymentStatus: "Pendiente", amount: "0", advance: "0", notes: "", guestIds: [], status: "Pending", timeline: [], createdAt: "2026-08-21T10:00:00.000Z", updatedAt: "2026-08-21T10:00:00.000Z" },
  ];
  const guests: Guest[] = [
    { id: "guest-a", guestName: "A", reservationName: "A", reservationCode: "A", reservationId: "reservation-a", eventId: "event-a", eventName: "A", eventStatus: "En curso", invitationSequence: "1", invitationCode: "1", carnet: "1", whatsapp: "", deliveryStatus: "Pendiente de envío", admissionStatus: "Pendiente", reservationStatus: "Pending", deliveryHistory: [], operatorActivity: [], qrStatus: "Válido" },
    { id: "guest-b", guestName: "B", reservationName: "B", reservationCode: "B", reservationId: "reservation-b", eventId: "event-b", eventName: "B", eventStatus: "En curso", invitationSequence: "2", invitationCode: "2", carnet: "2", whatsapp: "", deliveryStatus: "Pendiente de envío", admissionStatus: "Pendiente", reservationStatus: "Pending", deliveryHistory: [], operatorActivity: [], qrStatus: "Válido" },
  ];
  const tables: TableRecord[] = [
    { id: "table-a", venueId: "venue-a", type: "table", name: "A", capacity: 4, status: "Available", order: 1, location: "L1", reservationIds: [], guestIds: [], closed: false, eventId: "event-a", createdAt: "2026-08-21T10:00:00.000Z", updatedAt: "2026-08-21T10:00:00.000Z", metadata: {} } as TableRecord,
    { id: "table-b", venueId: "venue-b", type: "table", name: "B", capacity: 4, status: "Available", order: 1, location: "L1", reservationIds: [], guestIds: [], closed: false, eventId: "event-b", createdAt: "2026-08-21T10:00:00.000Z", updatedAt: "2026-08-21T10:00:00.000Z", metadata: {} } as TableRecord,
  ];
  const checkIns: CheckIn[] = [
    { id: "checkin-a", eventId: "event-a", accessType: "qr", method: "QR", checkedInAt: "20:00", operator: "Door", auditTrail: [], reentryAllowed: true, maxEntries: 1, attemptCount: 1, lastAttemptAt: "20:00", status: "Checked In", guestId: "guest-a", reservationId: "reservation-a" } as CheckIn,
    { id: "checkin-b", eventId: "event-b", accessType: "qr", method: "QR", checkedInAt: "20:00", operator: "Door", auditTrail: [], reentryAllowed: true, maxEntries: 1, attemptCount: 1, lastAttemptAt: "20:00", status: "Checked In", guestId: "guest-b", reservationId: "reservation-b" } as CheckIn,
  ];
  const timelineEvents: TimelineEvent[] = [
    { id: "timeline-a", eventId: "event-a", timestamp: "20:00", kind: "timeline.note", icon: "alert", tone: "info", title: "A", description: "A" },
    { id: "timeline-b", eventId: "event-b", timestamp: "20:00", kind: "timeline.note", icon: "alert", tone: "info", title: "B", description: "B" },
  ];

  assert.deepEqual(getEventsForOrganization("org-a", orgAEvents).map((event) => event.id), ["event-a"]);
  assert.deepEqual(getVenuesForOrganization("org-a", venues).map((venue) => venue.id), ["venue-a"]);
  assert.deepEqual(getReservationsForOrganization("org-a", orgAEvents, reservations).map((reservation) => reservation.id), ["reservation-a"]);
  assert.deepEqual(getGuestsForOrganization("org-a", orgAEvents, guests).map((guest) => guest.id), ["guest-a"]);
  assert.deepEqual(getTablesForOrganization("org-a", orgAEvents, tables).map((table) => table.id), ["table-a"]);
  assert.deepEqual(getCheckInsForOrganization("org-a", orgAEvents, checkIns).map((checkIn) => checkIn.id), ["checkin-a"]);
  assert.deepEqual(getTimelineEventsForOrganization("org-a", orgAEvents, timelineEvents).map((entry) => entry.id), ["timeline-a"]);

  assert.deepEqual(getEventsForOrganization("org-b", orgAEvents).map((event) => event.id), ["event-b"]);
  assert.deepEqual(getVenuesForOrganization("org-b", venues).map((venue) => venue.id), ["venue-b"]);
  assert.deepEqual(getReservationsForOrganization("org-b", orgAEvents, reservations).map((reservation) => reservation.id), ["reservation-b"]);
  assert.deepEqual(getGuestsForOrganization("org-b", orgAEvents, guests).map((guest) => guest.id), ["guest-b"]);
  assert.deepEqual(getTablesForOrganization("org-b", orgAEvents, tables).map((table) => table.id), ["table-b"]);
  assert.deepEqual(getCheckInsForOrganization("org-b", orgAEvents, checkIns).map((checkIn) => checkIn.id), ["checkin-b"]);
  assert.deepEqual(getTimelineEventsForOrganization("org-b", orgAEvents, timelineEvents).map((entry) => entry.id), ["timeline-b"]);
});
