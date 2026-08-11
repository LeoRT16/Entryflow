"use client";

import { useMemo, useState } from "react";

import TimezoneSelect from "@/components/timezone-select";
import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { useFeedback } from "@/components/premium-feedback";
import PermissionGuard from "@/components/permission-guard";
import { getEventTypeLabel } from "@/features/events/domain";
import AccountsSettingsCard from "@/features/accounts/components/accounts-settings-card";
import { useCheckInStore } from "@/services/workspace-service";
import type { Venue } from "@/features/domain/types";
import { buildSlugFromName } from "@/lib/slug";
import { formatTimezoneLabel, getDefaultTimezone } from "@/lib/timezone";

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
    return <PanelShell title="Cargando ajustes" description="Estamos preparando la configuración de la cuenta." />;
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
        eyebrow="Ajustes"
        title="Configuración operativa"
        description="Ajustá la organización, el evento activo y el espacio físico desde una sola pantalla."
        primaryAction={{ label: "Ir al dashboard", href: "/" }}
        secondaryAction={{ label: "Ver eventos", href: "/events" }}
      />

      <PermissionGuard permission="settings.view">
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <OrganizationSettingsCard key={currentOrganization.id} />
          <EventSettingsCard key={currentEvent.id} />
        </section>

        <VenueSettingsCard key={`${currentOrganization.id}-${currentEvent.id}`} />

        <AccountsSettingsCard />
      </PermissionGuard>
    </div>
  );
}

function OrganizationSettingsCard() {
  const { showToast } = useFeedback();
  const { currentOrganization, organizations, createOrganization, setCurrentOrganizationId } = useCheckInStore();
  const [organizationName, setOrganizationName] = useState(currentOrganization.name);
  const [organizationTimezone, setOrganizationTimezone] = useState(() => getDefaultTimezone(currentOrganization.timezone));
  const [isSaving, setIsSaving] = useState(false);

  const saveOrganization = async () => {
    setIsSaving(true);
    const nextOrganization = {
      ...currentOrganization,
      name: organizationName.trim() || currentOrganization.name,
      slug: currentOrganization.slug || buildSlugFromName(organizationName),
      timezone: organizationTimezone.trim() || currentOrganization.timezone,
    };

    try {
      await createOrganization(nextOrganization);
      setCurrentOrganizationId(nextOrganization.id);
      showToast({
        title: "Organización actualizada",
        description: `${nextOrganization.name} quedó sincronizada con Supabase.`,
        tone: "success",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Organización</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{currentOrganization.name}</h2>
          <p className="mt-2 text-sm text-slate-400">
            Se usa {formatTimezoneLabel(organizationTimezone)} como referencia horaria.
          </p>
        </div>
        <StatusBadge variant="info">{currentOrganization.status}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-4">
        <Input label="Nombre" value={organizationName} onChange={setOrganizationName} placeholder="Nombre de la organización" />
        <TimezoneSelect
          label="Zona horaria"
          value={organizationTimezone}
          onChange={setOrganizationTimezone}
          preferredTimezone={currentOrganization.timezone}
          helperText="Se detecta automáticamente en tu equipo y puedes ajustarla si hace falta."
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveOrganization}
          disabled={isSaving}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          {isSaving ? "Guardando..." : "Guardar organización"}
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
  const { currentEvent, events, currentOrganization, createEvent, setCurrentEventId, venues } = useCheckInStore();
  const venueOptions = useMemo(
    () => venues.filter((venue) => venue.organizationId === currentOrganization.id),
    [currentOrganization.id, venues],
  );
  const defaultVenue = useMemo(() => venueOptions.find((venue) => venue.status === "active") ?? venueOptions[0] ?? null, [venueOptions]);
  const matchedVenue = useMemo(
    () => venueOptions.find((venue) => venue.id === currentEvent.venueId) ?? venueOptions.find((venue) => venue.name === currentEvent.venue),
    [currentEvent.venue, currentEvent.venueId, venueOptions],
  );
  const [eventVenueId, setEventVenueId] = useState(currentEvent.venueId ?? matchedVenue?.id ?? defaultVenue?.id ?? "");
  const [eventName, setEventName] = useState(currentEvent.name);
  const [eventVenue, setEventVenue] = useState(currentEvent.venue);
  const [eventDescription, setEventDescription] = useState(currentEvent.description ?? "");
  const [eventCapacity, setEventCapacity] = useState(String(currentEvent.capacity));
  const [eventStartAt, setEventStartAt] = useState(currentEvent.startAt);
  const [eventStatus, setEventStatus] = useState(currentEvent.status);

  const saveEvent = async () => {
    const selectedVenue = venueOptions.find((venue) => venue.id === eventVenueId) ?? defaultVenue;
    const nextEvent = {
      ...currentEvent,
      name: eventName.trim() || currentEvent.name,
      venueId: selectedVenue?.id || eventVenueId || undefined,
      venue: selectedVenue?.name || eventVenue.trim() || currentEvent.venue,
      description: eventDescription.trim() || undefined,
      capacity: Number.parseInt(eventCapacity, 10) || currentEvent.capacity,
      startAt: eventStartAt,
      status: eventStatus,
    };

    await createEvent(nextEvent);
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
        <Input label="Fecha de inicio" value={eventStartAt} onChange={setEventStartAt} type="datetime-local" />
        <Input label="Capacidad" value={eventCapacity} onChange={setEventCapacity} placeholder="800" type="number" />
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-slate-200">Lugar</span>
        {venueOptions.length ? (
          <select
            value={eventVenueId}
            onChange={(event) => setEventVenueId(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
          >
            {venueOptions.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={eventVenue}
            onChange={(event) => setEventVenue(event.target.value)}
            placeholder="Sala, club o espacio"
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
          />
        )}
        {venueOptions.length ? (
          <p className="mt-2 text-xs text-slate-500">
            El evento toma su ubicación física del lugar seleccionado.
          </p>
        ) : null}
      </label>

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

function VenueSettingsCard() {
  const { showToast } = useFeedback();
  const { currentOrganization, venues, sectors, createVenue, updateVenue, setVenueStatus } = useCheckInStore();
  const venueOptions = useMemo(() => venues.filter((venue) => venue.organizationId === currentOrganization.id), [currentOrganization.id, venues]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState(venueOptions[0]?.id ?? "");
  const selectedVenue = useMemo(
    () => {
      if (isCreatingNew) {
        return null;
      }

      return venueOptions.find((venue) => venue.id === selectedVenueId) ?? venueOptions[0] ?? null;
    },
    [isCreatingNew, selectedVenueId, venueOptions],
  );
  const [venueName, setVenueName] = useState(selectedVenue?.name ?? "");
  const [venueDescription, setVenueDescription] = useState(selectedVenue?.description ?? "");
  const [venueAddress, setVenueAddress] = useState(selectedVenue?.address ?? "");
  const [venueCity, setVenueCity] = useState(selectedVenue?.city ?? "");
  const [venueCountry, setVenueCountry] = useState(selectedVenue?.country ?? "");
  const [venueStatusValue, setVenueStatusValue] = useState<Venue["status"]>(selectedVenue?.status ?? "active");

  const saveVenue = async () => {
    const now = new Date().toISOString();
    const nextVenue: Venue = {
      id: selectedVenue?.id ?? `venue-${venueName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "new"}`,
      organizationId: currentOrganization.id,
      name: venueName.trim() || selectedVenue?.name || "Espacio nuevo",
      description: venueDescription.trim() || undefined,
      address: venueAddress.trim() || undefined,
      city: venueCity.trim() || undefined,
      country: venueCountry.trim() || undefined,
      status: venueStatusValue,
      createdAt: selectedVenue?.createdAt ?? now,
      updatedAt: now,
      metadata: selectedVenue?.metadata,
    };

    if (selectedVenue) {
      await updateVenue(nextVenue);
    } else {
      await createVenue(nextVenue);
    }
    setIsCreatingNew(false);
    setSelectedVenueId(nextVenue.id);
    showToast({
      title: selectedVenue ? "Espacio actualizado" : "Espacio creado",
      description: `${nextVenue.name} quedó sincronizado en la organización.`,
      tone: "success",
    });
  };

  const openVenue = async () => {
    if (!selectedVenue) {
      return;
    }

    await setVenueStatus(selectedVenue.id, "active");
    showToast({
      title: "Espacio abierto",
      description: `${selectedVenue.name} volvió a estado activo.`,
      tone: "info",
    });
  };

  const deactivateVenue = async () => {
    if (!selectedVenue) {
      return;
    }

    await setVenueStatus(selectedVenue.id, "inactive");
    showToast({
      title: "Espacio desactivado",
      description: `${selectedVenue.name} quedó inactivo sin borrar eventos vinculados.`,
      tone: "warning",
    });
  };

  const selectedVenueSectors = sectors.filter((sector) => sector.venueId === selectedVenue?.id);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Espacio físico</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Gestionar espacios</h2>
          <p className="mt-2 text-sm text-slate-400">
            La estructura física vive en la organización y alimenta los recursos del evento activo.
          </p>
        </div>
        <StatusBadge variant={selectedVenue?.status === "inactive" ? "warning" : "success"}>
          {selectedVenue?.status === "inactive" ? "Inactivo" : "Activo"}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Espacios</p>
            <button
              type="button"
              onClick={() => {
                setIsCreatingNew(true);
                setSelectedVenueId("");
                setVenueName("");
                setVenueDescription("");
                setVenueAddress("");
                setVenueCity("");
                setVenueCountry("");
                setVenueStatusValue("active");
              }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.08]"
            >
              Nuevo
            </button>
          </div>

          <div className="space-y-2">
            {venueOptions.length ? (
              venueOptions.map((venue) => {
                const selected = venue.id === selectedVenue?.id;

                return (
                  <button
                    key={venue.id}
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(false);
                      setSelectedVenueId(venue.id);
                    }}
                    className={[
                      "w-full rounded-[1.25rem] border px-4 py-3 text-left transition",
                      selected
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{venue.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{venue.description ?? "Sin descripción"}</p>
                      </div>
                      <StatusBadge variant={venue.status === "inactive" ? "warning" : "info"}>
                        {venue.status === "inactive" ? "Inactivo" : "Activo"}
                      </StatusBadge>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Todavía no hay espacios configurados.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre" value={venueName} onChange={setVenueName} placeholder="La Rota Carlota" />
            <Input label="Ciudad" value={venueCity} onChange={setVenueCity} placeholder="La Paz" />
            <Input label="Dirección" value={venueAddress} onChange={setVenueAddress} placeholder="Av. principal 123" />
            <Input label="País" value={venueCountry} onChange={setVenueCountry} placeholder="Bolivia" />
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-200">Descripción</span>
            <textarea
              value={venueDescription}
              onChange={(event) => setVenueDescription(event.target.value)}
              placeholder="Resumen breve del espacio"
              className="mt-2 min-h-24 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Estado</span>
              <select
                value={venueStatusValue}
                onChange={(event) => setVenueStatusValue(event.target.value as Venue["status"])}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </label>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Sectores</p>
              <p className="mt-2 text-sm text-slate-300">
                {selectedVenue ? `${selectedVenueSectors.length} sectores vinculados` : "Seleccioná o creá un espacio para ver sectores."}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedVenue ? `La organización tiene ${venueOptions.length} espacios configurados.` : "La estructura física se administra por espacio."}
              </p>
            </div>
          </div>

          {selectedVenue ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Vista física</p>
              <p className="mt-2 text-sm text-slate-300">
                {selectedVenue.name} agrupa {selectedVenueSectors.length} sectores y puede servir a los eventos que lo seleccionen.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveVenue}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Guardar espacio
            </button>
            <button
              type="button"
              onClick={openVenue}
              disabled={!selectedVenue}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Abrir espacio
            </button>
            <button
              type="button"
              onClick={deactivateVenue}
              disabled={!selectedVenue}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Desactivar espacio
            </button>
          </div>
        </div>
      </div>
    </section>
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
      <Topbar eyebrow="Ajustes" title={title} description={description} />
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
