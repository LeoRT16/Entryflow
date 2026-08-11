import type { CheckIn, Guest, Invitation } from "@/features/check-in/types";
import type { AccountRolePreset, AccountUser, OrganizationMembership } from "@/features/accounts/types";
import type {
  Event as PlatformEvent,
  EventLayout,
  EventLayoutResource,
  EventLayoutSector,
  Organization,
  Resource,
  Sector,
  Venue,
  VenueLayout,
  VenueLayoutResource,
  VenueLayoutSector,
} from "@/features/domain/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import { buildAccessGrantFromGuest } from "@/features/access/domain/access-ledger";
import type {
  CheckInRow,
  EventLayoutResourceRow,
  EventLayoutRow,
  EventLayoutSectorRow,
  EventRow,
  GuestRow,
  OperationRow,
  OrganizationRow,
  ResourceRow,
  ReservationRow,
  VenueLayoutResourceRow,
  VenueLayoutRow,
  VenueLayoutSectorRow,
  SectorRow,
  TableRow,
  TimelineRow,
  VenueRow,
  ProfileRow,
  RoleRow,
  UserRow,
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

export function mapUserRowToDomain(row: UserRow): AccountUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? undefined,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapUserToRow(user: AccountUser): Omit<UserRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    avatar_url: user.avatarUrl ?? null,
    metadata: user.metadata ? (user.metadata as Json) : null,
  };
}

export function mapRoleRowToDomain(row: RoleRow): AccountRolePreset {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    permissions: row.permissions as AccountRolePreset["permissions"],
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
  };
}

export function mapRoleToRow(role: AccountRolePreset): Omit<RoleRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description ?? null,
    permissions: role.permissions,
    metadata: role.metadata ? (role.metadata as Json) : null,
  };
}

export function mapProfileRowToDomain(row: ProfileRow): OrganizationMembership {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined;
  const attributes = metadata?.attributes && typeof metadata.attributes === "object" && !Array.isArray(metadata.attributes)
    ? (metadata.attributes as OrganizationMembership["attributes"])
    : {};

  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    roleId: row.role_id,
    displayName: row.display_name,
    attributes,
    status: (attributes.status as OrganizationMembership["status"]) ?? "active",
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapProfileToRow(profile: OrganizationMembership): Omit<ProfileRow, "created_at" | "updated_at" | "deleted_at"> {
  const metadata = {
    ...(profile.metadata ?? {}),
    attributes: profile.attributes,
  };

  return {
    id: profile.id,
    user_id: profile.userId,
    organization_id: profile.organizationId,
    role_id: profile.roleId,
    display_name: profile.displayName,
    metadata: Object.keys(metadata).length ? (metadata as Json) : null,
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
    venueId: row.venue_id ?? (typeof metadata?.venueId === "string" ? metadata.venueId : undefined),
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
  const metadata = event.metadata && typeof event.metadata === "object" ? { ...(event.metadata as Record<string, unknown>) } : {};

  if (event.venueId) {
    metadata.venueId = event.venueId;
  }

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
    venue_id: event.venueId ?? null,
    venue: event.venue,
    capacity: event.capacity,
    enabled_modules: event.enabledModules,
    operational_model: event.operationalModel,
    admission_methods: event.admissionMethods,
    resource_types: event.resourceTypes,
    icon: event.icon ?? null,
    metadata: Object.keys(metadata).length ? (metadata as Json) : null,
  };
}

export function mapVenueRowToDomain(row: VenueRow): Venue {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
  };
}

export function mapVenueToRow(venue: Venue): Omit<VenueRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: venue.id,
    organization_id: venue.organizationId,
    name: venue.name,
    description: venue.description ?? null,
    address: venue.address ?? null,
    city: venue.city ?? null,
    country: venue.country ?? null,
    status: venue.status,
    metadata: venue.metadata ? (venue.metadata as Json) : null,
  };
}

export function mapSectorRowToDomain(row: SectorRow): Sector {
  return {
    id: row.id,
    venueId: row.venue_id,
    name: row.name,
    description: row.description ?? undefined,
    capacity: row.capacity ?? undefined,
    order: row.display_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
  };
}

export function mapSectorToRow(sector: Sector): Omit<SectorRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: sector.id,
    venue_id: sector.venueId,
    name: sector.name,
    description: sector.description ?? null,
    capacity: sector.capacity ?? null,
    display_order: sector.order,
    status: sector.status,
    metadata: sector.metadata ? (sector.metadata as Json) : null,
  };
}

export function mapResourceRowToDomain(row: ResourceRow): Resource {
  return {
    id: row.id,
    venueId: row.venue_id,
    sectorId: row.sector_id ?? undefined,
    type: row.type,
    name: row.name,
    capacity: row.capacity,
    status: row.status,
    order: row.display_order,
    notes: row.notes ?? undefined,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapResourceToRow(resource: Resource): Omit<ResourceRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: resource.id,
    venue_id: resource.venueId,
    sector_id: resource.sectorId ?? null,
    type: resource.type,
    name: resource.name,
    capacity: resource.capacity,
    status: resource.status,
    display_order: resource.order,
    notes: resource.notes ?? null,
    metadata: resource.metadata ? (resource.metadata as Json) : null,
  };
}

export function mapVenueLayoutRowToDomain(row: VenueLayoutRow): VenueLayout {
  return {
    id: row.id,
    venueId: row.venue_id,
    name: row.name,
    description: row.description ?? undefined,
    isDefault: row.is_default,
    status: row.status,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVenueLayoutToRow(layout: VenueLayout): Omit<VenueLayoutRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: layout.id,
    venue_id: layout.venueId,
    name: layout.name,
    description: layout.description ?? null,
    is_default: layout.isDefault,
    status: layout.status,
    metadata: layout.metadata ? (layout.metadata as Json) : null,
  };
}

export function mapVenueLayoutSectorRowToDomain(row: VenueLayoutSectorRow): VenueLayoutSector {
  return {
    id: row.id,
    venueLayoutId: row.venue_layout_id,
    sourceSectorId: row.source_sector_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    capacity: row.capacity ?? undefined,
    order: row.display_order,
    status: row.status,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVenueLayoutSectorToRow(layout: VenueLayoutSector): Omit<VenueLayoutSectorRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: layout.id,
    venue_layout_id: layout.venueLayoutId,
    source_sector_id: layout.sourceSectorId ?? null,
    name: layout.name,
    description: layout.description ?? null,
    capacity: layout.capacity ?? null,
    display_order: layout.order,
    status: layout.status,
    metadata: layout.metadata ? (layout.metadata as Json) : null,
  };
}

export function mapVenueLayoutResourceRowToDomain(row: VenueLayoutResourceRow): VenueLayoutResource {
  return {
    id: row.id,
    venueLayoutId: row.venue_layout_id,
    venueLayoutSectorId: row.venue_layout_sector_id ?? undefined,
    sourceResourceId: row.source_resource_id ?? undefined,
    type: row.type,
    name: row.name,
    capacity: row.capacity,
    status: row.status,
    order: row.display_order,
    notes: row.notes ?? undefined,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVenueLayoutResourceToRow(layout: VenueLayoutResource): Omit<VenueLayoutResourceRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: layout.id,
    venue_layout_id: layout.venueLayoutId,
    venue_layout_sector_id: layout.venueLayoutSectorId ?? null,
    source_resource_id: layout.sourceResourceId ?? null,
    type: layout.type,
    name: layout.name,
    capacity: layout.capacity,
    status: layout.status,
    display_order: layout.order,
    notes: layout.notes ?? null,
    metadata: layout.metadata ? (layout.metadata as Json) : null,
  };
}

export function mapEventLayoutRowToDomain(row: EventLayoutRow): EventLayout {
  return {
    id: row.id,
    eventId: row.event_id,
    venueId: row.venue_id,
    sourceVenueLayoutId: row.source_venue_layout_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEventLayoutToRow(layout: EventLayout): Omit<EventLayoutRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: layout.id,
    event_id: layout.eventId,
    venue_id: layout.venueId,
    source_venue_layout_id: layout.sourceVenueLayoutId ?? null,
    name: layout.name,
    description: layout.description ?? null,
    status: layout.status,
    metadata: layout.metadata ? (layout.metadata as Json) : null,
  };
}

export function mapEventLayoutSectorRowToDomain(row: EventLayoutSectorRow): EventLayoutSector {
  return {
    id: row.id,
    eventLayoutId: row.event_layout_id,
    sourceVenueLayoutSectorId: row.source_venue_layout_sector_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    capacity: row.capacity ?? undefined,
    order: row.display_order,
    status: row.status,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEventLayoutSectorToRow(layout: EventLayoutSector): Omit<EventLayoutSectorRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: layout.id,
    event_layout_id: layout.eventLayoutId,
    source_venue_layout_sector_id: layout.sourceVenueLayoutSectorId ?? null,
    name: layout.name,
    description: layout.description ?? null,
    capacity: layout.capacity ?? null,
    display_order: layout.order,
    status: layout.status,
    metadata: layout.metadata ? (layout.metadata as Json) : null,
  };
}

export function mapEventLayoutResourceRowToDomain(row: EventLayoutResourceRow): EventLayoutResource {
  return {
    id: row.id,
    eventLayoutId: row.event_layout_id,
    eventLayoutSectorId: row.event_layout_sector_id ?? undefined,
    sourceVenueLayoutResourceId: row.source_venue_layout_resource_id ?? undefined,
    type: row.type,
    name: row.name,
    capacity: row.capacity,
    status: row.status,
    order: row.display_order,
    notes: row.notes ?? undefined,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEventLayoutResourceToRow(layout: EventLayoutResource): Omit<EventLayoutResourceRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: layout.id,
    event_layout_id: layout.eventLayoutId,
    event_layout_sector_id: layout.eventLayoutSectorId ?? null,
    source_venue_layout_resource_id: layout.sourceVenueLayoutResourceId ?? null,
    type: layout.type,
    name: layout.name,
    capacity: layout.capacity,
    status: layout.status,
    display_order: layout.order,
    notes: layout.notes ?? null,
    metadata: layout.metadata ? (layout.metadata as Json) : null,
  };
}

function mapInvitationState(row: GuestRow): Invitation["deliveryStatus"] {
  return row.delivery_status;
}

export function mapGuestRowToDomain(row: GuestRow): Guest {
  const guestBase: Guest = {
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
  const accessGrant = buildAccessGrantFromGuest(guestBase);

  return {
    ...guestBase,
    accessGrantId: accessGrant.id,
    accessCode: accessGrant.code,
    qrToken: accessGrant.qrToken,
    tableId: row.table_id ?? undefined,
    tableName: row.table_name ?? undefined,
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
    eventLayoutId: row.event_layout_id ?? undefined,
    eventLayoutResourceId: row.event_layout_resource_id ?? undefined,
    resourceId: row.resource_id ?? row.table_id ?? undefined,
    resourceName: row.resource_name ?? row.table_name ?? undefined,
    sectorId: row.sector_id ?? undefined,
    sectorName: row.sector_name ?? undefined,
    venueId: row.venue_id ?? undefined,
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
    event_layout_id: reservation.eventLayoutId ?? null,
    event_layout_resource_id: reservation.eventLayoutResourceId ?? null,
    table_name: reservation.tableName,
    table_id: reservation.tableId ?? reservation.resourceId ?? null,
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
  const metadata = row.notes ? { notes: row.notes } : undefined;

  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    location: row.location,
    status: row.status,
    venueId: row.venue_id ?? row.event_id ?? "",
    sectorId: row.sector_id ?? undefined,
    type: (row.type as TableRecord["type"]) ?? "table",
    order: row.order ?? 0,
    notes: row.notes ?? undefined,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventId: row.event_id ?? undefined,
    reservationIds: row.reservation_ids,
    guestIds: row.guest_ids,
    closed: row.closed,
  };
}

export function mapTableToRow(table: TableRecord): Omit<TableRow, "created_at" | "updated_at" | "deleted_at"> {
  return {
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    location: table.location,
    status: table.status,
    event_id: table.eventId ?? null,
    venue_id: table.venueId,
    sector_id: table.sectorId ?? null,
    type: table.type,
    order: table.order,
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
    eventId: row.event_id,
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
    event_id: event.eventId ?? eventId,
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
