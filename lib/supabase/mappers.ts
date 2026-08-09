import type { CheckIn, Guest, Invitation } from "@/features/check-in/types";
import type { Event as PlatformEvent, Organization } from "@/features/domain/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import type {
  CheckInRow,
  EventRow,
  GuestRow,
  OperationRow,
  OrganizationRow,
  ReservationRow,
  TableRow,
  TimelineRow,
  Json,
} from "@/lib/supabase/types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeAccessStatus(status?: string | null): CheckIn["status"] {
  if (status === "Pending" || status === "Confirmed" || status === "Checked In" || status === "Checked Out" || status === "Cancelled" || status === "Rejected" || status === "Blocked" || status === "Expired" || status === "Transferred" || status === "Duplicate Attempt" || status === "No Show") {
    return status;
  }

  if (status === "Ingresó") {
    return "Checked In";
  }

  if (status === "Anulada") {
    return "Cancelled";
  }

  if (status === "Bloqueada") {
    return "Blocked";
  }

  if (status === "Usado") {
    return "Duplicate Attempt";
  }

  if (status === "No encontrado") {
    return "Rejected";
  }

  return "Pending";
}

export function mapOrganizationRowToDomain(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    timezone: row.timezone,
    branding: row.branding,
    settings: row.settings,
    metadata: row.metadata ?? undefined,
  };
}

export function mapOrganizationToRow(organization: Organization): Omit<OrganizationRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    timezone: organization.timezone,
    branding: organization.branding,
    settings: organization.settings,
    metadata: organization.metadata ?? null,
  };
}

export function mapEventRowToDomain(row: EventRow): PlatformEvent {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? undefined,
    eventType: row.event_type,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at ?? undefined,
    timezone: row.timezone,
    venue: row.venue,
    capacity: row.capacity,
    enabledModules: row.enabled_modules,
    operationalModel: row.operational_model,
    admissionMethods: row.admission_methods,
    resourceTypes: row.resource_types,
    icon: row.icon ?? undefined,
    metadata,
  };
}

export function mapEventToRow(event: PlatformEvent): Omit<EventRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: event.id,
    organization_id: event.organizationId,
    name: event.name,
    description: event.description ?? null,
    event_type: event.eventType,
    status: event.status,
    start_at: event.startAt,
    end_at: event.endAt ?? null,
    timezone: event.timezone,
    venue: event.venue,
    capacity: event.capacity,
    enabled_modules: event.enabledModules,
    operational_model: event.operationalModel,
    admission_methods: event.admissionMethods,
    resource_types: event.resourceTypes,
    icon: event.icon ?? null,
    metadata: event.metadata ? (event.metadata as Json) : null,
  };
}

function mapInvitationState(row: GuestRow): Invitation["deliveryStatus"] {
  return row.delivery_status;
}

export function mapGuestRowToDomain(row: GuestRow): Guest {
  return {
    id: row.id,
    guestName: row.guest_name,
    reservationName: row.reservation_name,
    reservationCode: row.reservation_code,
    reservationId: row.reservation_id,
    eventId: row.event_id,
    eventName: row.event_name,
    tableId: row.table_id ?? undefined,
    tableName: row.table_name ?? undefined,
    eventStatus: row.event_status,
    invitationSequence: row.invitation_sequence,
    invitationCode: row.invitation_code,
    carnet: row.carnet,
    whatsapp: row.whatsapp,
    seat: row.seat ?? undefined,
    deliveryStatus: mapInvitationState(row),
    admissionStatus: row.admission_status,
    reservationStatus: row.reservation_status,
    checkInTime: row.check_in_time ?? undefined,
    checkInMethod: row.check_in_method ?? undefined,
    gate: row.gate ?? undefined,
    method: row.method ?? undefined,
    attention: row.attention ?? undefined,
    attentionTone: row.attention_tone ?? undefined,
    recentChange: row.recent_change,
    noWhatsApp: row.no_whatsapp,
    noInvitationSent: row.no_invitation_sent,
    manualAdmission: row.manual_admission,
    incidents: row.incidents ?? undefined,
    auditRows: row.audit_rows ?? undefined,
    deliveryHistory: row.delivery_history,
    operatorActivity: row.operator_activity,
    internalNotes: row.internal_notes ?? undefined,
    qrStatus: row.qr_status,
  };
}

export function mapGuestToRow(guest: Guest): Omit<GuestRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: guest.id,
    event_id: guest.eventId,
    guest_name: guest.guestName,
    reservation_name: guest.reservationName,
    reservation_code: guest.reservationCode,
    reservation_id: guest.reservationId,
    event_name: guest.eventName,
    table_id: guest.tableId ?? null,
    table_name: guest.tableName ?? null,
    event_status: guest.eventStatus,
    invitation_sequence: guest.invitationSequence,
    invitation_code: guest.invitationCode,
    carnet: guest.carnet,
    whatsapp: guest.whatsapp,
    seat: guest.seat ?? null,
    delivery_status: guest.deliveryStatus,
    admission_status: guest.admissionStatus,
    reservation_status: guest.reservationStatus,
    check_in_time: guest.checkInTime ?? null,
    check_in_method: guest.checkInMethod ?? null,
    gate: guest.gate ?? null,
    method: guest.method ?? null,
    attention: guest.attention ?? null,
    attention_tone: guest.attentionTone ?? null,
    recent_change: guest.recentChange ?? false,
    no_whatsapp: guest.noWhatsApp ?? false,
    no_invitation_sent: guest.noInvitationSent ?? false,
    manual_admission: guest.manualAdmission ?? false,
    incidents: guest.incidents ?? null,
    audit_rows: guest.auditRows ?? null,
    delivery_history: guest.deliveryHistory,
    operator_activity: guest.operatorActivity,
    internal_notes: guest.internalNotes ?? null,
    qr_status: guest.qrStatus,
  };
}

export function mapReservationRowToDomain(row: ReservationRow): ReservationRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    eventId: row.event_id,
    eventName: row.event_name,
    date: row.date,
    time: row.time,
    tableName: row.table_name,
    tableId: row.table_id ?? undefined,
    tableCapacity: row.table_capacity,
    holderName: row.holder_name,
    holderDocument: row.holder_document,
    holderWhatsapp: row.holder_whatsapp,
    holderEmail: row.holder_email,
    reservationType: row.reservation_type,
    paymentStatus: row.payment_status,
    amount: row.amount,
    advance: row.advance,
    notes: row.notes,
    guestIds: row.guest_ids,
    status: row.status,
    timeline: row.timeline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapReservationToRow(reservation: ReservationRecord): Omit<ReservationRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: reservation.id,
    code: reservation.code,
    name: reservation.name,
    event_id: reservation.eventId,
    event_name: reservation.eventName,
    date: reservation.date,
    time: reservation.time,
    table_name: reservation.tableName,
    table_id: reservation.tableId ?? null,
    table_capacity: reservation.tableCapacity,
    holder_name: reservation.holderName,
    holder_document: reservation.holderDocument,
    holder_whatsapp: reservation.holderWhatsapp,
    holder_email: reservation.holderEmail,
    reservation_type: reservation.reservationType,
    payment_status: reservation.paymentStatus,
    amount: reservation.amount,
    advance: reservation.advance,
    notes: reservation.notes,
    guest_ids: reservation.guestIds,
    status: reservation.status,
    timeline: reservation.timeline,
  };
}

export function mapTableRowToDomain(row: TableRow): TableRecord {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    location: row.location,
    status: row.status,
    eventId: row.event_id,
    reservationIds: row.reservation_ids,
    guestIds: row.guest_ids,
    closed: row.closed,
    notes: row.notes ?? undefined,
  };
}

export function mapTableToRow(table: TableRecord): Omit<TableRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    location: table.location,
    status: table.status,
    event_id: table.eventId,
    reservation_ids: table.reservationIds,
    guest_ids: table.guestIds,
    closed: table.closed,
    notes: table.notes ?? null,
  };
}

export function mapCheckInRowToDomain(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    accessGrantId: row.access_grant_id ?? undefined,
    guestId: row.guest_id,
    reservationId: row.reservation_id,
    eventId: row.event_id,
    accessType: row.access_type,
    method: row.method,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at ?? undefined,
    operator: row.operator,
    gate: row.gate ?? undefined,
    notes: row.notes ?? undefined,
    auditTrail: row.audit_trail ?? [],
    reentryAllowed: row.reentry_allowed,
    maxEntries: row.max_entries,
    reentryWindowMinutes: row.reentry_window_minutes ?? undefined,
    attemptCount: row.attempt_count,
    lastAttemptAt: row.last_attempt_at ?? undefined,
    status: normalizeAccessStatus(row.status),
    source: row.source ?? undefined,
  };
}

export function mapCheckInToRow(checkIn: CheckIn): Omit<CheckInRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: checkIn.id,
    access_grant_id: checkIn.accessGrantId ?? null,
    guest_id: checkIn.guestId,
    reservation_id: checkIn.reservationId,
    event_id: checkIn.eventId,
    access_type: checkIn.accessType,
    method: checkIn.method,
    checked_in_at: checkIn.checkedInAt,
    checked_out_at: checkIn.checkedOutAt ?? null,
    operator: checkIn.operator,
    gate: checkIn.gate ?? null,
    notes: checkIn.notes ?? null,
    audit_trail: clone(checkIn.auditTrail),
    reentry_allowed: checkIn.reentryAllowed,
    max_entries: checkIn.maxEntries,
    reentry_window_minutes: checkIn.reentryWindowMinutes ?? null,
    attempt_count: checkIn.attemptCount,
    last_attempt_at: checkIn.lastAttemptAt ?? null,
    status: normalizeAccessStatus(checkIn.status),
    source: checkIn.source ?? null,
  };
}

export function mapTimelineRowToDomain(row: TimelineRow): TimelineEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    kind: row.kind,
    icon: row.icon,
    tone: row.tone,
    title: row.title,
    description: row.description,
    reservationId: row.reservation_id ?? undefined,
    reservationCode: row.reservation_code ?? undefined,
    reservationName: row.reservation_name ?? undefined,
    guestId: row.guest_id ?? undefined,
    guestName: row.guest_name ?? undefined,
    tableId: row.table_id ?? undefined,
    tableName: row.table_name ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  };
}

export function mapTimelineToRow(event: TimelineEvent, eventId: string): Omit<TimelineRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: event.id,
    event_id: eventId,
    timestamp: event.timestamp,
    kind: event.kind,
    icon: event.icon,
    tone: event.tone,
    title: event.title,
    description: event.description,
    reservation_id: event.reservationId ?? null,
    reservation_code: event.reservationCode ?? null,
    reservation_name: event.reservationName ?? null,
    guest_id: event.guestId ?? null,
    guest_name: event.guestName ?? null,
    table_id: event.tableId ?? null,
    table_name: event.tableName ?? null,
    metadata: (event.metadata as TimelineRow["metadata"]) ?? null,
  };
}

export function mapOperationToTimelineEvent(row: OperationRow): TimelineEvent {
  const tone = row.severity === "neutral" ? "info" : row.severity;

  return {
    id: row.id,
    timestamp: row.created_at,
    kind: row.status === "resolved" ? "timeline.note" : "operations.alert",
    icon: row.severity === "danger" ? "alert" : "guest",
    tone,
    title: row.title,
    description: row.description,
    reservationId: row.reservation_id ?? undefined,
    guestId: row.guest_id ?? undefined,
    tableId: row.table_id ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  };
}

export function cloneDomain<T>(value: T) {
  return clone(value);
}
