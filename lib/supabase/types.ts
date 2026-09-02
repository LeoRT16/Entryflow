import type {
  ActivityColor,
  AdmissionMethod,
  EventModule,
  EventLayoutStatus,
  EventStatus,
  EventType,
  OperationalModel,
  Organization,
  ResourceType,
  VenueLayoutResourceStatus,
  VenueLayoutSectorStatus,
  VenueLayoutStatus,
  SectorStatus,
  VenueStatus,
} from "@/features/domain/types";
import type { AccessAuditEntry, AccessStatus, AccessType, CheckInMethod, EntryStatus, Guest, Invitation, QrStatus } from "@/features/check-in/types";
import type {
  PaymentStatus,
  ReservationStatus,
  ReservationTimelineEntry,
  ReservationType,
} from "@/features/reservations/types";
import type { ReservationCommercialSnapshot } from "@/features/events/domain/commercial-config";
import type { TableStatus } from "@/features/tables/types";
import type { TimelineIcon, TimelineKind, TimelineTone } from "@/features/timeline/types";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type SupabaseRowBase = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type OrganizationRow = SupabaseRowBase & {
  name: string;
  slug: string;
  status: Organization["status"];
  timezone: string;
  branding: Organization["branding"];
  settings: Organization["settings"];
  metadata: Organization["metadata"] | null;
};

export type EventRow = SupabaseRowBase & {
  organization_id: string;
  name: string;
  description: string | null;
  event_type: EventType;
  status: EventStatus;
  start_at: string;
  end_at: string | null;
  timezone: string;
  venue_id: string | null;
  venue: string;
  capacity: number;
  enabled_modules: EventModule[];
  operational_model: OperationalModel;
  admission_methods: AdmissionMethod[];
  resource_types: ResourceType[];
  icon: string | null;
  metadata: Json | null;
};

export type VenueRow = SupabaseRowBase & {
  organization_id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  status: VenueStatus;
  metadata: Json | null;
};

export type SectorRow = SupabaseRowBase & {
  venue_id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  display_order: number;
  status: SectorStatus;
  metadata: Json | null;
};

export type ResourceRow = SupabaseRowBase & {
  venue_id: string;
  sector_id: string | null;
  type: ResourceType;
  name: string;
  capacity: number;
  status: "Available" | "Partially Occupied" | "Full" | "Over Capacity" | "Reserved" | "Blocked" | "Closed";
  display_order: number;
  notes: string | null;
  metadata: Json | null;
};

export type VenueLayoutRow = SupabaseRowBase & {
  venue_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  status: VenueLayoutStatus;
  metadata: Json | null;
};

export type VenueLayoutSectorRow = SupabaseRowBase & {
  venue_layout_id: string;
  source_sector_id: string | null;
  name: string;
  description: string | null;
  capacity: number | null;
  display_order: number;
  status: VenueLayoutSectorStatus;
  metadata: Json | null;
};

export type VenueLayoutResourceRow = SupabaseRowBase & {
  venue_layout_id: string;
  venue_layout_sector_id: string | null;
  source_resource_id: string | null;
  type: ResourceType;
  name: string;
  capacity: number;
  status: VenueLayoutResourceStatus;
  display_order: number;
  notes: string | null;
  metadata: Json | null;
};

export type EventLayoutRow = SupabaseRowBase & {
  event_id: string;
  venue_id: string;
  source_venue_layout_id: string | null;
  name: string;
  description: string | null;
  status: EventLayoutStatus;
  metadata: Json | null;
};

export type EventLayoutSectorRow = SupabaseRowBase & {
  event_layout_id: string;
  source_venue_layout_sector_id: string | null;
  name: string;
  description: string | null;
  capacity: number | null;
  display_order: number;
  status: VenueLayoutSectorStatus;
  metadata: Json | null;
};

export type EventLayoutResourceRow = SupabaseRowBase & {
  event_layout_id: string;
  event_layout_sector_id: string | null;
  source_venue_layout_resource_id: string | null;
  type: ResourceType;
  name: string;
  capacity: number;
  status: VenueLayoutResourceStatus;
  display_order: number;
  notes: string | null;
  metadata: Json | null;
};

export type GuestRow = SupabaseRowBase & {
  event_id: string;
  guest_name: string;
  reservation_name: string;
  reservation_code: string;
  reservation_id: string;
  event_name: string;
  table_id: string | null;
  table_name: string | null;
  event_status: "En curso" | "Próximo";
  invitation_sequence: string;
  invitation_code: string;
  carnet: string;
  whatsapp: string;
  seat: string | null;
  delivery_status: Invitation["deliveryStatus"];
  admission_status: EntryStatus;
  reservation_status: ReservationStatus;
  check_in_time: string | null;
  check_in_method: CheckInMethod | null;
  gate: string | null;
  method: string | null;
  attention: string | null;
  attention_tone: "warning" | "danger" | "info" | null;
  recent_change: boolean;
  no_whatsapp: boolean;
  no_invitation_sent: boolean;
  manual_admission: boolean;
  incidents: Guest["incidents"] | null;
  audit_rows: Guest["auditRows"] | null;
  delivery_history: Guest["deliveryHistory"];
  operator_activity: Guest["operatorActivity"];
  internal_notes: string | null;
  qr_status: QrStatus;
};

export type ReservationRow = SupabaseRowBase & {
  code: string;
  name: string;
  event_id: string;
  event_name: string;
  date: string;
  time: string;
  event_layout_id: string | null;
  event_layout_resource_id: string | null;
  resource_id?: string | null;
  sector_id?: string | null;
  sector_name?: string | null;
  venue_id?: string | null;
  table_name: string;
  table_id: string | null;
  table_capacity: number;
  holder_name: string;
  holder_document: string;
  holder_whatsapp: string;
  holder_email: string;
  reservation_type: ReservationType;
  reference: string | null;
  payment_status: PaymentStatus;
  amount: string;
  advance: string;
  commercial_snapshot: ReservationCommercialSnapshot | null;
  notes: string;
  guest_ids: string[];
  status: ReservationStatus;
  timeline: ReservationTimelineEntry[];
};

export type TableRow = SupabaseRowBase & {
  name: string;
  capacity: number;
  location: string;
  status: TableStatus;
  event_id: string | null;
  venue_id: string | null;
  sector_id: string | null;
  type: string | null;
  order: number | null;
  reservation_ids: string[];
  guest_ids: string[];
  closed: boolean;
  notes: string | null;
};

export type CheckInRow = SupabaseRowBase & {
  guest_id: string;
  reservation_id: string;
  event_id: string;
  access_grant_id: string | null;
  access_type: AccessType;
  method: CheckInMethod;
  checked_in_at: string;
  checked_out_at: string | null;
  operator: string;
  gate: string | null;
  notes: string | null;
  audit_trail: AccessAuditEntry[];
  reentry_allowed: boolean;
  max_entries: number;
  reentry_window_minutes: number | null;
  attempt_count: number;
  last_attempt_at: string | null;
  status: AccessStatus;
  source: string | null;
};

export type TimelineRow = SupabaseRowBase & {
  event_id: string;
  timestamp: string;
  kind: TimelineKind;
  icon: TimelineIcon;
  tone: TimelineTone;
  title: string;
  description: string;
  reservation_id: string | null;
  reservation_code: string | null;
  reservation_name: string | null;
  guest_id: string | null;
  guest_name: string | null;
  table_id: string | null;
  table_name: string | null;
  metadata: Json | null;
};

export type WhatsAppDeliveryAttemptRow = SupabaseRowBase & {
  organization_id: string;
  event_id: string;
  guest_id: string;
  reservation_id: string;
  message_id: string;
  attempt_number: number;
  delivery_status: "accepted" | "sent" | "delivered" | "read" | "failed";
  status_history: Array<{
    status: "accepted" | "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    detail?: string;
    code?: string;
  }>;
  accepted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  failure_details: Json | null;
  template_name: string;
  template_language: string;
};

export type OperationRow = SupabaseRowBase & {
  event_id: string;
  timeline_event_id: string | null;
  severity: ActivityColor;
  title: string;
  description: string;
  status: "open" | "resolved" | "dismissed";
  assigned_to: string | null;
  reservation_id: string | null;
  guest_id: string | null;
  table_id: string | null;
  metadata: Json | null;
};

export type RoleRow = SupabaseRowBase & {
  name: string;
  slug: string;
  description: string | null;
  permissions: string[];
  metadata: Json | null;
};

export type UserRow = SupabaseRowBase & {
  auth_user_id: string | null;
  must_change_password: boolean;
  email: string;
  display_name: string;
  avatar_url: string | null;
  metadata: Json | null;
};

export type ProfileRow = SupabaseRowBase & {
  user_id: string;
  organization_id: string;
  role_id: string;
  display_name: string;
  metadata: Json | null;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: Omit<OrganizationRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<OrganizationRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<OrganizationRow>;
      };
      events: {
        Row: EventRow;
        Insert: Omit<EventRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<EventRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<EventRow>;
      };
      venues: {
        Row: VenueRow;
        Insert: Omit<VenueRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<VenueRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<VenueRow>;
      };
      sectors: {
        Row: SectorRow;
        Insert: Omit<SectorRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<SectorRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<SectorRow>;
      };
      resources: {
        Row: ResourceRow;
        Insert: Omit<ResourceRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<ResourceRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<ResourceRow>;
      };
      venue_layouts: {
        Row: VenueLayoutRow;
        Insert: Omit<VenueLayoutRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<VenueLayoutRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<VenueLayoutRow>;
      };
      venue_layout_sectors: {
        Row: VenueLayoutSectorRow;
        Insert: Omit<VenueLayoutSectorRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<VenueLayoutSectorRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<VenueLayoutSectorRow>;
      };
      venue_layout_resources: {
        Row: VenueLayoutResourceRow;
        Insert: Omit<VenueLayoutResourceRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<VenueLayoutResourceRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<VenueLayoutResourceRow>;
      };
      event_layouts: {
        Row: EventLayoutRow;
        Insert: Omit<EventLayoutRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<EventLayoutRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<EventLayoutRow>;
      };
      event_layout_sectors: {
        Row: EventLayoutSectorRow;
        Insert: Omit<EventLayoutSectorRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<EventLayoutSectorRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<EventLayoutSectorRow>;
      };
      event_layout_resources: {
        Row: EventLayoutResourceRow;
        Insert: Omit<EventLayoutResourceRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<EventLayoutResourceRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<EventLayoutResourceRow>;
      };
      guests: {
        Row: GuestRow;
        Insert: Omit<GuestRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<GuestRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<GuestRow>;
      };
      reservations: {
        Row: ReservationRow;
        Insert: Omit<ReservationRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<ReservationRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<ReservationRow>;
      };
      tables: {
        Row: TableRow;
        Insert: Omit<TableRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<TableRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<TableRow>;
      };
      checkins: {
        Row: CheckInRow;
        Insert: Omit<CheckInRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<CheckInRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<CheckInRow>;
      };
      timeline_events: {
        Row: TimelineRow;
        Insert: Omit<TimelineRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<TimelineRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<TimelineRow>;
      };
      whatsapp_delivery_attempts: {
        Row: WhatsAppDeliveryAttemptRow;
        Insert: Omit<WhatsAppDeliveryAttemptRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<WhatsAppDeliveryAttemptRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<WhatsAppDeliveryAttemptRow>;
      };
      operations: {
        Row: OperationRow;
        Insert: Omit<OperationRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<OperationRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<OperationRow>;
      };
      activity_logs: {
        Row: TimelineRow;
        Insert: Omit<TimelineRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<TimelineRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<TimelineRow>;
      };
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<UserRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<UserRow>;
      };
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<ProfileRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<ProfileRow>;
      };
      roles: {
        Row: RoleRow;
        Insert: Omit<RoleRow, "created_at" | "updated_at" | "deleted_at"> & Partial<Pick<RoleRow, "created_at" | "updated_at" | "deleted_at">>;
        Update: Partial<RoleRow>;
      };
    };
  };
};
