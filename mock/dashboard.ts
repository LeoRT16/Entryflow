import type { NavigationItem } from "@/types/dashboard";

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

export const todayEvent = {
  name: "Noche Carlota",
  date: "8 de agosto de 2026",
  startsAt: "21:00",
  reservations: 84,
  expectedGuests: 236,
  checkedIn: 128,
};
export type { NavigationItem };
