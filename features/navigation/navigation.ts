import type { AccountPermissionKey } from "@/features/accounts/types";
import type { Event as PlatformEvent, EventModule } from "@/features/domain/types";
import { isModuleEnabled } from "@/features/events/domain";

export type NavigationItem = {
  href: string;
  label: string;
  icon: string;
  permission: AccountPermissionKey;
  module?: EventModule;
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
      { href: "/reservations", label: "Reservas", icon: "reservations", permission: "reservation.view", module: "access", description: "Flujo de reservas y detalle operativo." },
      { href: "/customers", label: "Invitados", icon: "customers", permission: "guest.view", module: "attendees", description: "Directorio de invitados y atención." },
      { href: "/check-in", label: "Ingreso", icon: "checkin", permission: "checkin.view", module: "admission", description: "Validación y registro de ingresos." },
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

function isItemVisible(item: NavigationItem, can: (permission: AccountPermissionKey) => boolean, currentEvent?: Pick<PlatformEvent, "enabledModules"> | null) {
  if (!can(item.permission)) {
    return false;
  }

  if (!item.module) {
    return true;
  }

  if (!currentEvent) {
    return false;
  }

  return isModuleEnabled(currentEvent, item.module);
}

export function getNavigationGroups(can: (permission: AccountPermissionKey) => boolean, currentEvent?: Pick<PlatformEvent, "enabledModules"> | null) {
  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((item) => isItemVisible(item, can, currentEvent)),
  })).filter((group) => group.links.length > 0);
}

export function getNavigationItems() {
  return NAVIGATION_GROUPS.flatMap((group) => group.links);
}

export function getNavigationRouteMatch(pathname: string) {
  const currentPath = normalizePathname(pathname);

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
  currentEvent?: Pick<PlatformEvent, "enabledModules"> | null,
) {
  return isItemVisible(item, can, currentEvent);
}

export function getNavigationPermissionForPath(pathname: string) {
  return getNavigationRouteMatch(pathname)?.permission ?? null;
}

export function getNavigationModuleForPath(pathname: string) {
  return getNavigationRouteMatch(pathname)?.module ?? null;
}

