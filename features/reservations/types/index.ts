import type { TableOption } from "@/features/tables/types";
import type { ReservationCommercialSnapshot } from "@/features/events/domain/commercial-config";
export type { TableOption } from "@/features/tables/types";

export type ReservationType = "Mesa" | "Preventa" | "Cortesía" | "Cumpleaños" | "VIP" | "Corporativo";
export type PaymentMethod = "Efectivo" | "Transferencia" | "Tarjeta" | "Cortesía";
export type PaymentStatus = "Pendiente" | "Parcial" | "Pagado";
export type GuestInvitationState = "Pendiente" | "Lista" | "Enviada" | "Transferida";
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
export type ReservationStatus =
  | "Draft"
  | "Pending"
  | "Confirmed"
  | "Checked In"
  | "Completed"
  | "Cancelled"
  | "No Show";
export type ReservationTone = "success" | "warning" | "danger" | "info";
export type ReservationGuestAction = "confirm" | "cancel" | "check-in" | "revert" | "remove";
export type ReservationGuestInput = {
  guestName: string;
  carnet: string;
  whatsapp: string;
  reason?: string;
};

export type GuestDraft = {
  id: string;
  name: string;
  whatsapp: string;
  document: string;
  invitationState: GuestInvitationState;
  /** Legacy metadata tag only; no access or permission effect. */
  vip: boolean;
  transferBadge: string;
};

export type PaymentHistoryEntry = {
  time: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "info";
};

export type ReservationTimelineEntry = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: ReservationTone;
  actor?: string;
  actorRole?: string;
  context?: string;
  target?: string;
  reason?: string;
};

export type ReservationCreationInput = {
  eventId: string;
  eventName: string;
  date: string;
  time: string;
  reservationType: ReservationType;
  holderName: string;
  holderLastName: string;
  documentValue: string;
  whatsapp: string;
  email: string;
  preferences: string;
  /** Informative metadata tag; derive the operational meaning elsewhere. */
  vip: boolean;
  /** Legacy compatibility bridge; derive from reservation history in UI. */
  frequent: boolean;
  notes: string;
  guests: GuestDraft[];
  selectedResource?: TableOption;
  selectedTable?: TableOption;
  amount: string;
  advance: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  observations: string;
  commercialSnapshot?: ReservationCommercialSnapshot;
  reference?: string;
};

export type ReservationUpdateInput = ReservationCreationInput & {
  reservationId: string;
};

export type ReservationRecord = {
  id: string;
  code: string;
  name: string;
  eventId: string;
  eventName: string;
  date: string;
  time: string;
  eventLayoutId?: string;
  eventLayoutResourceId?: string;
  resourceId?: string;
  resourceName?: string;
  sectorId?: string;
  sectorName?: string;
  venueId?: string;
  tableName: string;
  tableId?: string;
  tableCapacity: number;
  holderName: string;
  holderDocument: string;
  holderWhatsapp: string;
  holderEmail: string;
  reservationType: ReservationType;
  reference?: string;
  paymentStatus: PaymentStatus;
  amount: string;
  advance: string;
  commercialSnapshot?: ReservationCommercialSnapshot;
  notes: string;
  guestIds: string[];
  status: ReservationStatus;
  timeline: ReservationTimelineEntry[];
  createdAt: string;
  updatedAt: string;
};

export type ReservationGuestSummary = {
  id: string;
  guestName: string;
  invitationCode: string;
  invitationSequence: string;
  admissionStatus: string;
  reservationStatus: ReservationStatus;
  deliveryStatus: string;
  tableName?: string;
  checkInTime?: string;
  checkInMethod?: string;
  gate?: string;
  qrStatus?: string;
  extraWristbandSaleId?: string | null;
  manualAdmission?: boolean;
  attention?: string;
  canConfirm: boolean;
  canCancel: boolean;
  canCheckIn: boolean;
  canRevert: boolean;
  canRemove: boolean;
};

export type ReservationMetrics = {
  guestCount: number;
  confirmedGuests: number;
  pendingGuests: number;
  checkedInGuests: number;
  cancelledGuests: number;
  attendancePercent: number;
  occupancyPercent: number;
  capacityRemaining: number;
  lastCheckInAt: string;
};

export type ReservationSummary = {
  id: string;
  code: string;
  name: string;
  eventName: string;
  date: string;
  time: string;
  tableName: string;
  reservationType: ReservationType;
  reference?: string;
  status: ReservationStatus;
  statusTone: ReservationTone;
  metrics: ReservationMetrics;
  paymentStatus: PaymentStatus;
  commercialSnapshot?: ReservationCommercialSnapshot;
  notes: string;
  holderName: string;
  holderDocument: string;
  holderWhatsapp: string;
  guests: ReservationGuestSummary[];
  timeline: ReservationTimelineEntry[];
};
