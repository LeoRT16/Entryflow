import type {
  NavigationItem,
  ReservationRow,
  SummaryMetric,
} from "@/types/dashboard";

export const business = {
  productName: "EntryFlow",
  currentBusiness: "La Rota Carlota",
};

export const navigationItems: NavigationItem[] = [
  { label: "Centro de Operaciones", href: "/", icon: "dashboard" },
  { label: "Eventos", href: "/events", icon: "events" },
  { label: "Reservas", href: "/reservations", icon: "reservations" },
  { label: "Ingresos", href: "/check-in", icon: "checkin" },
  { label: "Invitados", href: "/customers", icon: "guests" },
  { label: "Estadísticas", href: "/statistics", icon: "stats" },
  { label: "Ajustes", href: "/settings", icon: "settings" },
];

export const summaryMetrics: SummaryMetric[] = [
  {
    label: "Próximos eventos",
    value: "6",
    detail: "Tres confirmados esta semana",
    tone: "info",
  },
  {
    label: "Reservas de hoy",
    value: "84",
    detail: "12 aún por confirmar",
    tone: "warning",
  },
  {
    label: "Invitados esperados",
    value: "236",
    detail: "En las reservas de esta noche",
    tone: "success",
  },
  {
    label: "Ingresados",
    value: "128",
    detail: "54% de avance de la noche",
    tone: "success",
  },
];

export const todayEvent = {
  name: "Noche Carlota",
  date: "8 de agosto de 2026",
  startsAt: "21:00",
  reservations: 84,
  expectedGuests: 236,
  checkedIn: 128,
};

export const recentReservations: ReservationRow[] = [
  {
    guest: "Sofía Rivas",
    event: "Noche Carlota",
    time: "18:40",
    guests: 4,
    status: "Confirmada",
    tone: "success",
    source: "Sin cita",
  },
  {
    guest: "Marco Salas",
    event: "Noche Carlota",
    time: "18:55",
    guests: 2,
    status: "Pendiente",
    tone: "warning",
    source: "Sitio web",
  },
  {
    guest: "Daniela Paredes",
    event: "Noche Carlota",
    time: "19:05",
    guests: 6,
    status: "Confirmada",
    tone: "success",
    source: "WhatsApp",
  },
  {
    guest: "Jorge Quintana",
    event: "Noche Carlota",
    time: "19:24",
    guests: 3,
    status: "Ingresado",
    tone: "info",
    source: "Recepción",
  },
  {
    guest: "Camila Torres",
    event: "Noche Carlota",
    time: "19:40",
    guests: 2,
    status: "Cancelada",
    tone: "danger",
    source: "Teléfono",
  },
  {
    guest: "Luis Herrera",
    event: "Noche Carlota",
    time: "20:10",
    guests: 5,
    status: "Confirmada",
    tone: "success",
    source: "Sitio web",
  },
];

export type { NavigationItem, ReservationRow, SummaryMetric };
