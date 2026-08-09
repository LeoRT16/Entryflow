export type OrganizationStatus = "active" | "paused" | "archived";

export type OrganizationBranding = {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  textColor?: string;
};

export type OrganizationSettings = {
  locale?: string;
  timezone?: string;
  currency?: string;
  timeFormat?: "12h" | "24h";
  dateFormat?: string;
  terminology?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  timezone: string;
  branding: OrganizationBranding;
  settings: OrganizationSettings;
  metadata?: Record<string, unknown>;
};

export type EventStatus = "draft" | "published" | "live" | "finished" | "cancelled";

export type EventType =
  | "nightlife"
  | "concert"
  | "festival"
  | "corporate"
  | "conference"
  | "seminar"
  | "workshop"
  | "theatre"
  | "sports"
  | "private"
  | "custom";

export type EventModule =
  | "overview"
  | "access"
  | "attendees"
  | "admission"
  | "resources"
  | "operations"
  | "activity"
  | "analytics"
  | "notifications"
  | "ticketing"
  | "payments"
  | "badges"
  | "agenda"
  | "staff"
  | "gates"
  | "capacity-control"
  | "communications";

export type OperationalModel =
  | "general-admission"
  | "reserved"
  | "mixed"
  | "guest-list"
  | "accreditation"
  | "assigned-resources"
  | "custom";

export type AdmissionMethod = "qr" | "code" | "manual" | "list" | "ticket" | "invitation" | "credential";

export type AdmissionStatus = "success" | "denied" | "already-used" | "cancelled" | "invalid" | "blocked" | "manual";

export type AdmissionResult = {
  id: string;
  eventId: string;
  accessGrantId?: string;
  attendeeId?: string;
  method: AdmissionMethod;
  status: AdmissionStatus;
  performedAt: string;
  operator?: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

export type AdmissionAttempt = {
  id: string;
  eventId: string;
  accessGrantId?: string;
  attendeeId?: string;
  method: AdmissionMethod;
  query: string;
  timestamp: string;
  status: AdmissionStatus;
  result: AdmissionStatus;
  note: string;
  metadata?: Record<string, unknown>;
};

export type AttendeeStatus = "active" | "pending" | "confirmed" | "checked-in" | "cancelled" | "blocked" | "archived";

export type Attendee = {
  id: string;
  eventId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  document?: string;
  status: AttendeeStatus;
  tags: string[];
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type Event = {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  eventType: EventType;
  status: EventStatus;
  startAt: string;
  endAt?: string;
  timezone: string;
  venue: string;
  capacity: number;
  enabledModules: EventModule[];
  operationalModel: OperationalModel;
  admissionMethods: AdmissionMethod[];
  resourceTypes: ResourceType[];
  icon?: string;
  metadata?: Record<string, unknown>;
};

export type AccessGrantType =
  | "ticket"
  | "invitation"
  | "reservation"
  | "guest-list"
  | "accreditation"
  | "staff-pass"
  | "vip-pass"
  | "courtesy"
  | "registration";

export type AccessGrantStatus = "draft" | "active" | "used" | "cancelled" | "expired" | "blocked";

export type AccessGrantSource = "reservation" | "manual" | "import" | "web" | "whatsapp" | "guest-list" | "box-office" | "staff" | "ticketing";

export type AccessGrant = {
  id: string;
  eventId: string;
  attendeeId?: string;
  type: AccessGrantType;
  status: AccessGrantStatus;
  validFrom?: string;
  validUntil?: string;
  usesAllowed: number;
  usesConsumed: number;
  resourceAssignments: string[];
  admissionRules: string[];
  source: AccessGrantSource;
  metadata?: Record<string, unknown>;
};

export type ResourceType = "table" | "seat" | "zone" | "box" | "room" | "booth" | "area";

export type ResourceStatus = "available" | "reserved" | "assigned" | "occupied" | "partial" | "full" | "closed" | "inactive";

export type Resource = {
  id: string;
  eventId: string;
  type: ResourceType;
  name: string;
  capacity: number;
  status: ResourceStatus;
  parentResourceId?: string;
  metadata?: Record<string, unknown>;
};

export type ActivityColor = "neutral" | "info" | "success" | "warning" | "danger";

export type ActivityKind =
  | "reservation.created"
  | "reservation.updated"
  | "reservation.cancelled"
  | "attendee.added"
  | "attendee.updated"
  | "attendee.confirmed"
  | "attendee.cancelled"
  | "access.granted"
  | "access.revoked"
  | "access.used"
  | "resource.assigned"
  | "resource.changed"
  | "resource.released"
  | "admission.attempted"
  | "admission.success"
  | "admission.denied"
  | "admission.blocked"
  | "admission.manual"
  | "operations.alert"
  | "operations.resolved"
  | "timeline.note";

export type ActivityEntry = {
  id: string;
  eventId: string;
  timestamp: string;
  kind: ActivityKind;
  icon: string;
  color: ActivityColor;
  title: string;
  description: string;
  reservationId?: string;
  attendeeId?: string;
  accessGrantId?: string;
  resourceId?: string;
  admissionAttemptId?: string;
  metadata?: Record<string, unknown>;
};
