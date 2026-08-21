"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { hasPermission } from "@/features/accounts/domain/accounts-domain";
import type { OrganizationAccount } from "@/features/accounts/types";
import { getEventTypeLabel } from "@/features/events/domain";
import type { EventType } from "@/features/domain/types";
import { useCheckInStore } from "@/services/workspace-service";

function formatEventStatusLabel(status: string) {
  if (status === "live") return "En curso";
  if (status === "published") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "finished") return "Finalizado";
  return "Cancelado";
}

export function getEventSwitcherStatusTone(status: string) {
  if (status === "live") return "success";
  if (status === "published") return "info";
  if (status === "draft") return "warning";
  return "danger";
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

export function canSwitchEventContext(account: Pick<OrganizationAccount, "permissions" | "rolePermissions">) {
  return hasPermission(account, "event.view");
}

export type EventSwitcherSection = {
  title: string;
  events: Array<{
    id: string;
    name: string;
    eventType: EventType;
    status: string;
    venue: string;
    startAt: string;
  }>;
};

export function buildEventSwitcherSections(
  events: Array<{
    id: string;
    organizationId: string;
    name: string;
    eventType: EventType;
    status: string;
    venue: string;
    startAt: string;
  }>,
  currentOrganizationId: string,
  query = "",
): EventSwitcherSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const scopedEvents = events.filter((event) => event.organizationId === currentOrganizationId);
  const filteredEvents = scopedEvents.filter((event) => {
    if (!normalizedQuery) {
      return true;
    }

    return [
      event.name,
      event.venue,
      event.startAt,
      getEventTypeLabel(event.eventType),
      formatEventStatusLabel(event.status),
    ].some((field) => matchesQuery(field, normalizedQuery));
  });

  return [
    {
      title: "Eventos en curso",
      events: filteredEvents.filter((event) => event.status === "live"),
    },
    {
      title: "Próximos eventos",
      events: filteredEvents.filter((event) => event.status === "published" || event.status === "draft"),
    },
    {
      title: "Historial",
      events: filteredEvents.filter((event) => event.status === "finished" || event.status === "cancelled"),
    },
  ].filter((section) => section.events.length > 0 || normalizedQuery.length > 0);
}

export function getEventSwitcherSectionEmptyMessage(title: EventSwitcherSection["title"], query: string) {
  if (query.trim()) {
    return `No encontramos eventos para “${query.trim()}”.`;
  }

  if (title === "Eventos en curso") {
    return "No hay eventos en curso disponibles.";
  }

  if (title === "Próximos eventos") {
    return "No hay próximos eventos.";
  }

  return "No hay eventos históricos.";
}

export function getEventSwitcherEmptyPanelMessage(query: string) {
  if (query.trim()) {
    return `No encontramos eventos para “${query.trim()}”.`;
  }

  return "No hay eventos en esta organización.";
}

export function buildEventSwitcherButtonModel({
  currentOrganizationName,
  currentEvent,
  compact = false,
}: {
  currentOrganizationName: string;
  currentEvent: {
    name: string;
    eventType: EventType;
    status: string;
    venue: string;
  };
  compact?: boolean;
}) {
  return {
    eyebrow: currentOrganizationName,
    title: currentEvent.name,
    description: compact ? getEventTypeLabel(currentEvent.eventType) : `${getEventTypeLabel(currentEvent.eventType)} · ${currentEvent.venue}`,
    statusLabel: formatEventStatusLabel(currentEvent.status),
    statusTone: getEventSwitcherStatusTone(currentEvent.status),
  };
}

export default function EventSwitcher({ compact = false }: { compact?: boolean } = {}) {
  const { currentOrganization, currentEvent, events, setCurrentEventId } = useCheckInStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const sections = useMemo(
    () => buildEventSwitcherSections(events, currentOrganization.id, query),
    [currentOrganization.id, events, query],
  );
  const isEmpty = sections.length === 0;
  const triggerModel = useMemo(
    () =>
      buildEventSwitcherButtonModel({
        currentOrganizationName: currentOrganization.name,
        currentEvent: {
          name: currentEvent.name,
          eventType: currentEvent.eventType,
          status: currentEvent.status,
          venue: currentEvent.venue,
        },
        compact,
      }),
    [compact, currentEvent.eventType, currentEvent.name, currentEvent.status, currentEvent.venue, currentOrganization.name],
  );

  const buttonClasses = compact
    ? "w-full px-4 py-3"
    : "min-w-[14rem] max-w-[20rem] px-4 py-3";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={[
          "surface-interactive inline-flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
          buttonClasses,
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Cambiar evento: ${triggerModel.eyebrow}, ${triggerModel.title}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {triggerModel.eyebrow}
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-white">{triggerModel.title}</span>
          <span className="mt-1 block truncate text-xs text-slate-500">{triggerModel.description}</span>
        </span>

        <span
          className={[
            "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
            triggerModel.statusTone === "success"
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
              : triggerModel.statusTone === "warning"
                ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                : triggerModel.statusTone === "danger"
                  ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
                  : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
          ].join(" ")}
        >
          {triggerModel.statusLabel}
        </span>
      </button>

      {open ? (
        <div
          className={[
            "absolute top-[calc(100%+0.75rem)] z-50 overflow-hidden surface-panel bg-[#08111f]",
            compact ? "left-0 right-0" : "right-0 w-[min(90vw,34rem)]",
          ].join(" ")}
        >
          <div className="border-b border-white/10 p-4">
            <p className="kicker">
              Cambiar evento
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-white">
              {currentOrganization.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {currentEvent.name} · {getEventTypeLabel(currentEvent.eventType)}
            </p>

            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              data-shortcut-search="true"
              placeholder="Buscar evento por nombre, tipo o venue"
              className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
            />
          </div>

          <div className="max-h-[min(60vh,32rem)] space-y-4 overflow-y-auto p-4">
            {isEmpty ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400">
                {getEventSwitcherEmptyPanelMessage(query)}
              </div>
            ) : (
              sections.map((section) => (
                <EventSection
                  key={section.title}
                  title={section.title}
                  events={section.events}
                  currentEventId={currentEvent.id}
                  query={query}
                  onSelect={(eventId) => {
                    setCurrentEventId(eventId);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
            <Link
              href="/events"
              onClick={() => setOpen(false)}
              className="surface-interactive inline-flex h-10 items-center justify-center px-3 text-sm font-medium text-white"
            >
              Ver todos los eventos
            </Link>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-slate-400 transition hover:text-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EventSection({
  title,
  events,
  currentEventId,
  query,
  onSelect,
}: {
  title: string;
  events: Array<{
    id: string;
    name: string;
    eventType: EventType;
    status: string;
    venue: string;
    startAt: string;
  }>;
  currentEventId: string;
  query: string;
  onSelect: (eventId: string) => void;
}) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-500">
        {getEventSwitcherSectionEmptyMessage(title, query)}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">{title}</p>
      <div className="space-y-2">
        {events.map((event) => {
          const isCurrent = event.id === currentEventId;

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event.id)}
              aria-current={isCurrent ? "true" : undefined}
              aria-pressed={isCurrent}
              className={[
                "w-full rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                isCurrent
                  ? "border-cyan-400/40 bg-cyan-400/10 shadow-[inset_0_1px_0_rgba(103,232,249,0.12)]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{event.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {getEventTypeLabel(event.eventType)} · {event.venue}
                  </p>
                  {isCurrent ? (
                    <span className="mt-2 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                      Actual
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>{formatEventStatusLabel(event.status)}</span>
                  <span>{event.startAt}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
