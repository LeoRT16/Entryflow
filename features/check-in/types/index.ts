import type { ReservationStatus } from "@/features/reservations/types";

export type EntryStatus = "Pendiente" | "Ingresó" | "Anulada" | "Bloqueada";

export type CheckInMethod = "QR" | "Manual";

export type QrStatus = "Válido" | "Usado" | "Anulado" | "Bloqueado" | "Inexistente";

export type AccessType = "reservation" | "invitation" | "ticket" | "qr" | "staff" | "vip" | "list" | "manual";

export type AccessStatus =
  | "Pending"
  | "Confirmed"
  | "Checked In"
  | "Checked Out"
  | "Cancelled"
  | "Rejected"
  | "Blocked"
  | "Expired"
  | "Transferred"
  | "Duplicate Attempt"
  | "No Show";

export type AccessAuditKind =
  | "reservation.created"
  | "invitation.sent"
  | "access.confirmed"
  | "access.checked_in"
  | "access.checked_out"
  | "access.manual_override"
  | "access.duplicate_attempt"
  | "access.rejected"
  | "access.blocked"
  | "access.cancelled"
  | "access.transferred"
  | "access.expired";

export type AccessAuditEntry = {
  id: string;
  timestamp: string;
  kind: AccessAuditKind;
  title: string;
  description: string;
  tone: "success" | "warning" | "danger" | "info";
  operator?: string;
  gate?: string;
  metadata?: Record<string, unknown>;
};

export type Event = {
  id: string;
  name: string;
  status: "En curso" | "Próximo";
  date: string;
  startsAt: string;
  expectedGuests: number;
  checkedIn: number;
  pending: number;
  reservations: number;
  attention: number;
};

export type Invitation = {
  id: string;
  guestId: string;
  reservationId: string;
  code: string;
  sequence: string;
  deliveryStatus: "Pendiente de envío" | "Enviada" | "Reenviada" | "Vista" | "Fallida";
  qrStatus: QrStatus;
};

export type Reservation = {
  id: string;
  code: string;
  name: string;
  eventId: string;
  eventName: string;
  tableId?: string;
  tableName?: string;
  guestIds: string[];
  guestCount: number;
  checkedInCount: number;
  pendingCount: number;
  status: ReservationStatus;
  source: string;
  time: string;
  tone: "success" | "warning" | "danger" | "info";
};

export type Guest = {
  id: string;
  guestName: string;
  reservationName: string;
  reservationCode: string;
  reservationId: string;
  eventId: string;
  eventName: string;
  /** Identidad lógica interna del access grant asociado a este invitado. */
  accessGrantId?: string;
  /** Código visible para operadores y para fallback manual. */
  accessCode?: string;
  /** Token opaco que debe codificar el QR escaneable. */
  qrToken?: string;
  tableId?: string;
  tableName?: string;
  eventStatus: "En curso" | "Próximo";
  invitationSequence: string;
  invitationCode: string;
  carnet: string;
  whatsapp: string;
  seat?: string;
  deliveryStatus: Invitation["deliveryStatus"];
  admissionStatus: EntryStatus;
  reservationStatus: Reservation["status"];
  checkInTime?: string;
  checkInMethod?: CheckInMethod;
  gate?: string;
  method?: string;
  attention?: string;
  attentionTone?: "warning" | "danger" | "info";
  recentChange?: boolean;
  noWhatsApp?: boolean;
  noInvitationSent?: boolean;
  manualAdmission?: boolean;
  incidents?: Array<{
    title: string;
    description: string;
    severity: "info" | "warning" | "critical" | "resolved";
    timestamp: string;
    operator: string;
    badge: string;
  }>;
  auditRows?: Array<{
    time: string;
    actor: string;
    action: string;
    area: string;
  }>;
  deliveryHistory: Array<{
    time: string;
    title: string;
    detail: string;
  }>;
  operatorActivity: Array<{
    time: string;
    action: string;
    operator: string;
    reason?: string;
  }>;
  internalNotes?: string;
  /** Estado visible del QR. No debe confundirse con el token QR. */
  qrStatus: QrStatus;
};

export type AccessRecord = {
  id: string;
  accessGrantId?: string;
  guestId: string;
  reservationId: string;
  eventId: string;
  accessType: AccessType;
  method: CheckInMethod;
  checkedInAt: string;
  checkedOutAt?: string;
  operator: string;
  gate?: string;
  notes?: string;
  auditTrail: AccessAuditEntry[];
  reentryAllowed: boolean;
  maxEntries: number;
  reentryWindowMinutes?: number;
  attemptCount: number;
  lastAttemptAt?: string;
  status: AccessStatus;
  source?: string;
};

export type CheckIn = AccessRecord;

export type CheckInAttempt = {
  id: string;
  eventId: string;
  query: string;
  method: CheckInMethod;
  timestamp: string;
  result: "Encontrado" | "No encontrado" | "Usado" | "Anulado" | "Bloqueado";
  guestId?: string;
  guestName?: string;
  note: string;
};
