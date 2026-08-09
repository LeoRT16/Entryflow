"use client";

import { useState } from "react";

import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { useFeedback } from "@/components/premium-feedback";
import { getEventTypeLabel } from "@/features/events/domain";
import { useCheckInStore } from "@/services/workspace-service";

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}

export default function SettingsPage() {
  const { status, error, currentOrganization, currentEvent, organizations, events } = useCheckInStore();

  if (status === "loading") {
    return <PanelShell title="Cargando ajustes" description="Estamos preparando la configuración del workspace." />;
  }

  if (status === "error") {
    return (
      <PanelShell
        title="No pudimos cargar ajustes"
        description={error?.message ?? "Revisá la conexión con Supabase."}
        actionLabel="Reintentar"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (!organizations.length || !events.length) {
    return (
      <PanelShell
        title="Ajustes sin datos"
        description="Creá una organización y un evento para empezar a configurar la beta."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Settings"
        title="Configuración operativa"
        description="Ajustá la organización y el evento activo desde una sola pantalla."
        primaryAction={{ label: "Ir al dashboard", href: "/" }}
        secondaryAction={{ label: "Ver eventos", href: "/events" }}
      />

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <OrganizationSettingsCard key={currentOrganization.id} />
        <EventSettingsCard key={currentEvent.id} />
      </section>
    </div>
  );
}

function OrganizationSettingsCard() {
  const { showToast } = useFeedback();
  const { currentOrganization, organizations, repositories, setOrganizationsState, setCurrentOrganizationId } = useCheckInStore();
  const [organizationName, setOrganizationName] = useState(currentOrganization.name);
  const [organizationSlug, setOrganizationSlug] = useState(currentOrganization.slug);
  const [organizationTimezone, setOrganizationTimezone] = useState(currentOrganization.timezone);

  const saveOrganization = async () => {
    const nextOrganization = {
      ...currentOrganization,
      name: organizationName.trim() || currentOrganization.name,
      slug: organizationSlug.trim() || currentOrganization.slug,
      timezone: organizationTimezone.trim() || currentOrganization.timezone,
    };

    await repositories.organizations.upsert(nextOrganization);
    setOrganizationsState((current) => current.map((item) => (item.id === nextOrganization.id ? nextOrganization : item)));
    setCurrentOrganizationId(nextOrganization.id);
    showToast({
      title: "Organización actualizada",
      description: `${nextOrganization.name} quedó sincronizada con Supabase.`,
      tone: "success",
    });
  };

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Organización</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{currentOrganization.name}</h2>
        </div>
        <StatusBadge variant="info">{currentOrganization.status}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-4">
        <Input label="Nombre" value={organizationName} onChange={setOrganizationName} placeholder="Nombre de la organización" />
        <Input label="Slug" value={organizationSlug} onChange={setOrganizationSlug} placeholder="mi-organizacion" />
        <Input label="Timezone" value={organizationTimezone} onChange={setOrganizationTimezone} placeholder="America/La_Paz" />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveOrganization}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          Guardar organización
        </button>
        <button
          type="button"
          onClick={() => setCurrentOrganizationId(currentOrganization.id)}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
        >
          Mantener activa
        </button>
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-500">
        {organizations.length} organizaciones conectadas
      </p>
    </div>
  );
}

function EventSettingsCard() {
  const { showToast } = useFeedback();
  const { currentEvent, events, repositories, setEventsState, setCurrentEventId } = useCheckInStore();
  const [eventName, setEventName] = useState(currentEvent.name);
  const [eventVenue, setEventVenue] = useState(currentEvent.venue);
  const [eventDescription, setEventDescription] = useState(currentEvent.description ?? "");
  const [eventCapacity, setEventCapacity] = useState(String(currentEvent.capacity));
  const [eventStartAt, setEventStartAt] = useState(currentEvent.startAt);
  const [eventStatus, setEventStatus] = useState(currentEvent.status);

  const saveEvent = async () => {
    const nextEvent = {
      ...currentEvent,
      name: eventName.trim() || currentEvent.name,
      venue: eventVenue.trim() || currentEvent.venue,
      description: eventDescription.trim() || undefined,
      capacity: Number.parseInt(eventCapacity, 10) || currentEvent.capacity,
      startAt: eventStartAt,
      status: eventStatus,
    };

    await repositories.events.upsert(nextEvent);
    setEventsState((current) => current.map((item) => (item.id === nextEvent.id ? nextEvent : item)));
    setCurrentEventId(nextEvent.id);
    showToast({
      title: "Evento actualizado",
      description: `${nextEvent.name} quedó listo con su configuración operativa.`,
      tone: "success",
    });
  };

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Evento activo</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{currentEvent.name}</h2>
        </div>
        <StatusBadge variant="success">{getEventTypeLabel(currentEvent.eventType)}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" value={eventName} onChange={setEventName} placeholder="Evento principal" />
        <Input label="Ubicación" value={eventVenue} onChange={setEventVenue} placeholder="Sala, club o venue" />
        <Input label="Fecha de inicio" value={eventStartAt} onChange={setEventStartAt} type="datetime-local" />
        <Input label="Capacidad" value={eventCapacity} onChange={setEventCapacity} placeholder="800" type="number" />
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-slate-200">Descripción</span>
        <textarea
          value={eventDescription}
          onChange={(event) => setEventDescription(event.target.value)}
          placeholder="Contexto operativo del evento"
          className="mt-2 min-h-28 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Estado</span>
          <select
            value={eventStatus}
            onChange={(event) => setEventStatus(event.target.value as typeof eventStatus)}
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
          >
            {[
              ["draft", "Borrador"],
              ["published", "Publicado"],
              ["live", "En curso"],
              ["finished", "Finalizado"],
              ["cancelled", "Cancelado"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Eventos de la organización</p>
          <p className="mt-2 text-sm text-slate-300">{events.filter((event) => event.organizationId === currentEvent.organizationId).length} eventos conectados</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveEvent}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          Guardar evento
        </button>
        <button
          type="button"
          onClick={() => setCurrentEventId(currentEvent.id)}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
        >
          Mantener activo
        </button>
      </div>
    </div>
  );
}

function PanelShell({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="space-y-6">
      <Topbar eyebrow="Settings" title={title} description={description} />
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm text-slate-300">{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </div>
  );
}
