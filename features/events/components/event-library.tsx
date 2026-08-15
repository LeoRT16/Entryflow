"use client";

import { useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import type { Event, ResourceType } from "@/features/domain/types";
import { getEventTypeLabel, getOperationalModelLabel, isTerminalEventStatus } from "@/features/events/domain";
import EventEditorModal from "@/features/events/components/event-editor-modal";
import EventCreationWizard from "@/features/events/components/event-creation-wizard";
import { useCheckInStore } from "@/services/workspace-service";

type EventStatusGroup = "live" | "upcoming" | "finished";

type EventAction = {
  label: string;
  tone: "success" | "warning" | "info";
  onClick: () => void;
};

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  table: "Mesas",
  lounge: "Lounges",
  box: "Boxes",
  seat: "Asientos",
  zone: "Zonas",
  booth: "Stands",
  room: "Salas",
  gate: "Puertas",
  area: "Áreas",
};

function formatEventStatusLabel(status: Event["status"]) {
  if (status === "live") return "En curso";
  if (status === "published") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "finished") return "Finalizado";
  return "Cancelado";
}

function getEventStatusTone(status: Event["status"]) {
  if (status === "live") return "success" as const;
  if (status === "published") return "info" as const;
  if (status === "draft") return "warning" as const;
  return "warning" as const;
}

function getResourceTypeLabel(resourceType: ResourceType) {
  return RESOURCE_TYPE_LABELS[resourceType] ?? resourceType;
}

function formatResourceTypes(resourceTypes: Event["resourceTypes"]) {
  return resourceTypes.map(getResourceTypeLabel).join(" · ");
}

export default function EventLibrary() {
  const {
    events,
    currentEventId,
    currentEvent,
    currentOrganization,
    createEvent,
    setCurrentEventId,
    setEventStatus,
    venues,
  } = useCheckInStore();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardOrganizationId, setWizardOrganizationId] = useState(currentOrganization.id);
  const [editorOpen, setEditorOpen] = useState(false);

  const groupedEvents = useMemo(() => {
    const groups: Record<EventStatusGroup, Event[]> = {
      live: [],
      upcoming: [],
      finished: [],
    };

    events.forEach((event) => {
      if (event.status === "live") {
        groups.live.push(event);
        return;
      }

      if (event.status === "finished" || event.status === "cancelled") {
        groups.finished.push(event);
        return;
      }

      groups.upcoming.push(event);
    });

    return groups;
  }, [events]);

  const visibleSections = useMemo(
    () =>
      [
        {
          key: "live",
          title: "Activos",
          accent: "success" as const,
          events: groupedEvents.live,
        },
        {
          key: "upcoming",
          title: "Próximos",
          accent: "info" as const,
          events: groupedEvents.upcoming,
        },
        {
          key: "finished",
          title: "Finalizados",
          accent: "warning" as const,
          events: groupedEvents.finished,
        },
      ].filter((section) => section.events.length > 0),
    [groupedEvents],
  );

  const openEventWizard = (organizationId: string = currentOrganization.id) => {
    setWizardOrganizationId(organizationId);
    setWizardOpen(true);
  };

  const openEventEditor = () => {
    setEditorOpen(true);
  };

  const currentEventAction: EventAction | null =
    isTerminalEventStatus(currentEvent.status)
      ? null
      : currentEvent.status === "draft"
        ? {
            label: "Publicar evento",
            tone: "info",
            onClick: () => setEventStatus(currentEvent.id, "published"),
          }
        : {
            label: "Cerrar evento",
            tone: "warning",
            onClick: () => setEventStatus(currentEvent.id, "finished"),
          };

  return (
    <div className="mx-auto w-full max-w-[1140px] space-y-5 px-4 sm:px-6 lg:px-0">
      <header className="surface-panel flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="kicker">Eventos</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem]">Eventos</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
              Crea y administra los eventos de tu organización.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openEventWizard(currentOrganization.id)}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            + Crear evento
          </button>
        </div>
      </header>

      <section className="space-y-5">
        {visibleSections.length ? (
          visibleSections.map((section) => (
            <LibrarySection
              key={section.key}
              title={section.title}
              events={section.events}
              accent={section.accent}
              currentEventId={currentEventId}
              currentEventAction={currentEventAction}
              onSelectEvent={setCurrentEventId}
              onEditCurrentEvent={openEventEditor}
            />
          ))
        ) : (
          <section className="surface-panel p-4 sm:p-5">
            <p className="text-sm text-slate-400">No hay eventos para mostrar.</p>
          </section>
        )}
      </section>

      {wizardOpen ? (
        <EventCreationWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreate={createEvent}
          organizationId={wizardOrganizationId}
          organizationTimezone={currentOrganization.timezone}
          venues={venues}
        />
      ) : null}

      {editorOpen ? (
        <EventEditorModal
          key={currentEvent.id}
          open={editorOpen}
          event={currentEvent}
          venues={venues}
          onClose={() => setEditorOpen(false)}
          onSave={createEvent}
        />
      ) : null}
    </div>
  );
}

function LibrarySection({
  title,
  events,
  accent,
  currentEventId,
  currentEventAction,
  onSelectEvent,
  onEditCurrentEvent,
}: {
  title: string;
  events: Event[];
  accent: "success" | "info" | "warning";
  currentEventId: string;
  currentEventAction: EventAction | null;
  onSelectEvent: (eventId: string) => void;
  onEditCurrentEvent: () => void;
}) {
  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">{title}</p>
        </div>
        <StatusBadge variant={accent}>{events.length}</StatusBadge>
      </div>

      <div className="mt-3 space-y-2.5">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            current={event.id === currentEventId}
            currentEventAction={event.id === currentEventId ? currentEventAction : null}
            onSelect={() => onSelectEvent(event.id)}
            onEditCurrentEvent={onEditCurrentEvent}
          />
        ))}
      </div>
    </section>
  );
}

function EventCard({
  event,
  current,
  currentEventAction,
  onSelect,
  onEditCurrentEvent,
}: {
  event: Event;
  current: boolean;
  currentEventAction: EventAction | null;
  onSelect: () => void;
  onEditCurrentEvent: () => void;
}) {
  const resourceLabel = event.resourceTypes.length ? formatResourceTypes(event.resourceTypes.slice(0, 3)) : "";

  return (
    <article
      className={`surface-elevated flex h-full flex-col gap-3 p-3 sm:p-4 transition ${
        current
          ? "border-cyan-400/50 bg-cyan-400/8 shadow-[0_0_0_1px_rgba(34,211,238,0.14)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={getEventStatusTone(event.status)}>{formatEventStatusLabel(event.status)}</StatusBadge>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">
              {getEventTypeLabel(event.eventType)}
            </span>
          </div>

          <h3 className="break-words text-[1.05rem] font-semibold tracking-tight text-white sm:text-lg">{event.name}</h3>

          {event.description ? <p className="break-words text-sm leading-6 text-slate-400">{event.description}</p> : null}
        </div>

        {current ? <StatusBadge variant="info">En uso</StatusBadge> : null}
      </div>

      <div className="space-y-1.5 text-sm leading-6 text-slate-300">
        <p className="min-w-0 break-words">
          <span className="text-slate-500">Modelo</span> {getOperationalModelLabel(event.operationalModel)} · {event.capacity} personas · {event.venue}
        </p>
        {resourceLabel ? (
          <p className="min-w-0 break-words">
            <span className="text-slate-500">Recursos</span> {resourceLabel}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {current ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onEditCurrentEvent}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              Editar evento
            </button>
            {currentEventAction ? (
              <button
                type="button"
                onClick={currentEventAction.onClick}
                className={[
                  "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                  currentEventAction.tone === "warning"
                    ? "border-amber-400/25 bg-amber-400/10 text-amber-50 hover:bg-amber-400/15"
                    : currentEventAction.tone === "success"
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
                      : "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15",
                ].join(" ")}
              >
                {currentEventAction.label}
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            Seleccionar evento
          </button>
        )}
      </div>
    </article>
  );
}
