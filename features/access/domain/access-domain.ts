import type { TimelineEvent } from "@/features/timeline/types";
import { createUuid } from "@/lib/supabase/helpers";

export type AccessType = "reservation" | "ticket" | "invitation" | "guest-access" | "qr" | "manual" | "staff";

export type AccessStatus =
  | "Created"
  | "Generated"
  | "Sent"
  | "Delivered"
  | "Viewed"
  | "Validated"
  | "Checked In"
  | "Inside"
  | "Exited"
  | "Re-entry Pending"
  | "Cancelled"
  | "Expired"
  | "Blocked"
  | "Fraud Suspected"
  | "Duplicate Attempt"
  | "No Show";

export type AdmissionMethod = "qr" | "code" | "manual" | "list" | "ticket" | "invitation" | "reservation" | "staff";

export type AdmissionResult =
  | "Valid"
  | "Already Checked In"
  | "Cancelled"
  | "Expired"
  | "Blocked"
  | "Fraud Suspected"
  | "Duplicate"
  | "Unknown"
  | "Manual Review"
  | "Re-entry Pending";

export type AccessAudit = {
  id: string;
  timestamp: string;
  action: string;
  result: AdmissionResult;
  reason: string;
  operator: string;
  device?: string;
  gate?: string;
  ticketId: string;
  reservationId?: string;
  guestId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type AdmissionTimeline = AccessAudit[];

export type Ticket = {
  id: string;
  reservationId?: string;
  guestId?: string;
  eventId?: string;
  code: string;
  qrToken: string;
  status: AccessStatus;
  createdAt: string;
  sentAt?: string;
  openedAt?: string;
  validatedAt?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  lastAction: string;
  lastOperator?: string;
  lastDevice?: string;
  notes?: string;
  accessType: AccessType;
  method?: AdmissionMethod;
  gate?: string;
  zone?: string;
  entryCount: number;
  maxEntries: number;
  reentryAllowed: boolean;
  validUntil?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  source?: string;
  auditTrail: AccessAudit[];
  metadata?: Record<string, unknown>;
};

export type InvitationDesign = {
  id: string;
  eventName: string;
  venueName?: string;
  guestName: string;
  reservationName: string;
  reservationCode: string;
  tableName?: string;
  zoneName?: string;
  date: string;
  time: string;
  dressCode?: string;
  /** Código humano visible en la invitación. */
  uniqueCode: string;
  /** Token opaco que debe renderizarse como QR. */
  qrValue: string;
  message?: string;
  theme?: string;
  logoLabel?: string;
  artLabel?: string;
  variant?: "general" | "vip" | "staff" | "media" | "sponsor";
};

export type AdmissionEngineInput = {
  ticket: Ticket | null;
  query: string;
  method: AdmissionMethod;
  operator: string;
  device?: string;
  gate?: string;
  timestamp: string;
};

export type AdmissionEngineOutput = {
  result: AdmissionResult;
  title: string;
  reason: string;
  status: AccessStatus;
  tone: "success" | "warning" | "danger" | "info";
  note: string;
  shouldPersist: boolean;
  audit: AccessAudit;
};

function isValidDateTime(value?: string) {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);

  return !Number.isNaN(parsed.getTime());
}

export function isExpired(ticket: Ticket, referenceTime = new Date()) {
  if (ticket.status === "Expired") {
    return true;
  }

  if (!isValidDateTime(ticket.validUntil)) {
    return false;
  }

  return new Date(ticket.validUntil as string).getTime() < referenceTime.getTime();
}

export function isConsumed(ticket: Ticket) {
  return (
    ticket.status === "Checked In" ||
    ticket.status === "Inside" ||
    ticket.status === "Exited" ||
    ticket.status === "Cancelled" ||
    ticket.status === "Expired" ||
    ticket.status === "Blocked" ||
    ticket.status === "Fraud Suspected" ||
    ticket.status === "Duplicate Attempt" ||
    ticket.status === "No Show" ||
    ticket.entryCount >= ticket.maxEntries
  );
}

export function isBlocked(ticket: Ticket) {
  return ticket.status === "Blocked" || ticket.status === "Fraud Suspected";
}

export function isDuplicate(ticket: Ticket) {
  return ticket.status === "Duplicate Attempt" || (!ticket.reentryAllowed && ticket.entryCount > 0);
}

export function isTransferable(ticket: Ticket) {
  return !isConsumed(ticket) && !isBlocked(ticket) && !isExpired(ticket);
}

export function requiresManualReview(ticket: Ticket) {
  return ticket.status === "Fraud Suspected" || ticket.status === "Blocked" || ticket.status === "Re-entry Pending";
}

export function canValidate(ticket: Ticket) {
  return !isExpired(ticket) && !isBlocked(ticket) && ticket.status !== "Cancelled" && ticket.status !== "No Show";
}

export function canCheckIn(ticket: Ticket) {
  return canValidate(ticket) && ticket.status !== "Checked In" && ticket.status !== "Inside" && (ticket.reentryAllowed || ticket.entryCount < ticket.maxEntries);
}

export function canReEnter(ticket: Ticket) {
  return !isExpired(ticket) && !isBlocked(ticket) && ticket.reentryAllowed && (ticket.status === "Checked In" || ticket.status === "Exited" || ticket.status === "Re-entry Pending" || ticket.entryCount > 0);
}

export function canCancel(ticket: Ticket) {
  return !["Cancelled", "Expired", "Blocked", "Fraud Suspected", "No Show"].includes(ticket.status);
}

export function canGenerateQR(ticket: Ticket) {
  return !isExpired(ticket) && !isBlocked(ticket) && ticket.status !== "Cancelled";
}

export function canTransfer(ticket: Ticket) {
  return isTransferable(ticket) && !requiresManualReview(ticket);
}

export function createTicket(input: {
  id: string;
  reservationId?: string;
  guestId?: string;
  eventId?: string;
  code: string;
  qrToken: string;
  accessType: AccessType;
  createdAt: string;
  notes?: string;
  gate?: string;
  zone?: string;
  maxEntries?: number;
  reentryAllowed?: boolean;
  validUntil?: string;
  status?: AccessStatus;
}) {
  return {
    id: input.id,
    reservationId: input.reservationId,
    guestId: input.guestId,
    eventId: input.eventId,
    code: input.code,
    qrToken: input.qrToken,
    status: input.status ?? "Created",
    createdAt: input.createdAt,
    sentAt: undefined,
    openedAt: undefined,
    validatedAt: undefined,
    checkedInAt: undefined,
    checkedOutAt: undefined,
    lastAction: "Created",
    lastOperator: undefined,
    lastDevice: undefined,
    notes: input.notes,
    accessType: input.accessType,
    method: undefined,
    gate: input.gate,
    zone: input.zone,
    entryCount: 0,
    maxEntries: input.maxEntries ?? 1,
    reentryAllowed: input.reentryAllowed ?? false,
    validUntil: input.validUntil,
    attemptCount: 0,
    lastAttemptAt: undefined,
    source: undefined,
    auditTrail: [],
    metadata: {},
  } satisfies Ticket;
}

export function buildAdmissionAudit(params: {
  ticket: Ticket;
  result: AdmissionResult;
  action: string;
  reason: string;
  timestamp: string;
  operator: string;
  device?: string;
  gate?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  reservationId?: string;
  guestId?: string;
}): AccessAudit {
  return {
    id: createUuid(),
    timestamp: params.timestamp,
    action: params.action,
    result: params.result,
    reason: params.reason,
    operator: params.operator,
    device: params.device,
    gate: params.gate,
    ticketId: params.ticket.id,
    reservationId: params.reservationId ?? params.ticket.reservationId,
    guestId: params.guestId ?? params.ticket.guestId,
    notes: params.notes ?? params.ticket.notes,
    metadata: params.metadata,
  };
}

export function createTicketFromGuest(input: {
  id: string;
  reservationId: string;
  guestId: string;
  eventId: string;
  code: string;
  qrToken?: string;
  accessType?: AccessType;
  createdAt: string;
  status?: AccessStatus;
  notes?: string;
  gate?: string;
  zone?: string;
  validUntil?: string;
  reentryAllowed?: boolean;
  maxEntries?: number;
  attemptCount?: number;
  lastAttemptAt?: string;
  lastAction?: string;
}) {
  return createTicket({
    id: input.id,
    reservationId: input.reservationId,
    guestId: input.guestId,
    eventId: input.eventId,
    code: input.code,
    qrToken: input.qrToken ?? input.code,
    accessType: input.accessType ?? "invitation",
    createdAt: input.createdAt,
    notes: input.notes,
    gate: input.gate,
    zone: input.zone,
    validUntil: input.validUntil,
    maxEntries: input.maxEntries,
    reentryAllowed: input.reentryAllowed,
    status: input.status,
  });
}

export function buildAdmissionTimeline(audits: AccessAudit[]) {
  return [...audits].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function evaluateAdmission(input: AdmissionEngineInput): AdmissionEngineOutput {
  const { ticket, method, operator, device, gate, timestamp } = input;

  if (!ticket) {
    const audit: AccessAudit = {
      id: `access-unknown-${timestamp}`,
      timestamp,
      action: method === "manual" ? "Manual validation" : "QR validation",
      result: "Unknown",
      reason: "No se encontró un ticket coincidente.",
      operator,
      device,
      gate,
      ticketId: "unknown",
      notes: "Código inválido.",
      metadata: { method, query: input.query },
    };

    return {
      result: "Unknown",
      title: "Código inválido",
      reason: audit.reason,
      status: "Blocked",
      tone: "danger",
      note: "Código inválido.",
      shouldPersist: false,
      audit,
    };
  }

  const baseAction = method === "manual" ? "Manual validation" : method === "code" ? "Code validation" : "QR validation";

  if (isExpired(ticket)) {
    const audit = buildAdmissionAudit({
      ticket,
      result: "Expired",
      action: baseAction,
      reason: "El acceso expiró.",
      timestamp,
      operator,
      device,
      gate,
      notes: ticket.notes,
      metadata: { method, query: input.query },
    });

    return {
      result: "Expired",
      title: "Acceso expirado",
      reason: audit.reason,
      status: "Expired",
      tone: "danger",
      note: "La invitación o ticket ya venció.",
      shouldPersist: true,
      audit,
    };
  }

  if (isBlocked(ticket)) {
    const audit = buildAdmissionAudit({
      ticket,
      result: "Blocked",
      action: baseAction,
      reason: "El acceso fue bloqueado.",
      timestamp,
      operator,
      device,
      gate,
      notes: ticket.notes,
      metadata: { method, query: input.query },
    });

    return {
      result: "Blocked",
      title: "Acceso bloqueado",
      reason: audit.reason,
      status: ticket.status,
      tone: "danger",
      note: "La invitación está bloqueada.",
      shouldPersist: true,
      audit,
    };
  }

  if (ticket.status === "Cancelled") {
    const audit = buildAdmissionAudit({
      ticket,
      result: "Cancelled",
      action: baseAction,
      reason: "El acceso fue cancelado.",
      timestamp,
      operator,
      device,
      gate,
      notes: ticket.notes,
      metadata: { method, query: input.query },
    });

    return {
      result: "Cancelled",
      title: "Acceso cancelado",
      reason: audit.reason,
      status: "Cancelled",
      tone: "danger",
      note: "La invitación fue anulada.",
      shouldPersist: true,
      audit,
    };
  }

  if (ticket.status === "No Show") {
    const audit = buildAdmissionAudit({
      ticket,
      result: "Blocked",
      action: baseAction,
      reason: "La reserva figura como no show.",
      timestamp,
      operator,
      device,
      gate,
      notes: ticket.notes,
      metadata: { method, query: input.query },
    });

    return {
      result: "Blocked",
      title: "No show",
      reason: audit.reason,
      status: "No Show",
      tone: "warning",
      note: "La reserva figura como no show.",
      shouldPersist: true,
      audit,
    };
  }

  if (ticket.status === "Checked In" || ticket.status === "Inside") {
    const audit = buildAdmissionAudit({
      ticket,
      result: "Already Checked In",
      action: baseAction,
      reason: "El ticket ya fue consumido.",
      timestamp,
      operator,
      device,
      gate,
      notes: ticket.notes,
      metadata: { method, query: input.query },
    });

    return {
      result: "Already Checked In",
      title: "Segundo intento bloqueado",
      reason: audit.reason,
      status: "Duplicate Attempt",
      tone: "warning",
      note: "Esta invitación ya fue utilizada.",
      shouldPersist: true,
      audit,
    };
  }

  if (ticket.status === "Re-entry Pending") {
    const audit = buildAdmissionAudit({
      ticket,
      result: "Re-entry Pending",
      action: baseAction,
      reason: "Reingreso pendiente de validación.",
      timestamp,
      operator,
      device,
      gate,
      notes: ticket.notes,
      metadata: { method, query: input.query },
    });

    return {
      result: "Re-entry Pending",
      title: "Reingreso pendiente",
      reason: audit.reason,
      status: ticket.status,
      tone: "info",
      note: "Requiere validación antes de continuar.",
      shouldPersist: true,
      audit,
    };
  }

  if (requiresManualReview(ticket)) {
    const audit = buildAdmissionAudit({
      ticket,
      result: "Manual Review",
      action: baseAction,
      reason: "La validación requiere revisión manual.",
      timestamp,
      operator,
      device,
      gate,
      notes: ticket.notes,
      metadata: { method, query: input.query },
    });

    return {
      result: "Manual Review",
      title: "Validación manual",
      reason: audit.reason,
      status: "Validated",
      tone: "info",
      note: "La validación quedó registrada para revisión manual.",
      shouldPersist: true,
      audit,
    };
  }

  const audit = buildAdmissionAudit({
    ticket,
    result: "Valid",
    action: baseAction,
    reason: method === "manual" ? "Ingreso manual autorizado." : "QR validado correctamente.",
    timestamp,
    operator,
    device,
    gate,
    notes: ticket.notes,
    metadata: { method, query: input.query },
  });

  return {
    result: "Valid",
    title: method === "manual" ? "Check-in manual" : "Check-in exitoso",
    reason: audit.reason,
    status: "Checked In",
    tone: "success",
    note: audit.reason,
    shouldPersist: true,
    audit,
  };
}

export function createAdmissionTimelineEntry(result: AdmissionEngineOutput, ticket: Ticket | null): Partial<TimelineEvent> {
  const kind =
    result.result === "Valid"
      ? result.audit.action === "Manual validation"
        ? "checkin.manual"
        : "checkin.success"
      : result.result === "Unknown" || result.result === "Cancelled" || result.result === "Expired"
        ? "checkin.invalid"
        : "checkin.blocked";

  return {
    id: result.audit.id,
    eventId: ticket?.eventId,
    createdAt: result.audit.timestamp,
    timestamp: result.audit.timestamp,
    kind,
    icon: result.result === "Valid" ? "checkin" : "alert",
    tone: result.tone,
    title: result.title,
    description: result.reason,
    reservationId: ticket?.reservationId ?? result.audit.reservationId,
    guestId: ticket?.guestId ?? result.audit.guestId,
    metadata: {
      ticketId: ticket?.id ?? result.audit.ticketId,
      code: ticket?.code ?? result.audit.metadata?.query ?? "",
      result: result.result,
      action: result.audit.action,
      status: result.status,
      operator: result.audit.operator,
      gate: result.audit.gate,
    },
  };
}
