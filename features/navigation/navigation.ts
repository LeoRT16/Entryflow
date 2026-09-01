import type { AccountPermissionKey } from "@/features/accounts/types";
import type { Event as PlatformEvent, EventModule } from "@/features/domain/types";
import { isModuleEnabled } from "@/features/events/domain";

export type NavigationItem = {
  href: string;
  label: string;
  icon: string;
  permission: AccountPermissionKey;
  module?: EventModule;
  eventTypes?: PlatformEvent["eventType"][];
  description: string;
};

export type NavigationGroup = {
  title: string;
  links: NavigationItem[];
};

const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    title: "Operación",
    links: [
      { href: "/", label: "Resumen", icon: "dashboard", permission: "dashboard.view", description: "Centro de control principal." },
      { href: "/operations", label: "Operaciones", icon: "operations", permission: "operations.view", module: "operations", description: "Centro de control del evento." },
      { href: "/reservations", label: "Reservas", icon: "reservations", permission: "reservation.view", module: "access", description: "Flujo de reservas y detalle operativo.", eventTypes: ["nightlife", "private", "custom"] },
      { href: "/customers", label: "Invitados", icon: "customers", permission: "guest.view", module: "attendees", description: "Directorio de invitados y atención.", eventTypes: ["nightlife", "private", "custom"] },
      { href: "/check-in", label: "Ingreso", icon: "checkin", permission: "checkin.view", module: "admission", description: "Validación y registro de ingresos.", eventTypes: ["nightlife", "private", "custom"] },
      { href: "/accreditation/events/:eventId", label: "Acreditación", icon: "access", permission: "guest.view", module: "attendees", eventTypes: ["concert", "corporate", "conference", "seminar", "workshop", "theatre", "festival"], description: "Participantes, credenciales y perfiles operativos." },
      { href: "/accreditation/events/:eventId/access", label: "Acceso operativo", icon: "admission", permission: "checkin.view", module: "admission", eventTypes: ["concert", "corporate", "conference", "seminar", "workshop", "theatre", "festival"], description: "Sectores, checkpoints, evaluación y movimientos." },
      { href: "/tables", label: "Espacios", icon: "tables", permission: "resource.view", module: "resources", description: "Estado y ocupación de espacios físicos." },
      { href: "/timeline", label: "Actividad", icon: "timeline", permission: "timeline.view", module: "activity", description: "Actividad reciente sincronizada." },
      { href: "/statistics", label: "Estadísticas", icon: "analytics", permission: "statistics.view", description: "Vista analítica del espacio de trabajo." },
    ],
  },
  {
    title: "Gestión",
    links: [
      { href: "/events", label: "Eventos", icon: "events", permission: "event.view", description: "Biblioteca y gestión de eventos." },
      { href: "/settings", label: "Ajustes", icon: "settings", permission: "settings.view", description: "Configuración operativa y del espacio de trabajo." },
      { href: "/users", label: "Equipo", icon: "users", permission: "accounts.view", description: "Administración de miembros de la organización." },
    ],
  },
];

function normalizePathname(pathname: string) {
  return pathname.split(/[?#]/)[0] || "/";
}

type NavigationEventContext = Pick<PlatformEvent, "enabledModules"> & Partial<Pick<PlatformEvent, "id" | "eventType">>;

function isItemVisible(item: NavigationItem, can: (permission: AccountPermissionKey) => boolean, currentEvent?: NavigationEventContext | null) {
  if (!can(item.permission)) {
    return false;
  }

  if (!item.module) {
    return true;
  }

  if (!currentEvent) {
    return false;
  }

  if (item.eventTypes && currentEvent.eventType && !item.eventTypes.includes(currentEvent.eventType)) {
    return false;
  }

  if (item.href.includes(":eventId") && !currentEvent.id) {
    return false;
  }

  return isModuleEnabled(currentEvent, item.module);
}

function resolveNavigationHref(item: NavigationItem, currentEvent?: NavigationEventContext | null) {
  return item.href.replace(":eventId", currentEvent?.id ?? "");
}

export function getNavigationGroups(can: (permission: AccountPermissionKey) => boolean, currentEvent?: NavigationEventContext | null) {
  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    links: group.links
      .filter((item) => isItemVisible(item, can, currentEvent))
      .map((item) => ({ ...item, href: resolveNavigationHref(item, currentEvent) })),
  })).filter((group) => group.links.length > 0);
}

export function getNavigationItems() {
  return NAVIGATION_GROUPS.flatMap((group) => group.links);
}

export function getNavigationRouteMatch(pathname: string) {
  const currentPath = normalizePathname(pathname);

  if (currentPath.startsWith("/accreditation/events/")) {
    return NAVIGATION_GROUPS[0]?.links.find((item) => item.label === "Acreditación") ?? null;
  }

  return getNavigationItems().find((item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`)) ?? null;
}

export function getFirstAccessibleNavigationHref(
  can: (permission: AccountPermissionKey) => boolean,
  currentEvent?: Pick<PlatformEvent, "enabledModules"> | null,
) {
  for (const group of NAVIGATION_GROUPS) {
    for (const item of group.links) {
      if (isItemVisible(item, can, currentEvent)) {
        return item.href;
      }
    }
  }

  return null;
}

export function canAccessNavigationItem(
  item: NavigationItem,
  can: (permission: AccountPermissionKey) => boolean,
  currentEvent?: NavigationEventContext | null,
) {
  return isItemVisible(item, can, currentEvent);
}

export function getNavigationPermissionForPath(pathname: string) {
  return getNavigationRouteMatch(pathname)?.permission ?? null;
}

export function getNavigationModuleForPath(pathname: string) {
  return getNavigationRouteMatch(pathname)?.module ?? null;
}
