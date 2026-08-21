import { getNavigationRouteMatch } from "@/features/navigation/navigation";
import type { Event as PlatformEvent } from "@/features/domain/types";

export type ShellRouteContext = {
  label: string;
  description: string;
  href: string;
};

export type ShellEventStatusTone = "success" | "warning" | "info" | "danger";

export function getShellRouteContext(pathname: string): ShellRouteContext {
  const route = getNavigationRouteMatch(pathname);

  return {
    label: route?.label ?? "Resumen",
    description: route?.description ?? "Centro de control principal.",
    href: route?.href ?? "/",
  };
}

export function buildShellContextSummary(organizationName: string, eventName?: string | null) {
  const resolvedOrganizationName = organizationName.trim() || "Sin organización";
  const resolvedEventName = eventName?.trim();

  if (!resolvedEventName) {
    return resolvedOrganizationName;
  }

  return `${resolvedOrganizationName} · ${resolvedEventName}`;
}

export function formatShellEventStatus(status: PlatformEvent["status"]) {
  if (status === "live") return "En curso";
  if (status === "published") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "finished") return "Finalizado";
  return "Cancelado";
}

export function getShellEventStatusTone(status: PlatformEvent["status"]): ShellEventStatusTone {
  if (status === "live") return "success";
  if (status === "published") return "info";
  if (status === "draft") return "warning";
  return "danger";
}
