"use client";

import { useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import StatusBadge from "@/components/status-badge";
import type { Venue } from "@/features/domain/types";
import { createUuid, nowIso } from "@/lib/supabase/helpers";

type VenueManagementSectionProps = {
  currentOrganizationId: string;
  selectedVenue: Venue | null;
  canManageVenue: boolean;
  onSelectVenueId: (venueId: string) => void;
  createVenue: (venue: Venue) => Promise<Venue>;
  updateVenue: (venue: Venue) => Promise<Venue>;
};

function formatVenueStatus(status: Venue["status"]) {
  return status === "active" ? "Activo" : "Inactivo";
}

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
        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
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

type VenueEditorFormProps = {
  mode: "edit" | "create";
  currentOrganizationId: string;
  initialVenue: Venue | null;
  canManageVenue: boolean;
  onSelectVenueId: (venueId: string) => void;
  createVenue: (venue: Venue) => Promise<Venue>;
  updateVenue: (venue: Venue) => Promise<Venue>;
  onCancel: () => void;
};

export type VenueDraftFields = {
  name: string;
  description: string;
  address: string;
  city: string;
  country: string;
  status: Venue["status"];
};

export function buildCreatedVenueDraft({
  currentOrganizationId,
  draftId,
  initialVenue,
  draft,
  timestamp,
}: {
  currentOrganizationId: string;
  draftId: string;
  initialVenue: Venue | null;
  draft: VenueDraftFields;
  timestamp: string;
}): Venue {
  return {
    id: draftId,
    organizationId: currentOrganizationId,
    name: draft.name.trim() || "Espacio nuevo",
    description: draft.description.trim() || undefined,
    address: draft.address.trim() || undefined,
    city: draft.city.trim() || undefined,
    country: draft.country.trim() || undefined,
    status: draft.status,
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: initialVenue?.metadata,
  };
}

export function buildUpdatedVenueDraft({
  initialVenue,
  draft,
  timestamp,
}: {
  initialVenue: Venue;
  draft: VenueDraftFields;
  timestamp: string;
}): Venue {
  return {
    ...initialVenue,
    name: draft.name.trim() || initialVenue.name,
    description: draft.description.trim() || undefined,
    address: draft.address.trim() || undefined,
    city: draft.city.trim() || undefined,
    country: draft.country.trim() || undefined,
    status: draft.status,
    updatedAt: timestamp,
  };
}

function VenueEditorForm({
  mode,
  currentOrganizationId,
  initialVenue,
  canManageVenue,
  onSelectVenueId,
  createVenue,
  updateVenue,
  onCancel,
}: VenueEditorFormProps) {
  const { showToast } = useFeedback();
  const [draftVenueId] = useState(() => createUuid());
  const [venueName, setVenueName] = useState(initialVenue?.name ?? "");
  const [venueDescription, setVenueDescription] = useState(initialVenue?.description ?? "");
  const [venueAddress, setVenueAddress] = useState(initialVenue?.address ?? "");
  const [venueCity, setVenueCity] = useState(initialVenue?.city ?? "");
  const [venueCountry, setVenueCountry] = useState(initialVenue?.country ?? "");
  const [venueStatus, setVenueStatus] = useState<Venue["status"]>(initialVenue?.status ?? "active");
  const [isSaving, setIsSaving] = useState(false);

  const saveVenue = async () => {
    if (!canManageVenue) {
      return;
    }

    const timestamp = nowIso();
    const draft = {
      name: venueName,
      description: venueDescription,
      address: venueAddress,
      city: venueCity,
      country: venueCountry,
      status: venueStatus,
    } satisfies VenueDraftFields;
    const nextVenue =
      mode === "create" || !initialVenue
        ? buildCreatedVenueDraft({
            currentOrganizationId,
            draftId: draftVenueId,
            initialVenue,
            draft,
            timestamp,
          })
        : buildUpdatedVenueDraft({
            initialVenue,
            draft,
            timestamp,
          });

    setIsSaving(true);

    try {
      const persistedVenue = mode === "create" || !initialVenue ? await createVenue(nextVenue) : await updateVenue(nextVenue);
      onSelectVenueId(persistedVenue.id);
      onCancel();
      showToast({
        title: mode === "create" || !initialVenue ? "Venue creado" : "Venue actualizado",
        description: `${persistedVenue.name} quedó sincronizado.`,
        tone: "success",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="md:col-span-2 xl:col-span-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          placeholder="Resumen breve del venue"
          className="mt-2 min-h-24 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
        />
      </label>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Estado</span>
          <select
            value={venueStatus}
            onChange={(event) => setVenueStatus(event.target.value as Venue["status"])}
            className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
          >
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void saveVenue()}
          disabled={isSaving}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? "Guardando..." : mode === "create" ? "Crear venue" : "Guardar venue"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function VenueManagementSection({
  currentOrganizationId,
  selectedVenue,
  canManageVenue,
  onSelectVenueId,
  createVenue,
  updateVenue,
}: VenueManagementSectionProps) {
  const [mode, setMode] = useState<"collapsed" | "edit" | "create">("collapsed");

  const openEdit = () => {
    if (!selectedVenue) {
      return;
    }

    setMode("edit");
  };

  const openCreate = () => {
    setMode("create");
  };

  const cancelEditing = () => {
    setMode("collapsed");
  };

  if (!selectedVenue) {
    return (
      <section className="surface-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker">VENUE</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Información del venue</h2>
            <p className="mt-2 text-sm text-slate-400">Todavía no hay venues para editar.</p>
          </div>
          {canManageVenue ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              + Nuevo Venue
            </button>
          ) : (
            <StatusBadge variant="warning">Solo lectura</StatusBadge>
          )}
        </div>

        {canManageVenue && mode === "create" ? (
          <VenueEditorForm
            key={`${mode}:create`}
            mode="create"
            currentOrganizationId={currentOrganizationId}
            initialVenue={null}
            canManageVenue={canManageVenue}
            onSelectVenueId={onSelectVenueId}
            createVenue={createVenue}
            updateVenue={updateVenue}
            onCancel={cancelEditing}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">VENUE</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Información del venue</h2>
          <p className="mt-2 text-sm text-slate-400">
            {selectedVenue.name} · {selectedVenue.city ?? "Sin ciudad"} · {formatVenueStatus(selectedVenue.status)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canManageVenue ? (
            <>
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                + Nuevo Venue
              </button>
            </>
          ) : (
            <StatusBadge variant="info">Solo lectura</StatusBadge>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {canManageVenue && mode === "edit" ? (
          <VenueEditorForm
            key={`${mode}:${selectedVenue.id}`}
            mode="edit"
            currentOrganizationId={currentOrganizationId}
            initialVenue={selectedVenue}
            canManageVenue={canManageVenue}
            onSelectVenueId={onSelectVenueId}
            createVenue={createVenue}
            updateVenue={updateVenue}
            onCancel={cancelEditing}
          />
        ) : canManageVenue && mode === "create" ? (
          <VenueEditorForm
            key={`${mode}:new`}
            mode="create"
            currentOrganizationId={currentOrganizationId}
            initialVenue={null}
            canManageVenue={canManageVenue}
            onSelectVenueId={onSelectVenueId}
            createVenue={createVenue}
            updateVenue={updateVenue}
            onCancel={cancelEditing}
          />
        ) : (
          <>
            <ReadOnlyField label="Nombre" value={selectedVenue.name} hint="El venue seleccionado en el contexto." />
            <ReadOnlyField label="Dirección" value={selectedVenue.address ?? "Sin dirección"} />
            <ReadOnlyField label="Ciudad" value={selectedVenue.city ?? "Sin ciudad"} />
            <ReadOnlyField label="País" value={selectedVenue.country ?? "Sin país"} />
            <ReadOnlyField label="Estado" value={formatVenueStatus(selectedVenue.status)} />
            <ReadOnlyField
              label="Descripción"
              value={selectedVenue.description ?? "Sin descripción"}
              hint={selectedVenue.description ? undefined : "No hay descripción configurada."}
            />
          </>
        )}
      </div>
    </section>
  );
}
