export type EntryStatus = "Pendiente" | "Ingresó" | "Anulada" | "Bloqueada";

export type CheckInMethod = "QR" | "Manual";

export type QrStatus = "Válido" | "Usado" | "Anulado" | "Bloqueado" | "Inexistente";

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
  guestIds: string[];
  guestCount: number;
  checkedInCount: number;
  pendingCount: number;
  status: "Confirmada" | "Pendientes de pago" | "Pago parcial" | "Cancelada";
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
  qrStatus: QrStatus;
};

export type CheckIn = {
  id: string;
  guestId: string;
  reservationId: string;
  eventId: string;
  method: CheckInMethod;
  checkedInAt: string;
  operator: string;
  status: EntryStatus;
};

export type CheckInAttempt = {
  id: string;
  query: string;
  method: CheckInMethod;
  timestamp: string;
  result: "Encontrado" | "No encontrado" | "Usado" | "Anulado" | "Bloqueado";
  guestId?: string;
  guestName?: string;
  note: string;
};

