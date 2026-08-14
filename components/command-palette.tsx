"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import StatusBadge from "@/components/status-badge";
import { buildGuidedActionItem } from "@/components/quick-actions-menu";
import { useCheckInStore } from "@/services/workspace-service";
import { buildGuestSearchIndex, normalizeCheckInText } from "@/features/check-in/utils";
import { formatReservationStatus } from "@/features/reservations/domain/reservation-domain";
import { formatTableStatus } from "@/features/tables/domain/table-domain";
import { getEventTypeLabel } from "@/features/events/domain";
import type { AccountPermissionKey } from "@/features/accounts/types";

type PaletteSection =
  | "Acciones críticas"
  | "Acciones guiadas"
  | "Workspace"
  | "Navegación"
  | "Búsqueda"
  | "Recientes";

type PaletteItem = {
  id: string;
  section: PaletteSection;
  title: string;
  description: string;
  badge: string;
  shortcut?: string;
  icon: string;
  searchText: string;
  onSelect: () => void;
  order: number;
  permission?: AccountPermissionKey;
};

const sectionOrder: Record<PaletteSection, number> = {
  "Acciones críticas": 0,
  "Acciones guiadas": 1,
  Workspace: 2,
  Navegación: 3,
  Búsqueda: 4,
  Recientes: 5,
};

const sectionLabel: Record<PaletteSection, string> = {
  "Acciones críticas": "Críticas",
  "Acciones guiadas": "Guiadas",
  Workspace: "Workspace",
  Navegación: "Navegación",
  Búsqueda: "Búsqueda",
  Recientes: "Recientes",
};

function iconForSection(section: PaletteSection) {
  if (section === "Acciones críticas") return "!";
  if (section === "Acciones guiadas") return "↗";
  if (section === "Workspace") return "◌";
  if (section === "Navegación") return "→";
  if (section === "Búsqueda") return "⌕";
  return "◷";
}

function matchesQuery(item: PaletteItem, query: string) {
  if (!query) return true;
  return item.searchText.includes(query);
}

function relevanceScore(item: PaletteItem, query: string) {
  if (!query) return 0;
  if (item.searchText.startsWith(query)) return 0;
  if (item.searchText.includes(query)) return 1;
  return 2;
}

function sortPaletteItems(items: PaletteItem[], query: string) {
  return [...items]
    .filter((item) => matchesQuery(item, query))
    .sort((a, b) => {
      const sectionDiff = sectionOrder[a.section] - sectionOrder[b.section];
      if (sectionDiff !== 0) return sectionDiff;

      const relevanceDiff = relevanceScore(a, query) - relevanceScore(b, query);
      if (relevanceDiff !== 0) return relevanceDiff;

      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) return orderDiff;

      return a.title.localeCompare(b.title);
    });
}

function paletteRowTone(section: PaletteSection) {
  if (section === "Acciones críticas") return "danger";
  if (section === "Acciones guiadas") return "warning";
  if (section === "Workspace") return "info";
  if (section === "Navegación") return "info";
  if (section === "Búsqueda") return "success";
  return "info";
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const {
    organizations,
    currentOrganization,
    currentEvent,
    currentAccount,
    events,
    guests,
    reservationSummaries,
    tableSummaries,
    workspaceIntelligence,
    workspacePriority,
    can,
    setCurrentOrganizationId,
    setCurrentEventId,
  } = useCheckInStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = normalizeCheckInText(query);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const operator = currentAccount.displayName || workspaceIntelligence.statistics.cards.activeOperators[0] || "Recepción";
  const currentState = workspacePriority.summary.message;
  const snapshotSummary = workspaceIntelligence.dashboard.currentEventSummary;

  const criticalActions = useMemo(
    () =>
      workspacePriority.criticalItems.slice(0, 5).map((item, index) => {
        const guided = buildGuidedActionItem(item, {
          href: item.route,
          impact: item.description,
        });

        return {
          id: `critical-${item.id}`,
          section: "Acciones críticas" as const,
          title: guided.label,
          description: `${guided.reason} · ${guided.impact}`,
          badge: item.module,
          shortcut: item.route,
          icon: iconForSection("Acciones críticas"),
          searchText: normalizeCheckInText(
            [
              item.title,
              item.description,
              item.module,
              item.category,
              item.route,
              guided.label,
            ].join(" "),
          ),
          order: index,
          onSelect: () => {
            router.push(item.route);
            onClose();
          },
        };
      }),
    [onClose, router, workspacePriority.criticalItems],
  );

  const guidedActions = useMemo(
    () =>
      workspacePriority.nextBestActions.slice(0, 5).map((item, index) => {
        const guided = buildGuidedActionItem(item, {
          href: item.route,
          impact: item.description,
        });

        return {
          id: `guided-${item.id}`,
          section: "Acciones guiadas" as const,
          title: guided.label,
          description: `${guided.reason} · ${guided.impact}`,
          badge: item.module,
          shortcut: item.route,
          icon: iconForSection("Acciones guiadas"),
          searchText: normalizeCheckInText(
            [
              guided.label,
              guided.reason,
              guided.impact,
              item.title,
              item.description,
              item.module,
              item.route,
            ].join(" "),
          ),
          order: index,
          onSelect: () => {
            if (guided.href) {
              router.push(guided.href);
            } else if (guided.onSelect) {
              guided.onSelect();
            } else {
              router.push(item.route);
            }
            onClose();
          },
        };
      }),
    [onClose, router, workspacePriority.nextBestActions],
  );

  const workspaceActions = useMemo(() => {
    const organizationItems: PaletteItem[] = organizations.map((organization, index) => ({
      id: `workspace-org-${organization.id}`,
      section: "Workspace",
      title: `Cambiar organización · ${organization.name}`,
      description: organization.id === currentOrganization.id
        ? "Organización activa."
        : `Cambiar el espacio de trabajo hacia ${organization.name}.`,
      badge: organization.status,
      shortcut: organization.id === currentOrganization.id ? "Actual" : "↩",
      icon: iconForSection("Workspace"),
      searchText: normalizeCheckInText(
        [
          "cambiar organización",
          organization.name,
          organization.slug,
          organization.status,
          organization.timezone,
        ].join(" "),
      ),
      order: index,
      onSelect: () => {
        setCurrentOrganizationId(organization.id);
        router.push("/events");
        onClose();
      },
    }));

    const eventItems: PaletteItem[] = events
      .filter((event) => event.organizationId === currentOrganization.id)
      .map((event, index) => ({
        id: `workspace-event-${event.id}`,
        section: "Workspace",
        title: `Cambiar evento · ${event.name}`,
        description:
          event.id === currentEvent.id
            ? "Evento activo."
            : `${getEventTypeLabel(event.eventType)} · ${event.venue}`,
        badge: event.status,
        shortcut: event.id === currentEvent.id ? "Actual" : event.startAt.slice(11, 16),
        icon: iconForSection("Workspace"),
        searchText: normalizeCheckInText(
          [
            "cambiar evento",
            event.name,
            event.venue,
            event.status,
            getEventTypeLabel(event.eventType),
          ].join(" "),
        ),
        order: index + 20,
        onSelect: () => {
          setCurrentEventId(event.id);
          router.push("/events");
          onClose();
        },
      }));

    const items = ([
      {
        id: "workspace-snapshot",
        section: "Workspace",
        title: "Workspace Snapshot",
        description: `${currentOrganization.name} · ${currentEvent.name} · ${currentState}`,
        badge: "Snapshot",
        shortcut: "⌥S",
        icon: iconForSection("Workspace"),
        searchText: normalizeCheckInText(
          [
            "workspace snapshot",
            currentOrganization.name,
            currentEvent.name,
            currentState,
            operator,
            snapshotSummary.expectedGuests,
            snapshotSummary.checkedIn,
          ].join(" "),
        ),
        order: -10,
        onSelect: () => {
          router.push("/statistics");
          onClose();
        },
      },
      {
        id: "workspace-operator",
        section: "Workspace",
        title: "Ver operador",
        description: `Cuenta activa: ${operator}`,
        badge: "Operador",
        shortcut: "⌥O",
        icon: iconForSection("Workspace"),
        searchText: normalizeCheckInText(`operador ${operator} workspace actual`),
        order: -9,
        onSelect: () => {
          router.push("/operations");
          onClose();
        },
      },
      {
        id: "workspace-state",
        section: "Workspace",
        title: "Ver estado",
        description: `${currentState} · ${currentEvent.status}`,
        badge: "Estado",
        shortcut: "⌥E",
        icon: iconForSection("Workspace"),
        searchText: normalizeCheckInText(`estado ${currentState} ${currentEvent.status}`),
        order: -8,
        onSelect: () => {
          router.push("/operations");
          onClose();
        },
      },
      ...organizationItems,
      ...eventItems,
    ] as PaletteItem[]).filter((item) => !item.permission || can(item.permission));

    return items;
  }, [can, currentEvent.id, currentEvent.name, currentEvent.status, currentOrganization.id, currentOrganization.name, currentState, events, onClose, operator, organizations, router, setCurrentEventId, setCurrentOrganizationId, snapshotSummary.checkedIn, snapshotSummary.expectedGuests]);

  const navigationActions = useMemo(() => {
    const items = ([
      { id: "nav-dashboard", section: "Navegación", title: "Ir al resumen", description: "Centro de control principal.", badge: "/", shortcut: "⌘1", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("dashboard inicio home"), order: 0, onSelect: () => { router.push("/"); onClose(); }, permission: "dashboard.view" },
      { id: "nav-reservations", section: "Navegación", title: "Ir a reservas", description: "Flujo de reservas y detalle operativo.", badge: "/reservations", shortcut: "⌘2", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("reservations reservas reserva"), order: 1, onSelect: () => { router.push("/reservations"); onClose(); }, permission: "reservation.view" },
      { id: "nav-customers", section: "Navegación", title: "Ir a invitados", description: "Directorio de invitados y atención.", badge: "/customers", shortcut: "⌘3", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("customers clientes invitados"), order: 2, onSelect: () => { router.push("/customers"); onClose(); }, permission: "guest.view" },
      { id: "nav-checkin", section: "Navegación", title: "Ir al ingreso", description: "Validación y registro de ingresos.", badge: "/check-in", shortcut: "⌘4", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("checkin check-in ingreso admision"), order: 3, onSelect: () => { router.push("/check-in"); onClose(); }, permission: "checkin.view" },
      { id: "nav-operations", section: "Navegación", title: "Ir a operaciones", description: "Centro de control del evento.", badge: "/operations", shortcut: "⌘5", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("operations operaciones control"), order: 4, onSelect: () => { router.push("/operations"); onClose(); }, permission: "operations.view" },
      { id: "nav-timeline", section: "Navegación", title: "Ir a actividad", description: "Actividad reciente sincronizada.", badge: "/timeline", shortcut: "⌘6", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("timeline actividad log"), order: 5, onSelect: () => { router.push("/timeline"); onClose(); }, permission: "timeline.view" },
      { id: "nav-tables", section: "Navegación", title: "Ir a recursos", description: "Estado y ocupación de recursos físicos.", badge: "/tables", shortcut: "⌘7", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("tables mesas capacidad"), order: 6, onSelect: () => { router.push("/tables"); onClose(); }, permission: "resource.view" },
      { id: "nav-statistics", section: "Navegación", title: "Ir a estadísticas", description: "Vista analítica del espacio de trabajo.", badge: "/statistics", shortcut: "⌘8", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("statistics analytics metricas"), order: 7, onSelect: () => { router.push("/statistics"); onClose(); }, permission: "statistics.view" },
      { id: "nav-settings", section: "Navegación", title: "Ir a Ajustes", description: "Configuración operativa y del espacio de trabajo.", badge: "/settings", shortcut: "⌘9", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("settings ajustes configuracion"), order: 8, onSelect: () => { router.push("/settings"); onClose(); }, permission: "settings.view" },
      { id: "nav-events", section: "Navegación", title: "Ir a eventos", description: "Biblioteca y gestión de eventos.", badge: "/events", shortcut: "⌘0", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("events eventos biblioteca"), order: 9, onSelect: () => { router.push("/events"); onClose(); }, permission: "event.view" },
      { id: "nav-users", section: "Navegación", title: "Ir al equipo", description: "Administración de miembros de la organización.", badge: "/users", shortcut: "⌘U", icon: iconForSection("Navegación"), searchText: normalizeCheckInText("users usuarios equipo miembros"), order: 10, onSelect: () => { router.push("/users"); onClose(); }, permission: "accounts.view" },
    ] as PaletteItem[]).filter((item) => (item.permission ? can(item.permission) : true));

    return items;
  }, [can, onClose, router]);

  const searchActions = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    const operatorItems: PaletteItem[] = workspaceIntelligence.statistics.cards.activeOperators.map((value, index) => ({
      id: `operator-${index}`,
      section: "Búsqueda",
      title: `Operador ${value}`,
      description: "Operador activo del espacio de trabajo.",
      badge: "Operador",
      shortcut: "↩",
      icon: iconForSection("Búsqueda"),
      searchText: normalizeCheckInText(`operador ${value}`),
      order: index,
      onSelect: () => {
        router.push("/operations");
        onClose();
      },
    }));

    const reservationItems: PaletteItem[] = reservationSummaries.slice(0, 6).map((reservation, index) => ({
      id: `reservation-${reservation.id}`,
      section: "Búsqueda",
      title: reservation.name,
      description: `${reservation.code} · ${reservation.tableName} · ${reservation.metrics.guestCount} invitados`,
      badge: formatReservationStatus(reservation.status),
      shortcut: reservation.code,
      icon: iconForSection("Búsqueda"),
      searchText: normalizeCheckInText(
        [
          reservation.name,
          reservation.code,
          reservation.eventName,
          reservation.tableName,
          reservation.holderName,
          reservation.status,
          "reservation",
          "ticket",
          "codigo",
        ].join(" "),
      ),
      order: index,
      onSelect: () => {
        router.push("/reservations");
        onClose();
      },
    }));

    const customerItems: PaletteItem[] = guests.slice(0, 6).map((guest, index) => ({
      id: `customer-${guest.id}`,
      section: "Búsqueda",
      title: guest.guestName,
      description: `${guest.reservationCode} · ${guest.reservationName} · ${guest.admissionStatus}`,
      badge: guest.invitationCode,
      shortcut: guest.reservationCode,
      icon: iconForSection("Búsqueda"),
      searchText: normalizeCheckInText(
        [
          buildGuestSearchIndex(guest),
          guest.reservationCode,
          guest.reservationName,
          guest.invitationCode,
          guest.admissionStatus,
          "cliente",
          "customer",
          "invitado",
        ].join(" "),
      ),
      order: index,
      onSelect: () => {
        router.push("/customers");
        onClose();
      },
    }));

    const tableItems: PaletteItem[] = tableSummaries.slice(0, 6).map((table, index) => ({
      id: `table-${table.id}`,
      section: "Búsqueda",
      title: table.name,
      description: `${formatTableStatus(table.status)} · ${table.metrics.assignedGuests}/${table.capacity} ocupados`,
      badge: table.location,
      shortcut: `${table.metrics.occupancyPercent}%`,
      icon: iconForSection("Búsqueda"),
      searchText: normalizeCheckInText(
        [
          table.name,
          table.location,
          table.status,
          formatTableStatus(table.status),
          table.reservations.map((reservation) => reservation.name).join(" "),
          table.guests.map((guest) => guest.name).join(" "),
          "mesa",
          "tables",
        ].join(" "),
      ),
      order: index,
      onSelect: () => {
        router.push("/tables");
        onClose();
      },
    }));

    const eventItems: PaletteItem[] = events.slice(0, 6).map((event, index) => ({
      id: `event-${event.id}`,
      section: "Búsqueda",
      title: event.name,
      description: `${getEventTypeLabel(event.eventType)} · ${event.venue} · ${event.status}`,
      badge: event.status,
      shortcut: event.startAt.slice(0, 10),
      icon: iconForSection("Búsqueda"),
      searchText: normalizeCheckInText(
        [
          event.name,
          event.venue,
          event.eventType,
          getEventTypeLabel(event.eventType),
          event.status,
          "evento",
          "event",
        ].join(" "),
      ),
      order: index,
      onSelect: () => {
        if (event.id !== currentEvent.id) {
          setCurrentEventId(event.id);
        }
        router.push("/events");
        onClose();
      },
    }));

    const ticketItems: PaletteItem[] = reservationSummaries.slice(0, 6).map((reservation, index) => ({
      id: `ticket-${reservation.id}`,
      section: "Búsqueda",
      title: `Ticket ${reservation.code}`,
      description: `${reservation.name} · ${reservation.holderName}`,
      badge: "Ticket",
      shortcut: reservation.code,
      icon: iconForSection("Búsqueda"),
      searchText: normalizeCheckInText(
        [
          reservation.code,
          reservation.name,
          reservation.holderName,
          reservation.holderDocument,
          "ticket",
        ].join(" "),
      ),
      order: index,
      onSelect: () => {
        router.push("/reservations");
        onClose();
      },
    }));

    const codeItems: PaletteItem[] = guests.slice(0, 6).map((guest, index) => ({
      id: `code-${guest.id}`,
      section: "Búsqueda",
      title: `Código ${guest.invitationCode}`,
      description: `${guest.guestName} · ${guest.reservationName}`,
      badge: guest.invitationCode,
      shortcut: "QR",
      icon: iconForSection("Búsqueda"),
      searchText: normalizeCheckInText(
        [
          guest.invitationCode,
          guest.invitationSequence,
          guest.reservationCode,
          guest.guestName,
          "codigo",
          "code",
          "qr",
        ].join(" "),
      ),
      order: index,
      onSelect: () => {
        router.push("/check-in");
        onClose();
      },
    }));

    const results = [
      ...operatorItems,
      ...reservationItems,
      ...customerItems,
      ...tableItems,
      ...eventItems,
      ...ticketItems,
      ...codeItems,
    ];

    return sortPaletteItems(results, normalizedQuery).slice(0, 18);
  }, [
    currentEvent.id,
    events,
    guests,
    normalizedQuery,
    onClose,
    reservationSummaries,
    router,
    setCurrentEventId,
    tableSummaries,
    workspaceIntelligence.statistics.cards.activeOperators,
  ]);

  const recentActions = useMemo(() => {
    const recentTimeline = workspacePriority.recentChanges.slice(0, 3).map((item, index) => ({
      id: `recent-timeline-${item.id}`,
      section: "Recientes" as const,
      title: item.title,
      description: item.description,
      badge: item.kind,
      shortcut: item.timestamp,
      icon: iconForSection("Recientes"),
      searchText: normalizeCheckInText([item.title, item.description, item.kind, item.timestamp].join(" ")),
      order: index,
      onSelect: () => {
        router.push("/timeline");
        onClose();
      },
    }));

    const recentReservations = reservationSummaries.slice(0, 2).map((reservation, index) => ({
      id: `recent-reservation-${reservation.id}`,
      section: "Recientes" as const,
      title: reservation.name,
      description: `${reservation.code} · ${reservation.time} · ${reservation.tableName}`,
      badge: "Reserva",
      shortcut: reservation.status,
      icon: iconForSection("Recientes"),
      searchText: normalizeCheckInText([reservation.name, reservation.code, reservation.tableName, reservation.status].join(" ")),
      order: index + 3,
      onSelect: () => {
        router.push("/reservations");
        onClose();
      },
    }));

    const recentGuests = guests.slice(0, 2).map((guest, index) => ({
      id: `recent-guest-${guest.id}`,
      section: "Recientes" as const,
      title: guest.guestName,
      description: `${guest.reservationCode} · ${guest.admissionStatus}`,
      badge: guest.invitationCode,
      shortcut: guest.qrStatus,
      icon: iconForSection("Recientes"),
      searchText: normalizeCheckInText([guest.guestName, guest.reservationCode, guest.invitationCode, guest.admissionStatus].join(" ")),
      order: index + 5,
      onSelect: () => {
        router.push("/customers");
        onClose();
      },
    }));

    const recentTables = tableSummaries.slice(0, 2).map((table, index) => ({
      id: `recent-table-${table.id}`,
      section: "Recientes" as const,
      title: table.name,
      description: `${table.status} · ${table.metrics.assignedGuests}/${table.capacity} ocupados`,
      badge: table.location,
      shortcut: `${table.metrics.occupancyPercent}%`,
      icon: iconForSection("Recientes"),
      searchText: normalizeCheckInText([table.name, table.location, table.status].join(" ")),
      order: index + 7,
      onSelect: () => {
        router.push("/tables");
        onClose();
      },
    }));

    return sortPaletteItems([...recentTimeline, ...recentReservations, ...recentGuests, ...recentTables], normalizedQuery).slice(0, 8);
  }, [guests, onClose, reservationSummaries, router, tableSummaries, workspacePriority.recentChanges, normalizedQuery]);

  const items = useMemo(
    () =>
      [...criticalActions, ...guidedActions, ...workspaceActions, ...navigationActions, ...searchActions, ...recentActions],
    [criticalActions, guidedActions, navigationActions, recentActions, searchActions, workspaceActions],
  );

  const groupedItems = useMemo(
    () =>
      ["Acciones críticas", "Acciones guiadas", "Workspace", "Navegación", "Búsqueda", "Recientes"].map((section) => ({
        section: section as PaletteSection,
        items: items.filter((item) => item.section === section),
      })).filter((group) => group.items.length > 0),
    [items],
  );

  const visibleItems = useMemo(() => groupedItems.flatMap((group) => group.items), [groupedItems]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(visibleItems.length - 1, 0));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleItems.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      visibleItems[safeActiveIndex]?.onSelect();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 py-6 backdrop-blur-xl sm:py-12">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Cerrar command palette"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#090d13] shadow-[0_30px_140px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300">
            ⌘K
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar reservas, invitados, mesas, acciones o pantallas"
            className="h-12 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-500"
          />
          <StatusBadge variant="info">{visibleItems.length}</StatusBadge>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-2">
          {groupedItems.length ? (
            groupedItems.map((group) => (
              <div key={group.section} className="mb-3">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {sectionLabel[group.section]}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const index = visibleItems.findIndex((candidate) => candidate.id === item.id);
                    const selected = index === safeActiveIndex;

                    return (
                      <button
                        key={item.id}
                        ref={(node) => {
                          itemRefs.current[index] = node;
                        }}
                        type="button"
                        onClick={item.onSelect}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={[
                          "flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                          selected
                            ? "border-cyan-400/30 bg-cyan-400/10"
                            : "border-transparent bg-white/[0.03] hover:bg-white/[0.06]",
                        ].join(" ")}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm font-semibold text-white">
                          {item.icon}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-white">{item.title}</p>
                            <StatusBadge variant={paletteRowTone(item.section)}>{item.section}</StatusBadge>
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-400">{item.description}</p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <StatusBadge variant="info">{item.badge}</StatusBadge>
                          {item.shortcut ? <StatusBadge variant="warning">{item.shortcut}</StatusBadge> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              No encontramos coincidencias para “{query}”.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">
          <span>↑↓ navegar · Enter ejecutar · Esc cerrar</span>
          <span>{currentEvent.name}</span>
        </div>
      </section>
    </div>
  );
}
