"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import LogoutButton from "@/components/logout-button";
import EventSwitcher from "@/components/event-switcher";
import StatusBadge from "@/components/status-badge";
import TerminalEventBanner from "@/components/terminal-event-banner";
import { getEventTypeLabel, isTerminalEventStatus } from "@/features/events/domain";
import { getNavigationGroups } from "@/features/navigation/navigation";
import { useCheckInStore } from "@/services/workspace-service";

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatEventStatus(status: string) {
  if (status === "live") return "En curso";
  if (status === "published") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "finished") return "Finalizado";
  return "Cancelado";
}

function NavIcon({
  name,
  active,
}: {
  name: string;
  active: boolean;
}) {
  const strokeClass = active ? "stroke-white" : "stroke-slate-400";
  const iconProps = {
    className: `h-4 w-4 shrink-0 ${strokeClass}`,
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "overview":
    case "dashboard":
      return (
        <svg {...iconProps}>
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6.5 10.8V20h11V10.8" />
        </svg>
      );
    case "operations":
      return (
        <svg {...iconProps}>
          <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "access":
      return (
        <svg {...iconProps}>
          <path d="M6 6h12" />
          <path d="M6 10h12" />
          <path d="M6 14h8" />
          <path d="M17 17.5l1.2 1.2 2.8-2.8" />
        </svg>
      );
    case "events":
      return (
        <svg {...iconProps}>
          <path d="M7 3v4" />
          <path d="M17 3v4" />
          <rect x="4.5" y="5.5" width="15" height="15" rx="2.5" />
          <path d="M4.5 8.5h15" />
        </svg>
      );
    case "reservations":
      return (
        <svg {...iconProps}>
          <path d="M6 6h12" />
          <path d="M6 10h12" />
          <path d="M6 14h8" />
          <path d="M17 17.5l1.2 1.2 2.8-2.8" />
        </svg>
      );
    case "attendees":
    case "guests":
      return (
        <svg {...iconProps}>
          <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M17 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M4.5 19c.7-3 2.9-4.8 5.5-4.8s4.8 1.8 5.5 4.8" />
          <path d="M14.4 19c.5-2 1.9-3.3 3.6-3.3 1.2 0 2.3.5 3 1.5" />
        </svg>
      );
    case "tables":
      return (
        <svg {...iconProps}>
          <rect x="4.5" y="5.5" width="6" height="6" rx="1.5" />
          <rect x="13.5" y="5.5" width="6" height="6" rx="1.5" />
          <rect x="4.5" y="14.5" width="6" height="4" rx="1.2" />
          <rect x="13.5" y="14.5" width="6" height="4" rx="1.2" />
        </svg>
      );
    case "admission":
    case "checkin":
      return (
        <svg {...iconProps}>
          <path d="M12 3v6" />
          <path d="M9.5 6.5 12 4l2.5 2.5" />
          <path d="M5 12h14" />
          <path d="M7 9.5V18h10V9.5" />
        </svg>
      );
    case "activity":
    case "timeline":
      return (
        <svg {...iconProps}>
          <path d="M6 6.5h12" />
          <path d="M6 12h8" />
          <path d="M6 17.5h10" />
          <circle cx="17" cy="12" r="1.4" />
        </svg>
      );
    case "analytics":
    case "stats":
      return (
        <svg {...iconProps}>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-8" />
        </svg>
      );
    case "settings":
      return (
        <svg {...iconProps}>
          <path d="M10.5 4.8h3l.6 2.1a7.4 7.4 0 0 1 1.8.8l2-1.1 1.5 2.6-1.7 1.5c.1.3.2.8.2 1.2s-.1.9-.2 1.2l1.7 1.5-1.5 2.6-2-1.1c-.6.3-1.1.6-1.8.8l-.6 2.1h-3l-.6-2.1a7.4 7.4 0 0 1-1.8-.8l-2 1.1-1.5-2.6 1.7-1.5A5.7 5.7 0 0 1 6.3 12c0-.4.1-.9.2-1.2L4.8 9.3 6.3 6.7l2 1.1c.6-.3 1.1-.6 1.8-.8l.6-2.1Z" />
          <circle cx="12" cy="12" r="2.3" />
        </svg>
      );
    case "users":
      return (
        <svg {...iconProps}>
          <path d="M8.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M16.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M4.5 19c.7-3 2.9-4.8 5.5-4.8s4.8 1.8 5.5 4.8" />
          <path d="M13.8 19c.4-1.8 1.7-3 3.2-3 1.1 0 2.1.4 2.8 1.3" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}

export default function Sidebar({
  mobileNavOpen,
  onCloseMobileNav,
}: {
  mobileNavOpen: boolean;
  onCloseMobileNav: () => void;
}) {
  const pathname = usePathname();
  const { currentOrganization, currentEvent, currentAccount, can } = useCheckInStore();
  const canSwitchEventContext = can("event.view");
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);
  const navigationGroups = getNavigationGroups(can, currentEvent);

  const renderNavigation = (onLinkClick?: () => void) =>
    navigationGroups.map((group) => (
      <div key={group.title} className="space-y-1">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">{group.title}</p>
        <ul className="space-y-1">
          {group.links.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onLinkClick}
                  className={[
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                    active ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-slate-300 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  <NavIcon name={item.icon} active={active} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    ));

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] md:hidden"
          aria-label="Cerrar menú de navegación"
          onClick={onCloseMobileNav}
        />
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh w-72 flex-col overflow-hidden border-r border-white/10 bg-[#0d1117] md:flex">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-white/10 px-5 py-5">
            <p className="kicker">Contexto operativo</p>
            <div className="mt-3 max-w-full">
              {canSwitchEventContext ? (
                <EventSwitcher compact />
              ) : (
                <div className="surface-interactive px-4 py-3">
                  <p className="truncate text-sm font-semibold text-white">{currentEvent.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {getEventTypeLabel(currentEvent.eventType)} · {currentEvent.venue}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge variant="info">{currentOrganization.name}</StatusBadge>
              <StatusBadge
                variant={
                  currentEvent.status === "live"
                    ? "success"
                    : currentEvent.status === "published"
                      ? "info"
                      : currentEvent.status === "draft"
                        ? "warning"
                        : "danger"
                }
              >
                {formatEventStatus(currentEvent.status)}
              </StatusBadge>
              <StatusBadge variant="info">{currentAccount.roleName}</StatusBadge>
            </div>
            {isTerminalEvent ? (
              <div className="mt-3">
                <TerminalEventBanner description="El evento activo está cerrado. Podés navegar al historial, cambiar de evento y consultar la operación en modo lectura." />
              </div>
            ) : null}
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            <div className="space-y-5">{renderNavigation()}</div>
          </nav>

          <div className="border-t border-white/10 px-5 py-4">
            <div className="surface-elevated p-4">
              <p className="kicker">Sesión</p>
              <p className="mt-2 text-sm font-medium text-white">{currentAccount.displayName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {currentOrganization.name} · {currentAccount.roleName}
              </p>
              <div className="mt-3">
                <LogoutButton />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 h-dvh w-80 max-w-[85vw] flex-col overflow-hidden border-r border-white/10 bg-[#0d1117] transition-transform duration-200 ease-out md:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-hidden={!mobileNavOpen}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between border-b border-white/10 px-5 py-5">
            <div>
              <p className="kicker">Contexto operativo</p>
              <div className="mt-3 max-w-full">
                {canSwitchEventContext ? (
                  <EventSwitcher compact />
                ) : (
                  <div className="surface-interactive px-4 py-3">
                    <p className="truncate text-sm font-semibold text-white">{currentEvent.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {getEventTypeLabel(currentEvent.eventType)} · {currentEvent.venue}
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge variant="info">{currentOrganization.name}</StatusBadge>
                <StatusBadge
                  variant={
                    currentEvent.status === "live"
                      ? "success"
                      : currentEvent.status === "published"
                        ? "info"
                        : currentEvent.status === "draft"
                          ? "warning"
                          : "danger"
                  }
                >
                  {formatEventStatus(currentEvent.status)}
                </StatusBadge>
                <StatusBadge variant="info">{currentAccount.roleName}</StatusBadge>
              </div>
              {isTerminalEvent ? (
                <div className="mt-3">
                  <TerminalEventBanner description="El evento activo está cerrado. El menú permanece disponible para revisar información histórica y cambiar de contexto." />
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onCloseMobileNav}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
              aria-label="Cerrar menú de navegación"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            <div className="space-y-5">{renderNavigation(onCloseMobileNav)}</div>
          </nav>

          <div className="border-t border-white/10 px-5 py-4">
            <div className="surface-elevated p-4">
              <p className="kicker">Sesión</p>
              <p className="mt-2 text-sm font-medium text-white">{currentAccount.displayName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {currentOrganization.name} · {currentAccount.roleName}
              </p>
              <div className="mt-3">
                <LogoutButton />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
