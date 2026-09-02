export type TimelineTone = "success" | "warning" | "danger" | "info";

export type TimelineIcon = "reservation" | "guest" | "table" | "checkin" | "alert";

export type TimelineKind =
  | "reservation.created"
  | "reservation.updated"
  | "guest.added"
  | "guest.confirmed"
  | "guest.cancelled"
  | "guest.removed"
  | "reservation.extra_wristbands_added"
  | "reservation.extra_wristbands_cancelled"
  | "guest.reverted"
  | "table.assigned"
  | "table.changed"
  | "table.released"
  | "table.closed"
  | "checkin.success"
  | "checkin.manual"
  | "checkin.checkout"
  | "checkin.invalid"
  | "checkin.blocked"
  | "operations.alert"
  | "operations.resolved"
  | "timeline.note";

export type TimelineEvent = {
  id: string;
  eventId?: string;
  createdAt?: string;
  timestamp: string;
  kind: TimelineKind;
  icon: TimelineIcon;
  tone: TimelineTone;
  title: string;
  description: string;
  actor?: string;
  actorRole?: string;
  context?: string;
  target?: string;
  reservationId?: string;
  reservationCode?: string;
  reservationName?: string;
  guestId?: string;
  guestName?: string;
  tableId?: string;
  tableName?: string;
  metadata?: Record<string, unknown>;
};
