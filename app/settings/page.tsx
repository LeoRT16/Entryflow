"use client";

import { useMemo, useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import PermissionGuard from "@/components/permission-guard";
import StatusBadge from "@/components/status-badge";
import TimezoneSelect from "@/components/timezone-select";
import Topbar from "@/components/topbar";
import type { Venue } from "@/features/domain/types";
import { useCheckInStore } from "@/services/workspace-service";
import { buildSlugFromName } from "@/lib/slug";
import { formatTimezoneLabel, getDefaultTimezone } from "@/lib/timezone";

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function SettingsPage() {
  const { status, error, organizations, can } = useCheckInStore();
  const canManageOrganization = can("organization.manage");
  const canManageVenue = can("venue.manage");

  if (status === "loading") {
    return <PanelShell title="Cargando ajustes" description="Estamos preparando la configuración de la organización." />;
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

  if (!organizations.length) {
    return <PanelShell title="Ajustes sin datos" description="Creá una organización para continuar." />;
  }

  return (
    <div className="mx-auto w-full max-w-[1140px] space-y-5 px-4 sm:px-6 lg:px-0">
      <Topbar eyebrow="Ajustes" title="Ajustes" description="Configuración general de tu organización." />

      <PermissionGuard permission="settings.view">
        <section className="grid gap-4 xl:grid-cols-[0.34fr_0.66fr]">
          <OrganizationSettingsCard canManage={canManageOrganization} />
          <VenueSettingsCard canManage={canManageVenue} />
        </section>
      </PermissionGuard>
    </div>
  );
}

function OrganizationSettingsCard({ canManage }: { canManage: boolean }) {
  const { showToast } = useFeedback();
  const { currentOrganization, createOrganization, setCurrentOrganizationId } = useCheckInStore();
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
        description: `${nextOrganization.name} quedó sincronizada.`,
        tone: "success",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="space-y-2">
        <p className="kicker">Organización</p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{currentOrganization.name}</h2>
        <p className="text-sm text-slate-400">Edita la identidad básica de tu organización.</p>
      </div>

      <div className="mt-5 grid gap-4">
        {canManage ? (
          <>
            <Input label="Nombre de la organización" value={organizationName} onChange={setOrganizationName} placeholder="Nombre de la organización" />
            <TimezoneSelect
              label="Zona horaria"
              value={organizationTimezone}
              onChange={setOrganizationTimezone}
              preferredTimezone={currentOrganization.timezone}
              helperText="Define los horarios utilizados por la organización."
            />
          </>
        ) : (
          <>
            <ReadOnlyField label="Nombre de la organización" value={currentOrganization.name} hint="Solo lectura para este perfil." />
            <ReadOnlyField label="Zona horaria" value={formatTimezoneLabel(currentOrganization.timezone)} hint="Solo lectura para este perfil." />
          </>
        )}
      </div>

      {canManage ? (
        <button
          type="button"
          onClick={saveOrganization}
          disabled={isSaving}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          {isSaving ? "Guardando..." : "Guardar organización"}
        </button>
      ) : null}
    </section>
  );
}

function VenueSettingsCard({ canManage }: { canManage: boolean }) {
  const { showToast } = useFeedback();
  const { currentOrganization, venues, createVenue, updateVenue } = useCheckInStore();
  const venueOptions = useMemo(() => venues.filter((venue) => venue.organizationId === currentOrganization.id), [currentOrganization.id, venues]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState(venueOptions[0]?.id ?? "");
  const selectedVenue = useMemo(() => {
    if (isCreatingNew) {
      return null;
    }

    return venueOptions.find((venue) => venue.id === selectedVenueId) ?? venueOptions[0] ?? null;
  }, [isCreatingNew, selectedVenueId, venueOptions]);
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
      description: `${nextVenue.name} quedó sincronizado.`,
      tone: "success",
    });
  };

  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="space-y-2">
        <p className="kicker">Espacio</p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">Identidad del espacio</h2>
        <p className="text-sm text-slate-400">Edita la identidad básica del espacio seleccionado.</p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.32fr_0.68fr]">
        <div className="space-y-2 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="kicker">Espacios</p>
            {canManage ? (
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
            ) : null}
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
                      "w-full rounded-[1rem] border px-3 py-2.5 text-left transition",
                      selected
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{venue.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{venue.city ?? venue.address ?? "Sin detalle"}</p>
                      </div>
                      <StatusBadge variant={venue.status === "inactive" ? "warning" : "info"}>
                        {venue.status === "inactive" ? "Inactivo" : "Activo"}
                      </StatusBadge>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[1rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Todavía no hay espacios configurados.
              </div>
            )}
          </div>
        </div>

        <div className="surface-elevated p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {canManage ? (
              <>
                <Input label="Nombre" value={venueName} onChange={setVenueName} placeholder="La Rota Carlota" />
                <Input label="Ciudad" value={venueCity} onChange={setVenueCity} placeholder="La Paz" />
                <Input label="Dirección" value={venueAddress} onChange={setVenueAddress} placeholder="Av. principal 123" />
                <Input label="País" value={venueCountry} onChange={setVenueCountry} placeholder="Bolivia" />
              </>
            ) : (
              <>
                <ReadOnlyField label="Nombre" value={selectedVenue?.name ?? "Sin espacio"} />
                <ReadOnlyField label="Ciudad" value={selectedVenue?.city ?? "-"} />
                <ReadOnlyField label="Dirección" value={selectedVenue?.address ?? "-"} />
                <ReadOnlyField label="País" value={selectedVenue?.country ?? "-"} />
              </>
            )}
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-200">Descripción</span>
            {canManage ? (
              <textarea
                value={venueDescription}
                onChange={(event) => setVenueDescription(event.target.value)}
                placeholder="Resumen breve del espacio"
                className="mt-2 min-h-24 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
              />
            ) : (
              <div className="mt-2 rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                {selectedVenue?.description ?? "Sin descripción"}
              </div>
            )}
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Estado</span>
              {canManage ? (
                <select
                  value={venueStatusValue}
                  onChange={(event) => setVenueStatusValue(event.target.value as Venue["status"])}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              ) : (
                <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                  {selectedVenue?.status ?? "active"}
                </div>
              )}
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {canManage ? (
              <button
                type="button"
                onClick={saveVenue}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Guardar espacio
              </button>
            ) : null}
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
