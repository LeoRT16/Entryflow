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
import {
  resolveCurrentVenueResources,
  resolveCurrentVenueSectors,
} from "../services/workspace-layout-resolution";
import { resolveOrganizationSwitchState } from "../services/workspace-service";
import { resolveReservationWizardResourceOptions } from "../features/reservations/domain/reservation-wizard";
import type { Event, EventLayout, EventLayoutResource, EventLayoutSector, Resource, Sector, Venue, VenueLayoutResource, VenueLayoutSector } from "../features/domain/types";
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

test("reservation wizard keeps Org A resources out of Org B when the primary sector changes", () => {
  const resourceOptions = resolveReservationWizardResourceOptions(
    [
      { id: "resource-a1", sectorId: "org-a-patio-a", eventLayoutResourceId: undefined },
      { id: "resource-a2", sectorId: "org-a-patio-b", eventLayoutResourceId: undefined },
      { id: "resource-b1", sectorId: "org-b-patio-a", eventLayoutResourceId: undefined },
      { id: "resource-b2", sectorId: "org-b-patio-a", eventLayoutResourceId: undefined },
    ],
    "org-b-patio-a",
  );

  assert.deepEqual(resourceOptions.map((resource) => resource.id), ["resource-b1", "resource-b2"]);
});

test("ordered layout resources are still scoped to the current venue when event layouts reference foreign ids", () => {
  const currentVenueId = "venue-b";
  const resources: Resource[] = [
    {
      id: "resource-a1",
      venueId: "venue-a",
      sectorId: "sector-a",
      type: "table",
      name: "Mesa A1",
      capacity: 4,
      status: "Available",
      order: 1,
      metadata: {},
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "resource-b1",
      venueId: "venue-b",
      sectorId: "sector-b",
      type: "table",
      name: "Mesa B1",
      capacity: 4,
      status: "Available",
      order: 1,
      metadata: {},
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const sectors: Sector[] = [
    {
      id: "sector-a",
      venueId: "venue-a",
      name: "Sector A",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "sector-b",
      venueId: "venue-b",
      name: "Sector B",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const venueLayoutResources: VenueLayoutResource[] = [
    {
      id: "venue-layout-resource-a1",
      venueLayoutId: "venue-layout-a",
      sourceResourceId: "resource-a1",
      type: "table",
      name: "Mesa A1",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const eventLayoutResources: EventLayoutResource[] = [
    {
      id: "event-layout-resource-a1",
      eventLayoutId: "event-layout-b",
      sourceVenueLayoutResourceId: "venue-layout-resource-a1",
      type: "table",
      name: "Mesa A1",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const venueLayoutSectors: VenueLayoutSector[] = [
    {
      id: "venue-layout-sector-a",
      venueLayoutId: "venue-layout-a",
      sourceSectorId: "sector-a",
      name: "Sector A",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const eventLayoutSectors: EventLayoutSector[] = [
    {
      id: "event-layout-sector-a",
      eventLayoutId: "event-layout-b",
      sourceVenueLayoutSectorId: "venue-layout-sector-a",
      name: "Sector A",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const currentEventLayout: EventLayout = {
    id: "event-layout-b",
    eventId: "event-b",
    venueId: "venue-b",
    name: "Layout B",
    status: "active",
    createdAt: "2026-08-21T10:00:00.000Z",
    updatedAt: "2026-08-21T10:00:00.000Z",
  };

  const currentVenueResources = resolveCurrentVenueResources({
    currentVenueId,
    currentEventLayout,
    venueLayout: null,
    resources,
    venueLayoutResources,
    eventLayoutResources,
  });
  const currentVenueSectors = resolveCurrentVenueSectors({
    currentVenueId,
    currentEventLayout,
    venueLayout: null,
    sectors,
    venueLayoutSectors,
    eventLayoutSectors,
  });

  assert.deepEqual(currentVenueResources.map((resource) => resource.id), ["resource-b1"]);
  assert.deepEqual(currentVenueSectors.map((sector) => sector.id), ["sector-b"]);
  assert.ok(currentVenueResources.every((resource) => resource.venueId === currentVenueId));
  assert.ok(currentVenueSectors.every((sector) => sector.venueId === currentVenueId));
});

test("ordered layout resources preserve valid current-venue ordering", () => {
  const currentVenueId = "venue-b";
  const resources: Resource[] = [
    {
      id: "resource-b1",
      venueId: "venue-b",
      sectorId: "sector-b",
      type: "table",
      name: "Mesa B1",
      capacity: 4,
      status: "Available",
      order: 2,
      metadata: {},
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "resource-b2",
      venueId: "venue-b",
      sectorId: "sector-b",
      type: "table",
      name: "Mesa B2",
      capacity: 4,
      status: "Available",
      order: 3,
      metadata: {},
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "resource-b3",
      venueId: "venue-b",
      sectorId: "sector-b",
      type: "table",
      name: "Mesa B3",
      capacity: 4,
      status: "Available",
      order: 1,
      metadata: {},
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const eventLayoutResources: EventLayoutResource[] = [
    {
      id: "event-layout-resource-b3",
      eventLayoutId: "event-layout-b",
      sourceVenueLayoutResourceId: "venue-layout-resource-b3",
      type: "table",
      name: "Mesa B3",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "event-layout-resource-b1",
      eventLayoutId: "event-layout-b",
      sourceVenueLayoutResourceId: "venue-layout-resource-b1",
      type: "table",
      name: "Mesa B1",
      capacity: 4,
      status: "active",
      order: 2,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const venueLayoutResources: VenueLayoutResource[] = [
    {
      id: "venue-layout-resource-b1",
      venueLayoutId: "venue-layout-b",
      sourceResourceId: "resource-b1",
      type: "table",
      name: "Mesa B1",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "venue-layout-resource-b3",
      venueLayoutId: "venue-layout-b",
      sourceResourceId: "resource-b3",
      type: "table",
      name: "Mesa B3",
      capacity: 4,
      status: "active",
      order: 2,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const eventLayout = {
    id: "event-layout-b",
    eventId: "event-b",
    venueId: currentVenueId,
    name: "Layout B",
    status: "active",
    createdAt: "2026-08-21T10:00:00.000Z",
    updatedAt: "2026-08-21T10:00:00.000Z",
  } as EventLayout;

  const currentVenueResources = resolveCurrentVenueResources({
    currentVenueId,
    currentEventLayout: eventLayout,
    venueLayout: null,
    resources,
    venueLayoutResources,
    eventLayoutResources,
  });

  assert.deepEqual(currentVenueResources.map((resource) => resource.id), ["resource-b3", "resource-b1", "resource-b2"]);
  assert.ok(currentVenueResources.every((resource) => resource.venueId === currentVenueId));
});

test("foreign refs are rejected when current venue switches in either direction", () => {
  const resources: Resource[] = [
    {
      id: "resource-a",
      venueId: "venue-a",
      sectorId: "sector-a",
      type: "table",
      name: "Mesa A",
      capacity: 4,
      status: "Available",
      order: 1,
      metadata: {},
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "resource-b",
      venueId: "venue-b",
      sectorId: "sector-b",
      type: "table",
      name: "Mesa B",
      capacity: 4,
      status: "Available",
      order: 1,
      metadata: {},
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const sectors: Sector[] = [
    {
      id: "sector-a",
      venueId: "venue-a",
      name: "Sector A",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "sector-b",
      venueId: "venue-b",
      name: "Sector B",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const venueLayoutResources: VenueLayoutResource[] = [
    {
      id: "venue-layout-resource-a",
      venueLayoutId: "venue-layout-a",
      sourceResourceId: "resource-a",
      type: "table",
      name: "Mesa A",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "venue-layout-resource-b",
      venueLayoutId: "venue-layout-b",
      sourceResourceId: "resource-b",
      type: "table",
      name: "Mesa B",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const venueLayoutSectors: VenueLayoutSector[] = [
    {
      id: "venue-layout-sector-a",
      venueLayoutId: "venue-layout-a",
      sourceSectorId: "sector-a",
      name: "Sector A",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "venue-layout-sector-b",
      venueLayoutId: "venue-layout-b",
      sourceSectorId: "sector-b",
      name: "Sector B",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const eventLayoutResources: EventLayoutResource[] = [
    {
      id: "event-layout-resource-a",
      eventLayoutId: "event-layout-a",
      sourceVenueLayoutResourceId: "venue-layout-resource-b",
      type: "table",
      name: "Mesa B",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "event-layout-resource-b",
      eventLayoutId: "event-layout-b",
      sourceVenueLayoutResourceId: "venue-layout-resource-a",
      type: "table",
      name: "Mesa A",
      capacity: 4,
      status: "active",
      order: 1,
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];
  const eventLayoutSectors: EventLayoutSector[] = [
    {
      id: "event-layout-sector-a",
      eventLayoutId: "event-layout-a",
      sourceVenueLayoutSectorId: "venue-layout-sector-b",
      name: "Sector B",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
    {
      id: "event-layout-sector-b",
      eventLayoutId: "event-layout-b",
      sourceVenueLayoutSectorId: "venue-layout-sector-a",
      name: "Sector A",
      order: 1,
      status: "active",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];

  const currentVenueBResources = resolveCurrentVenueResources({
    currentVenueId: "venue-b",
    currentEventLayout: { id: "event-layout-a", eventId: "event-a", venueId: "venue-a", name: "Layout A", status: "active", createdAt: "2026-08-21T10:00:00.000Z", updatedAt: "2026-08-21T10:00:00.000Z" } as EventLayout,
    venueLayout: null,
    resources,
    venueLayoutResources,
    eventLayoutResources,
  });
  const currentVenueASectors = resolveCurrentVenueSectors({
    currentVenueId: "venue-a",
    currentEventLayout: { id: "event-layout-b", eventId: "event-b", venueId: "venue-b", name: "Layout B", status: "active", createdAt: "2026-08-21T10:00:00.000Z", updatedAt: "2026-08-21T10:00:00.000Z" } as EventLayout,
    venueLayout: null,
    sectors,
    venueLayoutSectors,
    eventLayoutSectors,
  });

  assert.deepEqual(currentVenueBResources.map((resource) => resource.id), ["resource-b"]);
  assert.deepEqual(currentVenueASectors.map((sector) => sector.id), ["sector-a"]);
  assert.ok(currentVenueBResources.every((resource) => resource.venueId === "venue-b"));
  assert.ok(currentVenueASectors.every((sector) => sector.venueId === "venue-a"));
});
