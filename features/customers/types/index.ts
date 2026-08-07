export type EventOption = {
  name: string;
  status: "En curso" | "Próximo";
};

export type DeliveryStatus = "Pendiente de envío" | "Enviada" | "Reenviada" | "Vista" | "Fallida";
export type AdmissionStatus = "Pendiente" | "Ingresó" | "Anulada" | "Bloqueada";
export type ReservationStatus = "Confirmada" | "Pendientes de pago" | "Pago parcial" | "Cancelada";
export type AdmissionFilter = "Todos" | "Pendientes" | "Ingresaron" | "Anulados" | "Bloqueados";
export type ReservationFilter = "Todas" | "Confirmadas" | "Pendientes de pago" | "Pago parcial" | "Canceladas";
export type AttentionTone = "warning" | "danger" | "info";

export type DeliveryHistoryItem = {
  time: string;
  title: string;
  detail: string;
};

export type TimelineEntry = {
  time: string;
  title: string;
  detail: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
};

export type OperationalNote = {
  label: string;
  detail: string;
};

export type IncidentSeverity = "info" | "warning" | "critical" | "resolved";

export type GuestIncident = {
  title: string;
  description: string;
  severity: IncidentSeverity;
  timestamp: string;
  operator: string;
  badge: string;
};

export type AuditRow = {
  time: string;
  actor: string;
  action: string;
  area: string;
};

export type OperatorActivityItem = {
  time: string;
  action: string;
  operator: string;
  reason?: string;
};

export type GuestRecord = {
  id: string;
  guestName: string;
  reservationName: string;
  reservationCode: string;
  eventName: string;
  eventStatus: EventOption["status"];
  invitationSequence: string;
  invitationCode: string;
  carnet: string;
  whatsapp: string;
  seat?: string;
  deliveryStatus: DeliveryStatus;
  admissionStatus: AdmissionStatus;
  reservationStatus: ReservationStatus;
  checkInTime?: string;
  gate?: string;
  method?: string;
  attention?: string;
  attentionTone?: AttentionTone;
  recentChange?: boolean;
  noWhatsApp?: boolean;
  noInvitationSent?: boolean;
  manualAdmission?: boolean;
  incidents?: GuestIncident[];
  auditRows?: AuditRow[];
  deliveryHistory: DeliveryHistoryItem[];
  operatorActivity: OperatorActivityItem[];
  internalNotes?: string;
};
