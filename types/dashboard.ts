export type StatusTone = "success" | "warning" | "danger" | "info";

export type NavigationItem = {
  label: string;
  href: string;
  icon: "dashboard" | "events" | "reservations" | "checkin" | "guests" | "stats" | "settings";
};

export type SummaryMetric = {
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
};

export type ReservationRow = {
  guest: string;
  event: string;
  time: string;
  guests: number;
  status: string;
  tone: StatusTone;
  source: string;
};
