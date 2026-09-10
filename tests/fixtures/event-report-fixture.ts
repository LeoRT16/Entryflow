import type { CheckIn, Guest } from "../../features/check-in/types";
import type { Event, EventLayout, EventLayoutResource, EventLayoutSector, Organization, Resource, Sector, Venue } from "../../features/domain/types";
import type { ExtraWristbandSale } from "../../features/reservations/domain/extra-wristbands";
import type { ReservationRecord, ReservationStatus, ReservationType } from "../../features/reservations/types";
import type { TimelineEvent } from "../../features/timeline/types";
import type { TableRecord } from "../../features/tables/types";

const eventId = "event-report-e2e";

export const reportOrganization: Organization = {
  id: "organization-report",
  name: "EntryFlow Test",
  slug: "entryflow-test",
  status: "active",
  timezone: "America/La_Paz",
  branding: {},
  settings: {},
};

export const reportVenue: Venue = {
  id: "venue-report",
  organizationId: reportOrganization.id,
  name: "Rota Carlota",
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

export const reportEvent: Event = {
  id: eventId,
  organizationId: reportOrganization.id,
  name: "Boliche Reporting E2E",
  eventType: "nightlife",
  status: "finished",
  startAt: "2026-09-02T21:00:00-04:00",
  timezone: "America/La_Paz",
  venueId: reportVenue.id,
  venue: reportVenue.name,
  capacity: 10,
  enabledModules: [],
  operationalModel: "assigned-resources",
  admissionMethods: ["qr", "manual"],
  resourceTypes: ["table"],
};

function reservation({
  id,
  code,
  type,
  status,
  price,
  quantity,
  resource,
}: {
  id: string;
  code: string;
  type: ReservationType;
  status: ReservationStatus;
  price?: number;
  quantity?: number;
  resource?: "mesa-1" | "mesa-2";
}): ReservationRecord {
  const isPresale = type === "Preventa";
  return {
    id,
    code,
    name: `${type} ${code}`,
    eventId,
    eventName: reportEvent.name,
    date: "2026-09-02",
    time: "21:00",
    eventLayoutId: resource ? "event-layout-report" : undefined,
    eventLayoutResourceId: resource ? `layout-${resource}` : undefined,
    resourceId: resource,
    resourceName: resource === "mesa-1" ? "Mesa 1 persistida" : resource === "mesa-2" ? "Mesa 2 persistida" : undefined,
    sectorId: resource ? "sector-patio" : undefined,
    sectorName: resource ? "Patio persistido" : undefined,
    venueId: resource ? reportVenue.id : undefined,
    tableName: resource === "mesa-1" ? "Mesa 1 persistida" : resource === "mesa-2" ? "Mesa 2 persistida" : "",
    tableId: resource,
    tableCapacity: resource ? 5 : 0,
    holderName: `Titular ${code}`,
    holderDocument: "123456",
    holderWhatsapp: "70000000",
    holderEmail: "",
    reservationType: type,
    reference: type === "Cortesía" ? "Prensa" : undefined,
    paymentStatus: type === "Cortesía" ? "Pendiente" : "Pagado",
    amount: "999999",
    advance: "0",
    commercialSnapshot: type === "Cortesía" || price === undefined ? undefined : {
      version: 1,
      ...(isPresale ? { saleType: "presale" as const } : {}),
      currency: "BOB",
      reservationPrice: isPresale ? price / Math.max(quantity ?? 1, 1) : price,
      ...(isPresale ? { unitPrice: price / Math.max(quantity ?? 1, 1), quantity, totalPrice: price } : {}),
      includedAccesses: quantity ?? 0,
      benefits: [],
    },
    notes: "",
    guestIds: [],
    status,
    timeline: [],
    createdAt: "2026-09-02T18:00:00.000Z",
    updatedAt: "2026-09-02T23:00:00.000Z",
  };
}

export const reportReservations: ReservationRecord[] = [
  reservation({ id: "mesa-active", code: "M-01", type: "Mesa", status: "Confirmed", price: 400, quantity: 5, resource: "mesa-1" }),
  reservation({ id: "mesa-second", code: "M-02", type: "Mesa", status: "Confirmed", price: 400, quantity: 2, resource: "mesa-2" }),
  reservation({ id: "presale-individual", code: "P-01", type: "Preventa", status: "Confirmed", price: 50, quantity: 1 }),
  reservation({ id: "presale-group", code: "P-02", type: "Preventa", status: "Confirmed", price: 150, quantity: 3 }),
  reservation({ id: "courtesy-active", code: "C-01", type: "Cortesía", status: "Confirmed" }),
  reservation({ id: "cart5-cancelled", code: "CART5", type: "Mesa", status: "Cancelled", price: 999 }),
];

function guest(index: number, reservationId: string, overrides: Partial<Guest> = {}): Guest {
  const reservation = reportReservations.find((item) => item.id === reservationId)!;
  const checkedIn = overrides.admissionStatus === "Ingresó";
  return {
    id: `guest-${index}`,
    guestName: `Persona ${index}`,
    reservationName: reservation.name,
    reservationCode: reservation.code,
    reservationId,
    eventId,
    eventName: reportEvent.name,
    eventStatus: "En curso",
    invitationSequence: String(index),
    invitationCode: `${reservation.code}-${String(index).padStart(2, "0")}`,
    carnet: String(1000 + index),
    whatsapp: `700000${String(index).padStart(2, "0")}`,
    deliveryStatus: "Enviada",
    admissionStatus: "Pendiente",
    reservationStatus: reservation.status,
    deliveryHistory: [],
    operatorActivity: [],
    qrStatus: checkedIn ? "Usado" : "Válido",
    ...overrides,
  };
}

export const reportGuests: Guest[] = [
  ...Array.from({ length: 5 }, (_, index) => guest(index + 1, "mesa-active", index < 2 ? { admissionStatus: "Ingresó", checkInTime: `22:0${index}` } : {})),
  ...Array.from({ length: 2 }, (_, index) => guest(index + 6, "mesa-second")),
  guest(8, "presale-individual", { admissionStatus: "Ingresó", checkInTime: "22:10" }),
  ...Array.from({ length: 3 }, (_, index) => guest(index + 9, "presale-group", index === 0 ? { admissionStatus: "Ingresó", checkInTime: "22:11" } : {})),
  ...Array.from({ length: 4 }, (_, index) => guest(index + 12, "courtesy-active", index === 0 ? { admissionStatus: "Ingresó", checkInTime: "22:11" } : {})),
  guest(16, "mesa-active", { admissionStatus: "Ingresó", checkInTime: "22:12", extraWristbandSaleId: "extra-active" }),
  guest(17, "mesa-active", { extraWristbandSaleId: "extra-active" }),
  guest(18, "courtesy-active", { admissionStatus: "Anulada", reservationStatus: "Cancelled", qrStatus: "Anulado" }),
];

export const reportExtraWristbandSales: ExtraWristbandSale[] = [
  {
    id: "extra-active",
    reservationId: "mesa-active",
    eventId,
    quantity: 2,
    unitPrice: 60,
    totalPrice: 120,
    currency: "BOB",
    status: "active",
    createdAt: "2026-09-02T20:00:00.000Z",
  },
  {
    id: "extra-cancelled",
    reservationId: "mesa-active",
    eventId,
    quantity: 1,
    unitPrice: 60,
    totalPrice: 60,
    currency: "BOB",
    status: "cancelled",
    createdAt: "2026-09-02T20:05:00.000Z",
    cancelledAt: "2026-09-02T20:10:00.000Z",
  },
];

export const reportCheckIns: CheckIn[] = reportGuests
  .filter((item) => item.admissionStatus === "Ingresó")
  .map((item) => ({
    id: `checkin-${item.id}`,
    guestId: item.id,
    reservationId: item.reservationId,
    eventId,
    accessType: "reservation",
    method: "QR",
    checkedInAt: `2026-09-02T${item.checkInTime}:00-04:00`,
    operator: "Operador",
    auditTrail: [],
    reentryAllowed: false,
    maxEntries: 1,
    attemptCount: 1,
    status: "Checked In",
  }));

export const reportTimelineEvents: TimelineEvent[] = [{
  id: "timeline-1",
  eventId,
  createdAt: "2026-09-02T22:30:00-04:00",
  timestamp: "22:30",
  kind: "guest.cancelled",
  icon: "guest",
  tone: "danger",
  title: "Invitado cancelado",
  description: "Cancelación histórica del fixture",
  actor: "Operador",
  reservationId: "courtesy-active",
  guestId: "guest-18",
  context: "Puerta principal",
  metadata: { reason: "Solicitud del titular", qrToken: "must-not-leak" },
}];

export const reportSectors: Sector[] = [{
  id: "sector-current",
  venueId: reportVenue.id,
  name: "Patio vigente",
  order: 1,
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}];

export const reportResources: Resource[] = ["mesa-1", "mesa-2"].map((id, index) => ({
  id,
  venueId: reportVenue.id,
  sectorId: "sector-current",
  type: "table",
  name: `Mesa ${index + 1} renombrada`,
  capacity: 99,
  status: "Available",
  order: index + 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
}));

export const reportEventLayouts: EventLayout[] = [{
  id: "event-layout-report",
  eventId,
  venueId: reportVenue.id,
  name: "Layout del evento",
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}];

export const reportEventLayoutSectors: EventLayoutSector[] = [{
  id: "layout-sector-patio",
  eventLayoutId: "event-layout-report",
  name: "Patio",
  capacity: 10,
  order: 1,
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}];

export const reportEventLayoutResources: EventLayoutResource[] = ["mesa-1", "mesa-2"].map((id, index) => ({
  id: `layout-${id}`,
  eventLayoutId: "event-layout-report",
  eventLayoutSectorId: "layout-sector-patio",
  type: "table",
  name: `Mesa ${index + 1}`,
  capacity: 5,
  status: "active",
  order: index + 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}));

export const reportTables: TableRecord[] = [];

export function buildEventReportFixtureInput() {
  return {
    organization: reportOrganization,
    event: reportEvent,
    venue: reportVenue,
    resources: reportResources,
    sectors: reportSectors,
    tables: reportTables,
    eventLayouts: reportEventLayouts,
    eventLayoutResources: reportEventLayoutResources,
    eventLayoutSectors: reportEventLayoutSectors,
    reservations: reportReservations,
    guests: reportGuests,
    extraWristbandSales: reportExtraWristbandSales,
    checkIns: reportCheckIns,
    timelineEvents: reportTimelineEvents,
    generatedAt: "2026-09-03T04:00:00.000Z",
  };
}
