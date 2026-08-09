export type TimelineTone = "success" | "warning" | "danger" | "info";

export type TimelineIcon = "reservation" | "guest" | "table" | "checkin" | "alert";

export type TimelineKind =
  | "reservation.created"
  | "reservation.updated"
  | "guest.added"
  | "guest.confirmed"
  | "guest.cancelled"
  | "guest.removed"
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
  timestamp: string;
  kind: TimelineKind;
  icon: TimelineIcon;
  tone: TimelineTone;
  title: string;
  description: string;
  reservationId?: string;
  reservationCode?: string;
  reservationName?: string;
  guestId?: string;
  guestName?: string;
  tableId?: string;
  tableName?: string;
  metadata?: Record<string, unknown>;
};
