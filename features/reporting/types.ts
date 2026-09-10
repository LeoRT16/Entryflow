import type { CheckIn, Guest } from "@/features/check-in/types";
import type { Event, EventLayout, EventLayoutResource, EventLayoutSector, Organization, Resource, ResourceType, Sector, Venue } from "@/features/domain/types";
import type { ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";
import type { ReservationRecord, ReservationStatus, ReservationType } from "@/features/reservations/types";
import type { TimelineEvent } from "@/features/timeline/types";
import type { TableRecord } from "@/features/tables/types";

export type MoneyValue = {
  currency: string | null;
  amount: number | null;
  complete: boolean;
  currencies: string[];
};

export type ReportDiagnosticCode =
  | "commercial_snapshot_missing"
  | "commercial_currency_mixed"
  | "historical_resource_unresolved"
  | "historical_sector_unresolved"
  | "entity_relation_inconsistent"
  | "presale_quantity_mismatch"
  | "presale_overloaded"
  | "checkin_record_missing"
  | "checkin_state_inconsistent";

export type ReportDiagnostic = {
  code: ReportDiagnosticCode;
  severity: "warning" | "error";
  entityType: "event" | "reservation" | "guest" | "extra_wristband_sale" | "resource" | "sector";
  entityId: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type EventReportMetadata = {
  organizationId: string;
  organizationName: string;
  eventId: string;
  eventName: string;
  eventStatus: Event["status"];
  eventStartAt: string;
  timezone: string;
  venueId?: string;
  venueName: string;
  generatedAt: string;
};

export type EventReportSummary = {
  activeReservations: number;
  cancelledReservations: number;
  operationalPeople: number;
  historicalPeople: number;
  checkedInPeople: number;
  pendingPeople: number;
  activeCourtesyPeople: number;
  presalePurchases: number;
  presaleAccessesSold: number;
  activeExtraWristbands: number;
};

export type CommercialReportCategory = {
  transactions: number;
  people: number;
  value: MoneyValue;
};

export type CommercialReportView = {
  mesas: CommercialReportCategory;
  presales: CommercialReportCategory;
  extraWristbands: CommercialReportCategory;
  courtesies: CommercialReportCategory;
  total: MoneyValue;
};

export type ReservationReport = {
  id: string;
  code: string;
  type: ReservationType;
  holder: string;
  status: ReservationStatus;
  operational: boolean;
  historical: boolean;
  commercialSold: boolean;
  date: string;
  time: string;
  resourceId: string | null;
  sectorId: string | null;
  operationalPeople: number;
  historicalPeople: number;
  checkedInPeople: number;
  pendingPeople: number;
  cancelledPeople: number;
  soldValue: MoneyValue;
  extraWristbandValue: MoneyValue;
  soldTotal: MoneyValue;
  diagnostics: ReportDiagnostic[];
};

export type PresaleReport = {
  reservationId: string;
  reservationCode: string;
  holder: string;
  status: ReservationStatus;
  quantityPurchased: number | null;
  loadedPeople: number;
  remainingToLoad: number | null;
  checkedInPeople: number;
  pendingPeople: number;
  cancelledPeople: number;
  currency: string | null;
  unitPrice: MoneyValue;
  soldTotal: MoneyValue;
  operational: boolean;
  historical: boolean;
  diagnostics: ReportDiagnostic[];
};

export type CourtesyReport = {
  reservationId: string;
  reservationCode: string;
  reference: string | null;
  status: ReservationStatus;
  operational: boolean;
  operationalPeople: number;
  checkedInPeople: number;
  pendingPeople: number;
  cancelledPeopleHistorical: number;
  commercialAmount: MoneyValue;
  attendeeIds: string[];
  cancelledAttendeeIds: string[];
  diagnostics: ReportDiagnostic[];
};

export type ActivityReport = {
  id: string;
  type: string;
  createdAt: string | null;
  eventId: string;
  reservationId: string | null;
  guestId: string | null;
  actor: string | null;
  reason: string | null;
  label: string;
  context: string | null;
  metadata: Record<string, unknown>;
};

export type AttendeeReport = {
  guestId: string;
  name: string;
  carnet: string;
  whatsapp: string;
  accessCode: string;
  reservationId: string;
  reservationCode: string;
  accessType: "mesa" | "presale" | "courtesy" | "extra_wristband" | "other";
  operational: boolean;
  admissionStatus: Guest["admissionStatus"];
  reservationStatus: Guest["reservationStatus"];
  qrStatus: Guest["qrStatus"];
  checkedIn: boolean;
  checkInAt?: string;
  extraWristband: boolean;
  extraWristbandSaleId?: string;
};

export type ResourceReport = {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  sectorId: string | null;
  sectorName: string | null;
  venueId: string;
  venueName: string;
  activeInventory: boolean;
  physicalCapacity: number;
  capacityAssigned: number;
  reservationIds: string[];
  activeReservationId: string | null;
  reservationCount: number;
  baseAccesses: number;
  extraWristbands: number;
  operationalPeople: number;
  historicalPeople: number;
  checkedInPeople: number;
  pendingPeople: number;
  soldReservationValue: MoneyValue;
  extraWristbandValue: MoneyValue;
  soldTotal: MoneyValue;
  diagnostics: ReportDiagnostic[];
};

export type ZoneReport = {
  sectorId: string;
  sectorName: string;
  resourceCount: number;
  physicalCapacity: number;
  capacityAssigned: number;
  baseAccesses: number;
  extraWristbands: number;
  operationalPeople: number;
  historicalPeople: number;
  checkedInPeople: number;
  pendingPeople: number;
  soldReservationValue: MoneyValue;
  extraWristbandValue: MoneyValue;
  soldTotal: MoneyValue;
  resources: ResourceReport[];
  diagnostics: ReportDiagnostic[];
};

export type EventReport = {
  version: 1;
  metadata: EventReportMetadata;
  summary: EventReportSummary;
  commercial: {
    sold: CommercialReportView;
    operational: CommercialReportView;
  };
  zones: ZoneReport[];
  resources: ResourceReport[];
  reservations: ReservationReport[];
  presales: PresaleReport[];
  courtesies: CourtesyReport[];
  attendees: AttendeeReport[];
  historical: {
    cancelledReservationIds: string[];
    completedReservationIds: string[];
    noShowReservationIds: string[];
    cancelledAttendeeIds: string[];
    cancelledExtraWristbandSaleIds: string[];
    activity: ActivityReport[];
  };
  diagnostics: ReportDiagnostic[];
};

export type BuildEventReportInput = {
  organization: Organization;
  event: Event;
  venue?: Venue;
  resources: Resource[];
  sectors: Sector[];
  tables: TableRecord[];
  eventLayoutResources: EventLayoutResource[];
  eventLayoutSectors: EventLayoutSector[];
  eventLayouts: EventLayout[];
  reservations: ReservationRecord[];
  guests: Guest[];
  extraWristbandSales: ExtraWristbandSale[];
  checkIns: CheckIn[];
  timelineEvents: TimelineEvent[];
  generatedAt: string;
};
