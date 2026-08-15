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
      >
        {!compact ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
            {currentOrganization.name.slice(0, 2)}
          </span>
        ) : null}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {compact ? "Evento activo" : currentOrganization.name}
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-white">
            {currentEvent.name}
          </span>
          {!compact ? (
            <span className="mt-1 block truncate text-xs text-slate-500">
              {getEventTypeLabel(currentEvent.eventType)} · {currentEvent.venue}
            </span>
          ) : null}
        </span>

        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
          {formatEventStatusLabel(currentEvent.status)}
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
            {sections.map((section) => (
              <EventSection
                key={section.title}
                title={section.title}
                events={section.events}
                currentEventId={currentEvent.id}
                onSelect={(eventId) => {
                  setCurrentEventId(eventId);
                  setOpen(false);
                }}
              />
            ))}
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
  onSelect: (eventId: string) => void;
}) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-500">
        {title === "Eventos en curso" ? "No hay eventos en curso disponibles." : title === "Próximos eventos" ? "No hay próximos eventos." : "No hay eventos históricos."}
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
              className={[
                "w-full rounded-2xl border px-4 py-3 text-left transition",
                isCurrent
                  ? "border-cyan-400/40 bg-cyan-400/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{event.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {getEventTypeLabel(event.eventType)} · {event.venue}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>{formatEventStatusLabel(event.status)}</span>
                  <span>{event.startAt}</span>
                </div>
              </div>
              {isCurrent ? (
                <span className="mt-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                  Actual
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
