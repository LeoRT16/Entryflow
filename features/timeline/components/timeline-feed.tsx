"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/status-badge";
import { ContextualCard } from "@/components/quick-actions-menu";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { buildTimelineQuickReadSummary, formatTimelineDisplayTime, getSecondaryTimelineSectionGridClass } from "@/features/timeline/domain/timeline-domain";
import type { TimelineEvent } from "@/features/timeline/types";

function TimelineMark({ tone }: { tone: TimelineEvent["tone"] }) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/15 text-emerald-300"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/15 text-amber-300"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-400/15 text-rose-300"
          : "border-sky-400/20 bg-sky-400/15 text-sky-300";

  return <span className={`inline-flex h-4 w-4 rounded-full border ${toneClasses}`} />;
}

function EventIcon({ icon }: { icon: TimelineEvent["icon"] }) {
  const iconProps = {
    className: "h-4 w-4",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "reservation":
      return (
        <svg {...iconProps}>
          <path d="M7 4.5v3" />
          <path d="M17 4.5v3" />
          <rect x="4.5" y="6.5" width="15" height="13" rx="2.5" />
          <path d="M4.5 10h15" />
        </svg>
      );
    case "guest":
      return (
        <svg {...iconProps}>
          <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M4.5 19c.7-3 2.9-4.8 5.5-4.8s4.8 1.8 5.5 4.8" />
        </svg>
      );
    case "table":
      return (
        <svg {...iconProps}>
          <path d="M4.5 8h15" />
          <path d="M8 8v11" />
          <path d="M16 8v11" />
          <path d="M5.5 14h13" />
        </svg>
      );
    case "checkin":
      return (
        <svg {...iconProps}>
          <path d="m8.5 12.2 2.4 2.4L16 9.5" />
          <path d="M5 12a7 7 0 1 1 14 0 7 7 0 0 1-14 0Z" />
        </svg>
      );
    case "alert":
      return (
        <svg {...iconProps}>
          <path d="M12 8.2v4.3" />
          <path d="M12 15.8h.01" />
          <path d="M10 4.8h4l6.2 11a1.7 1.7 0 0 1-1.5 2.5H5.3a1.7 1.7 0 0 1-1.5-2.5L10 4.8Z" />
        </svg>
      );
  }
}

function TimelineField({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <p className={`font-semibold uppercase tracking-[0.26em] text-slate-500 ${compact ? "text-[9px]" : "text-[10px]"}`}>{label}</p>
      <p className={`mt-2 whitespace-pre-line break-words font-medium text-white ${compact ? "text-xs leading-5" : "text-sm leading-6"}`}>{value || "—"}</p>
    </div>
  );
}

export default function TimelineFeed({ events }: { events: TimelineEvent[] }) {
  const router = useRouter();
  const groupedEvents = useMemo(() => {
    const groups = {
      Critical: [] as TimelineEvent[],
      Operational: [] as TimelineEvent[],
      Informational: [] as TimelineEvent[],
      System: [] as TimelineEvent[],
    };

    for (const event of events) {
      const normalizedKind = event.kind.toLowerCase();
      const normalizedTitle = event.title.toLowerCase();
      const entryType = typeof event.metadata?.entryType === "string" ? event.metadata.entryType.toLowerCase() : "";

      if (
        event.tone === "danger" ||
        normalizedKind.includes("invalid") ||
        normalizedKind.includes("blocked") ||
        normalizedKind.includes("closed")
      ) {
        groups.Critical.push(event);
      } else if (normalizedKind.includes("reservation.updated") || normalizedKind.includes("system") || entryType === "access.grant") {
        groups.System.push(event);
      } else if (
        event.tone === "warning" ||
        normalizedKind.includes("checkin") ||
        normalizedKind.includes("table") ||
        normalizedKind.includes("guest") ||
        normalizedTitle.includes("acceso generado")
      ) {
        groups.Operational.push(event);
      } else {
        groups.Informational.push(event);
      }
    }

    return groups;
  }, [events]);
  const orderedEvents = useMemo(
    () => [...groupedEvents.Critical, ...groupedEvents.Operational, ...groupedEvents.Informational, ...groupedEvents.System],
    [groupedEvents],
  );
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);

  const selectedEventIndexClamped = orderedEvents.length
    ? Math.min(selectedEventIndex, orderedEvents.length - 1)
    : 0;
  const selectedEvent = orderedEvents[selectedEventIndexClamped] ?? null;
  const buildCardActions = useCallback(
    (event: TimelineEvent) => [
      {
        id: `${event.id}-reservation`,
        label: "Abrir reserva",
        description: "Ir al panel de Reservas.",
        tone: "info" as const,
        onSelect: () => router.push("/reservations"),
      },
      {
        id: `${event.id}-customer`,
        label: "Abrir cliente",
        description: "Ir al directorio de Invitados.",
        tone: "info" as const,
        onSelect: () => router.push("/customers"),
      },
      {
        id: `${event.id}-table`,
        label: "Ir a la mesa",
        description: "Abrir el panel de Espacios.",
        tone: "warning" as const,
        onSelect: () => router.push("/tables"),
      },
    ],
    [router],
  );

  const renderTimelineCard = useCallback(
    (event: TimelineEvent, compact: boolean) => {
      const isSelected = selectedEvent?.id === event.id;
      const quickRead = buildTimelineQuickReadSummary(event);
      const actions = buildCardActions(event);

      if (compact) {
        return (
          <ContextualCard
            key={event.id}
            items={actions}
            className={[
              "rounded-2xl border px-3.5 py-3.5",
              isSelected ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-[#0f151d]",
            ].join(" ")}
          >
            <article
              id={event.id}
              tabIndex={-1}
              className="grid gap-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{quickRead.action}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{quickRead.description}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <TimelineField label="Invitado" value={quickRead.guestLine || "Sin invitado"} compact />
                <TimelineField
                  label="Contexto"
                  value={quickRead.reservationLine || quickRead.context || "Sin contexto"}
                  compact
                />
                <TimelineField
                  label="Operador"
                  value={quickRead.operatorLine || quickRead.actorLine || "Sin operador"}
                  compact
                />
                {quickRead.reason ? <TimelineField label="Motivo" value={quickRead.reason} compact /> : null}
              </div>

            </article>
          </ContextualCard>
        );
      }

      return (
        <ContextualCard
          key={event.id}
          items={actions}
            className={[
            "rounded-2xl border px-3.5 py-3.5",
            isSelected ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-[#0f151d]",
          ].join(" ")}
        >
          <article
            id={event.id}
            tabIndex={-1}
            className="grid gap-3.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
              <TimelineMark tone={event.tone} />
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80">
                <EventIcon icon={event.icon} />
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{quickRead.action}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{quickRead.description}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <TimelineField label="Invitado" value={quickRead.guestLine || "Sin invitado"} />
                <TimelineField
                  label="Contexto"
                  value={quickRead.reservationLine || quickRead.context || "Sin contexto"}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <TimelineField
                  label="Operador"
                  value={quickRead.operatorLine || quickRead.actorLine || "Sin operador"}
                />
                <div className="flex min-w-0 items-start md:items-end md:justify-end">
                  <StatusBadge variant="info">{formatTimelineDisplayTime(quickRead.timestamp)}</StatusBadge>
                </div>
              </div>

              {quickRead.reason ? <TimelineField label="Motivo" value={quickRead.reason} /> : null}

            </div>
          </article>
        </ContextualCard>
      );
    },
    [buildCardActions, selectedEvent?.id],
  );

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    const target = document.getElementById(selectedEvent.id);

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, [selectedEvent]);

  const moveSelection = useCallback((delta: number) => {
    if (!orderedEvents.length) {
      return;
    }

    setSelectedEventIndex((current) => {
      const next = current + delta;
      if (next < 0) {
        return 0;
      }

      if (next >= orderedEvents.length) {
        return orderedEvents.length - 1;
      }

      return next;
    });
  }, [orderedEvents.length]);

  const jumpSelection = useCallback((index: number) => {
    if (!orderedEvents.length) {
      return;
    }

    const next = Math.max(0, Math.min(index, orderedEvents.length - 1));
    setSelectedEventIndex(next);
  }, [orderedEvents.length]);

  const openSelectedEvent = useCallback(() => {
    if (!selectedEvent) {
      return;
    }

    if (selectedEvent.reservationId || selectedEvent.reservationCode || selectedEvent.reservationName) {
      router.push("/reservations");
      return;
    }

    if (selectedEvent.guestId || selectedEvent.guestName) {
      router.push("/customers");
      return;
    }

    if (selectedEvent.tableId || selectedEvent.tableName) {
      router.push("/tables");
      return;
    }

    router.push("/operations");
  }, [router, selectedEvent]);

  useKeyboardShortcuts(
    useMemo(
      () => [
        { id: "timeline-next", shortcut: "j", priority: 50, handler: () => moveSelection(1) },
        { id: "timeline-prev", shortcut: "k", priority: 50, handler: () => moveSelection(-1) },
        { id: "timeline-first", shortcut: "home", priority: 45, handler: () => jumpSelection(0) },
        { id: "timeline-last", shortcut: "end", priority: 45, handler: () => jumpSelection(orderedEvents.length - 1) },
        { id: "timeline-pageup", shortcut: "pageup", priority: 45, handler: () => moveSelection(-4) },
        { id: "timeline-pagedown", shortcut: "pagedown", priority: 45, handler: () => moveSelection(4) },
        { id: "timeline-open", shortcut: "enter", priority: 55, handler: openSelectedEvent },
      ],
      [jumpSelection, moveSelection, openSelectedEvent, orderedEvents.length],
    ),
  );

  if (!orderedEvents.length) {
    return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="kicker">
              Actividad reciente
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Cronología operativa</h2>
          </div>
          <StatusBadge variant="info">0</StatusBadge>
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-4">
          <p className="text-sm text-slate-400">No hay actividad reciente.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="kicker">
            Actividad reciente
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Cronología operativa</h2>
        </div>
        <StatusBadge variant="info">{events.length}</StatusBadge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.25fr)_minmax(0,1fr)] xl:items-start">
          <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/20 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="kicker">Operativo</p>
                <p className="mt-1 text-xs text-slate-500">Acciones que impactan el flujo del evento.</p>
              </div>
              <StatusBadge variant="warning">{groupedEvents.Operational.length}</StatusBadge>
            </div>

            {groupedEvents.Operational.length ? (
              <div className="space-y-3">
                {groupedEvents.Operational.slice(0, 4).map((event) => renderTimelineCard(event, false))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/10 p-3">
                <p className="text-sm text-slate-400">Sin eventos operativos por ahora.</p>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/20 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="kicker">Crítico</p>
                <p className="mt-1 text-xs text-slate-500">Bloqueos, errores y atenciones urgentes.</p>
              </div>
              <StatusBadge variant="danger">{groupedEvents.Critical.length}</StatusBadge>
            </div>

            {groupedEvents.Critical.length ? (
              <div className="space-y-3">
                {groupedEvents.Critical.slice(0, 4).map((event) => renderTimelineCard(event, true))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/10 p-3">
                <p className="text-sm text-slate-400">Sin eventos críticos por ahora.</p>
              </div>
            )}
          </section>
        </div>

        {(() => {
          const secondaryGroups = (["Informational", "System"] as const).filter((group) => groupedEvents[group].length > 0);

          return (
            <div className={getSecondaryTimelineSectionGridClass(secondaryGroups.length)}>
              {secondaryGroups.map((group) => {
              const groupEvents = groupedEvents[group];

              const description =
                group === "Informational"
                  ? "Cambios de contexto y actividad útil."
                  : "Eventos del sistema y sincronización.";
              const label = group === "Informational" ? "Informativo" : "Sistema";
              const badgeVariant = group === "Informational" ? "info" : "success";

              return (
                <section key={group} className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/20 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="kicker">{label}</p>
                      <p className="mt-1 text-xs text-slate-500">{description}</p>
                    </div>
                    <StatusBadge variant={badgeVariant}>{groupEvents.length}</StatusBadge>
                  </div>

                  <div className="space-y-3">
                    {groupEvents.slice(0, 4).map((event) => renderTimelineCard(event, true))}
                  </div>
                </section>
              );
            })}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
