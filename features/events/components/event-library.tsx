"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import type { Event } from "@/features/domain/types";
import {
  getEnabledModules,
  getEventBlueprint,
  getEventModuleLabel,
  getEventNavigation,
  getEventTypeLabel,
  getOperationalModelLabel,
  isTerminalEventStatus,
} from "@/features/events/domain";
import { useCheckInStore } from "@/services/workspace-service";
import EventCreationWizard from "@/features/events/components/event-creation-wizard";
import OrganizationCreationModal from "@/features/events/components/organization-creation-modal";

type EventStatusGroup = "live" | "upcoming" | "finished";

export default function EventLibrary() {
  const {
    events,
    organizations,
    venues,
    currentEventId,
    currentEvent,
    currentOrganization,
    setCurrentOrganizationId,
    createEvent,
    createOrganization,
    setEventStatus,
  } = useCheckInStore();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [wizardOrganizationId, setWizardOrganizationId] = useState(currentOrganization.id);

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

  const currentNavigation = currentEvent ? getEventNavigation(currentEvent) : [];
  const counts = useMemo(
    () => ({
      active: events.filter((event) => event.status === "live").length,
      upcoming: events.filter((event) => event.status === "published" || event.status === "draft").length,
      finished: events.filter((event) => event.status === "finished" || event.status === "cancelled").length,
    }),
    [events],
  );

  const openEventWizard = (organizationId: string = currentOrganization.id) => {
    setWizardOrganizationId(organizationId);
    setWizardOpen(true);
  };

  const handleCreateOrganization = async (nextOrganization: Parameters<typeof createOrganization>[0]) => {
    await createOrganization(nextOrganization);
    setWizardOrganizationId(nextOrganization.id);
    setOrganizationOpen(false);
    setWizardOpen(true);
    return nextOrganization;
  };

  const currentEventAction =
    isTerminalEventStatus(currentEvent.status)
      ? null
      : currentEvent.status === "draft"
      ? {
          label: "Publicar evento",
          tone: "info" as const,
          onClick: () => setEventStatus(currentEvent.id, "published"),
        }
      : {
            label: "Cerrar evento",
            tone: "warning" as const,
            onClick: () => setEventStatus(currentEvent.id, "finished"),
          };

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Eventos"
        title="Biblioteca de eventos"
        description="La plataforma permite preparar conciertos, conferencias, teatros y eventos privados con contratos distintos sin salir del espacio de trabajo."
        primaryAction={{ label: "Ir a operaciones", href: "/operations" }}
        secondaryAction={{ label: "Centro de operaciones", href: "/" }}
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge variant="info">Organización: {currentOrganization.name}</StatusBadge>
            <StatusBadge variant="success">Evento actual: {currentEvent?.name ?? "Sin evento"}</StatusBadge>
            <StatusBadge variant="warning">{counts.upcoming} próximos</StatusBadge>
            <StatusBadge variant="danger">{counts.finished} finalizados</StatusBadge>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Crea y explora distintos tipos de evento.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              El asistente genera eventos con plantillas oficiales, módulos sugeridos, métodos de admisión y navegación conceptual para cada formato.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Activos" value={counts.active} tone="success" />
            <Metric label="Próximos" value={counts.upcoming} tone="info" />
            <Metric label="Finalizados" value={counts.finished} tone="warning" />
            <Metric label="Totales" value={events.length} tone="danger" />
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Contexto actual
              </p>
              <p className="mt-2 text-sm text-slate-400">
                La plataforma sigue operando sobre el mismo evento activo de siempre.
              </p>
            </div>
            <StatusBadge variant="info">Evento actual</StatusBadge>
          </div>

          <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Organización
                </p>
                <p className="mt-2 text-sm text-slate-400">Crea o cambia el espacio operativo antes de abrir el asistente.</p>
              </div>
              <button
                type="button"
                onClick={() => setOrganizationOpen(true)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Nueva organización
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {organizations.map((organization) => {
                const selected = organization.id === currentOrganization.id;

                return (
                  <button
                    key={organization.id}
                    type="button"
                    onClick={() => setCurrentOrganizationId(organization.id)}
                    className={[
                      "rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] transition",
                      selected
                        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
                    ].join(" ")}
                  >
                    {organization.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Evento actual</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {currentEvent?.name}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge variant="success">{currentEvent ? getEventTypeLabel(currentEvent.eventType) : "Sin tipo"}</StatusBadge>
              <StatusBadge variant="info">{currentEvent ? currentEvent.venue : "Sin ubicación"}</StatusBadge>
              <StatusBadge variant="warning">{currentEvent ? currentEvent.capacity : 0} cupos</StatusBadge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <MiniStat label="Modelo" value={currentEvent ? getOperationalModelLabel(currentEvent.operationalModel) : "-"} />
              <MiniStat label="Módulos" value={currentEvent ? `${getEnabledModules(currentEvent).length}` : "0"} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEventWizard(currentOrganization.id)}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Crear evento
              </button>
              {currentEventAction ? (
                <button
                  type="button"
                  onClick={currentEventAction.onClick}
                  className={[
                    "inline-flex h-11 items-center justify-center rounded-xl border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                    currentEventAction.tone === "warning"
                      ? "border-amber-400/25 bg-amber-400/10 text-amber-50 hover:bg-amber-400/15"
                      : "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15",
                  ].join(" ")}
                >
                  {currentEventAction.label}
                </button>
              ) : null}
              <Link
                href="/timeline"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                Ver actividad
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <LibrarySection
          title="Eventos activos"
          description="Operando ahora mismo en la plataforma conectada al espacio de trabajo activo."
          events={groupedEvents.live}
          accent="success"
          currentEventId={currentEventId}
        />
        <LibrarySection
          title="Próximos"
          description="Eventos publicados o en borrador que todavía no están activos."
          events={groupedEvents.upcoming}
          accent="info"
          currentEventId={currentEventId}
        />
        <LibrarySection
          title="Finalizados"
          description="Eventos ya cerrados para revisión y análisis."
          events={groupedEvents.finished}
          accent="warning"
          currentEventId={currentEventId}
        />
      </section>

      {currentEvent ? (
        <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Preview del evento actual</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{currentEvent.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">{currentEvent.description}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MiniStat label="Tipo" value={getEventTypeLabel(currentEvent.eventType)} />
              <MiniStat label="Estado" value={formatEventStatusLabel(currentEvent.status)} />
              <MiniStat label="Capacidad" value={`${currentEvent.capacity}`} />
              <MiniStat label="Ubicación" value={currentEvent.venue} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {getEnabledModules(currentEvent).map((module) => (
                <span
                  key={module}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-300"
                >
                  {getEventModuleLabel(module)}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Navegación conceptual</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Cómo se vería este evento</h2>

            <div className="mt-4 space-y-4">
              {currentNavigation.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{group.title}</p>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <div
                        key={`${group.title}-${item.module}`}
                        className={`rounded-2xl border px-3 py-3 ${
                          item.enabled
                            ? "border-white/10 bg-white/[0.04]"
                            : item.future
                              ? "border-white/5 bg-black/20 opacity-70"
                              : "border-white/5 bg-black/10 opacity-55"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{item.label}</p>
                            <p className="text-xs text-slate-400">{item.description}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            <span>{item.required ? "Esencial" : item.future ? "Próximamente" : "Opcional"}</span>
                            <span>{item.route ?? "Sin ruta legacy"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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

      {organizationOpen ? (
        <OrganizationCreationModal
          open={organizationOpen}
          onClose={() => setOrganizationOpen(false)}
          onCreate={handleCreateOrganization}
          templateOrganization={currentOrganization}
        />
      ) : null}
    </div>
  );
}

function LibrarySection({
  title,
  description,
  events,
  accent,
  currentEventId,
}: {
  title: string;
  description: string;
  events: Event[];
  accent: "success" | "info" | "warning";
  currentEventId: string;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{title}</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{description}</h3>
        </div>
        <StatusBadge variant={accent}>{events.length}</StatusBadge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {events.length ? (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              current={event.id === currentEventId}
            />
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 p-5 text-sm text-slate-500 lg:col-span-2 xl:col-span-3">
            No hay eventos en esta sección todavía.
          </div>
        )}
      </div>
    </section>
  );
}

function EventCard({ event, current }: { event: Event; current: boolean }) {
  const blueprint = getEventBlueprint(event.eventType);
  const previewModules = getEnabledModules(event).slice(0, 4);
  const previewResources = event.resourceTypes.slice(0, 3);
  const navigation = getEventNavigation(event);

  return (
    <article
      className={`flex h-full flex-col rounded-[1.5rem] border p-4 transition ${
        current
          ? "border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.16)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            {current ? "Evento actual" : formatEventStatusLabel(event.status)}
          </p>
          <h4 className="mt-2 text-xl font-semibold text-white">{event.name}</h4>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${toneClassForEvent(event.status)}`}>
          {getEventTypeLabel(event.eventType)}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-400">{event.description}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MiniStat label="Modelo" value={getOperationalModelLabel(event.operationalModel)} />
        <MiniStat label="Capacidad" value={`${event.capacity}`} />
        <MiniStat label="Ubicación" value={event.venue} />
        <MiniStat label="Módulos" value={`${event.enabledModules.length}`} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {previewModules.map((module) => (
          <span key={module} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-300">
            {getEventModuleLabel(module)}
          </span>
        ))}
        {event.enabledModules.length > previewModules.length ? (
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
            +{event.enabledModules.length - previewModules.length}
          </span>
        ) : null}
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/15 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Recursos sugeridos</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {previewResources.length ? (
            previewResources.map((resourceType) => (
              <span key={resourceType} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-300">
                {resourceType}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">Sin recursos sugeridos.</span>
          )}
        </div>
        {!event.enabledModules.includes("resources") ? (
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Este preset no depende de Tables. Los recursos solo se sugieren para configuración futura.
          </p>
        ) : null}
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Navegación</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {navigation[0]?.items.slice(0, 4).map((item) => (
            <span
              key={item.module}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] ${
                item.enabled
                  ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-black/20 text-slate-500"
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {current ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100">
          <span className="h-2 w-2 rounded-full bg-cyan-300" />
          En uso en la sesión actual
        </div>
      ) : null}

      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
        {blueprint.icon} · plantilla {blueprint.eventType}
      </div>
    </article>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "success" | "info" | "warning" | "danger" }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-3xl font-semibold tracking-tight text-white">{value}</span>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${metricToneClass[tone]}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

const metricToneClass = {
  success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
  warning: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  danger: "border-rose-400/20 bg-rose-400/10 text-rose-100",
} as const;

function toneClassForEvent(status: Event["status"]) {
  if (status === "live") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (status === "published" || status === "draft") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  return "border-amber-400/20 bg-amber-400/10 text-amber-100";
}

function formatEventStatusLabel(status: Event["status"]) {
  if (status === "live") return "En curso";
  if (status === "published") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "finished") return "Finalizado";
  return "Cancelado";
}
