"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import Topbar from "@/components/topbar";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import ResourceReservationModal from "@/features/tables/components/resource-reservation-modal";
import { getPrimaryActiveTableReservation } from "@/features/tables/domain/table-domain";
import { canPersistResourceName } from "@/features/tables/domain/resource-validation";
import { isTerminalEventStatus } from "@/features/events/domain";
import type { Resource, ResourceType, Sector } from "@/features/domain/types";
import { createUuid, nowIso } from "@/lib/supabase/helpers";
import { useCheckInStore } from "@/services/workspace-service";

const resourceTypeLabels: Record<ResourceType, string> = {
  table: "Mesa",
  lounge: "Lounge",
  box: "Box",
  seat: "Asiento",
  zone: "Zona",
  booth: "Cabina",
  room: "Sala",
  gate: "Acceso",
  area: "Area",
};

type SectorFormState = {
  name: string;
  description: string;
  capacity: string;
  order: string;
  status: Sector["status"];
};

type ResourceFormState = {
  name: string;
  type: ResourceType;
  capacity: string;
  sectorId: string;
  order: string;
  status: Resource["status"];
  notes: string;
};

const emptySectorForm: SectorFormState = {
  name: "",
  description: "",
  capacity: "",
  order: "1",
  status: "active",
};

const emptyResourceForm: ResourceFormState = {
  name: "",
  type: "table",
  capacity: "6",
  sectorId: "",
  order: "1",
  status: "Available",
  notes: "",
};

export default function TablesFlow() {
  const store = useCheckInStore();

  return <TablesFlowWorkspace key={store.currentEvent.id} />;
}

function TablesFlowWorkspace() {
  const { showToast } = useFeedback();
  const {
    currentOrganization,
    currentEvent,
    currentVenue,
    currentVenueSectors,
    currentVenueResources,
    reservations,
    guests,
    tableSummaries,
    venues,
    sectors,
    resources,
    createSector,
    updateSector,
    setSectorStatus,
    createResource,
    updateResource,
    setResourceStatus,
    moveResourceToSector,
  } = useCheckInStore();
  const router = useRouter();
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);

  const [selectedSectorId, setSelectedSectorId] = useState(currentVenueSectors[0]?.id ?? "");
  const [selectedResourceId, setSelectedResourceId] = useState(currentVenueResources[0]?.id ?? "");
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [selectedReservationResourceId, setSelectedReservationResourceId] = useState<string | null>(null);
  const [sectorForm, setSectorForm] = useState<SectorFormState>(emptySectorForm);
  const [resourceForm, setResourceForm] = useState<ResourceFormState>(emptyResourceForm);

  const venue = currentVenue ?? venues[0] ?? null;
  const venueSectors = currentVenueSectors.length
    ? currentVenueSectors
    : sectors.filter((sector) => !venue || sector.venueId === venue.id);
  const venueResources = currentVenueResources.length
    ? currentVenueResources
    : resources.filter((resource) => !venue || resource.venueId === venue.id);

  const sectorMetrics = useMemo(() => {
    return venueSectors.map((sector) => {
      const sectorResources = venueResources.filter((resource) => resource.sectorId === sector.id);
      const derivedCapacity = sectorResources.reduce((total, resource) => total + resource.capacity, 0);
      const summaryCount = sectorResources.length;

      return {
        sector,
        summaryCount,
        derivedCapacity,
      };
    });
  }, [venueResources, venueSectors]);

  const resourceSummaryMap = useMemo(() => {
    return new Map(tableSummaries.map((summary) => [summary.id, summary]));
  }, [tableSummaries]);

  const selectedSector = venueSectors.find((sector) => sector.id === selectedSectorId) ?? venueSectors[0] ?? null;
  const selectedResources = venueResources.filter((resource) => resource.sectorId === selectedSector?.id);
  const selectedResource = venueResources.find((resource) => resource.id === selectedResourceId) ?? selectedResources[0] ?? venueResources[0] ?? null;
  const selectedReservationResource = selectedReservationResourceId
    ? venueResources.find((resource) => resource.id === selectedReservationResourceId) ?? null
    : null;
  const selectedReservation = selectedReservationResource
    ? getPrimaryActiveTableReservation(
        {
          ...selectedReservationResource,
          location:
            venueSectors.find((sector) => sector.id === selectedReservationResource.sectorId)?.name ??
            venue?.name ??
            "Sin sector",
          eventId: currentEvent.id,
          reservationIds: [],
          guestIds: [],
          closed: selectedReservationResource.status === "Closed" || selectedReservationResource.status === "Blocked",
        },
        reservations,
        currentEvent.id,
      )
    : null;
  const selectedReservationGuests = selectedReservation
    ? guests.filter((guest) => guest.reservationId === selectedReservation.id).sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const selectedReservationConflictCount = selectedReservationResource
    ? resourceSummaryMap.get(selectedReservationResource.id)?.reservationIds.length ?? 0
    : 0;

  const totalResources = venueResources.length;
  const activeResources = venueResources.filter((resource) => resource.status !== "Closed" && resource.status !== "Blocked").length;
  const totalDerivedCapacity = sectorMetrics.reduce((total, metric) => total + metric.derivedCapacity, 0);

  const startCreateSector = () => {
    setEditingSectorId(null);
    setSectorForm(emptySectorForm);
  };

  const startEditSector = (sector: Sector) => {
    setEditingSectorId(sector.id);
    setSectorForm({
      name: sector.name,
      description: sector.description ?? "",
      capacity: sector.capacity ? String(sector.capacity) : "",
      order: String(sector.order ?? 1),
      status: sector.status,
    });
  };

  const startCreateResource = (sectorId = selectedSector?.id ?? "") => {
    setEditingResourceId(null);
    setResourceForm({
      ...emptyResourceForm,
      sectorId,
    });
  };

  const startEditResource = (resource: Resource) => {
    setEditingResourceId(resource.id);
    setResourceForm({
      name: resource.name,
      type: resource.type,
      capacity: String(resource.capacity),
      sectorId: resource.sectorId ?? "",
      order: String(resource.order ?? 1),
      status: resource.status,
      notes: resource.notes ?? "",
    });
  };

  const saveSector = async () => {
    if (!venue) {
      return;
    }

    const timestamp = nowIso();
    const payload: Sector = {
      id: editingSectorId ?? createUuid(),
      venueId: venue.id,
      name: sectorForm.name.trim() || "Sin nombre",
      description: sectorForm.description.trim() || undefined,
      capacity: sectorForm.capacity.trim() ? Number(sectorForm.capacity) : undefined,
      order: Number(sectorForm.order || 1),
      status: sectorForm.status,
      createdAt: editingSectorId ? (sectors.find((item) => item.id === editingSectorId)?.createdAt ?? timestamp) : timestamp,
      updatedAt: timestamp,
      metadata: {},
    };

    if (editingSectorId) {
      await updateSector(payload);
    } else {
      await createSector(payload);
      setSelectedSectorId(payload.id);
    }

    setEditingSectorId(null);
    setSectorForm(emptySectorForm);
  };

  const saveResource = async () => {
    if (!venue) {
      return;
    }

    const resourceName = resourceForm.name.trim();

    if (!canPersistResourceName(resourceForm.name)) {
      showToast({
        title: "Nombre requerido",
        description: "El recurso físico necesita un nombre válido antes de guardarse.",
        tone: "warning",
      });
      return;
    }

    const timestamp = nowIso();
    const payload: Resource = {
      id: editingResourceId ?? createUuid(),
      venueId: venue.id,
      sectorId: resourceForm.sectorId || undefined,
      type: resourceForm.type,
      name: resourceName,
      capacity: Math.max(Number(resourceForm.capacity || 0), 0),
      status: resourceForm.status,
      order: Number(resourceForm.order || 1),
      notes: resourceForm.notes.trim() || undefined,
      metadata: {},
      createdAt: editingResourceId ? (resources.find((item) => item.id === editingResourceId)?.createdAt ?? timestamp) : timestamp,
      updatedAt: timestamp,
    };

    if (editingResourceId) {
      await updateResource(payload);
    } else {
      await createResource(payload);
      setSelectedResourceId(payload.id);
    }

    if (payload.sectorId) {
      await moveResourceToSector(payload.id, payload.sectorId);
    }

    setEditingResourceId(null);
    setResourceForm(emptyResourceForm);
  };

  const formatAvailability = (status: string) => {
    if (status === "Available") return "Disponible";
    if (status === "Reserved") return "Reservado";
    if (status === "Partially Occupied" || status === "Full") return "Ocupado";
    if (status === "Over Capacity") return "Sobrecapacidad";
    if (status === "Blocked") return "Bloqueado";
    return "No disponible";
  };

  const resourceTone = (status: string) => {
    if (status === "Available") return "success" as const;
    if (status === "Reserved") return "info" as const;
    if (status === "Partially Occupied" || status === "Full") return "warning" as const;
    return "danger" as const;
  };

  const activateCardSelection = (onSelect: () => void) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  const openReservationEditor = (reservationId: string, action: "edit" | "append" = "edit") => {
    if (isTerminalEvent) {
      return;
    }

    const params = new URLSearchParams({
      editReservationId: reservationId,
      action,
    });

    router.push(`/reservations?${params.toString()}`);
  };

  if (!venue) {
    return (
      <div className="space-y-6">
        <Topbar
          eyebrow="Recursos"
          title="Gestión de recursos"
          description="No hay venue activo para administrar sectores y recursos."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Recursos"
        title={venue.name}
        description={`Venue activo para ${currentOrganization.name}. Sectores y recursos físicos se administran desde esta vista.`}
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] xl:grid-cols-4">
        <LiveSummaryRow label="Sectores" value={`${venueSectors.length}`} />
        <LiveSummaryRow label="Recursos" value={`${totalResources}`} />
        <LiveSummaryRow label="Activos" value={`${activeResources}`} />
        <LiveSummaryRow label="Capacidad derivada" value={`${totalDerivedCapacity}`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Venue activo
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{venue.name}</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {currentEvent.name}
                </p>
              </div>
              <StatusBadge variant="info">{venueSectors.length} sectores</StatusBadge>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Sectores
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {selectedSector?.name ?? "Sin sector"}
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startCreateSector}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                >
                  Nuevo sector
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {sectorMetrics.map(({ sector, summaryCount, derivedCapacity }) => {
                const selected = sector.id === selectedSector?.id;
                return (
                  <article
                    key={sector.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedSectorId(sector.id);
                      setSelectedResourceId(venueResources.find((resource) => resource.sectorId === sector.id)?.id ?? "");
                    }}
                    onKeyDown={activateCardSelection(() => {
                      setSelectedSectorId(sector.id);
                      setSelectedResourceId(venueResources.find((resource) => resource.sectorId === sector.id)?.id ?? "");
                    })}
                    className={[
                      "rounded-[1.5rem] border p-4 text-left transition hover:-translate-y-0.5",
                      selected
                        ? "border-cyan-400/35 bg-cyan-400/10 shadow-[0_20px_60px_rgba(0,0,0,0.24)]"
                        : "border-white/10 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/55",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold tracking-tight text-white">{sector.name}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {summaryCount} recursos · capacidad {derivedCapacity}
                        </p>
                      </div>
                      <StatusBadge variant={sector.status === "active" ? "success" : "warning"}>
                        {sector.status === "active" ? "Activo" : "Inactivo"}
                      </StatusBadge>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditSector(sector);
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void setSectorStatus(sector.id, sector.status === "active" ? "inactive" : "active");
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white"
                        >
                        {sector.status === "active" ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Formulario sector
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  {editingSectorId ? "Editar sector" : "Crear sector"}
                </h3>
              </div>
              <StatusBadge variant="info">{editingSectorId ? "Edición" : "Nuevo"}</StatusBadge>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Nombre">
                <input
                  value={sectorForm.name}
                  onChange={(event) => setSectorForm((current) => ({ ...current, name: event.target.value }))}
                  className={inputClassName}
                  placeholder="Planta Baja"
                />
              </Field>
              <Field label="Orden">
                <input
                  value={sectorForm.order}
                  onChange={(event) => setSectorForm((current) => ({ ...current, order: event.target.value }))}
                  className={inputClassName}
                  placeholder="1"
                  type="number"
                />
              </Field>
              <Field label="Capacidad opcional">
                <input
                  value={sectorForm.capacity}
                  onChange={(event) => setSectorForm((current) => ({ ...current, capacity: event.target.value }))}
                  className={inputClassName}
                  placeholder="30"
                  type="number"
                />
              </Field>
              <Field label="Estado">
                <select
                  value={sectorForm.status}
                  onChange={(event) => setSectorForm((current) => ({ ...current, status: event.target.value as Sector["status"] }))}
                  className={selectClassName}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </Field>
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-200">Descripción</span>
                <textarea
                  value={sectorForm.description}
                  onChange={(event) => setSectorForm((current) => ({ ...current, description: event.target.value }))}
                  className={`${inputClassName} min-h-[96px]`}
                  placeholder="Sector principal cerca de la pista"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveSector()}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Guardar sector
              </button>
              <button
                type="button"
                onClick={startCreateSector}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Limpiar
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Resources
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {selectedSector?.name ?? "Sin sector"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => startCreateResource(selectedSector?.id ?? "")}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
              >
                Nuevo recurso
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {selectedResources.map((resource) => {
                const summary = resourceSummaryMap.get(resource.id);
                const overCapacity = summary ? Math.max(summary.metrics.assignedGuests - resource.capacity, 0) : 0;
                const selected = resource.id === selectedResource?.id;
                const availability = summary ? formatAvailability(summary.status) : resource.status === "Closed" ? "No disponible" : "Disponible";
                const activeReservation = getPrimaryActiveTableReservation(
                  {
                    ...resource,
                    location: venueSectors.find((sector) => sector.id === resource.sectorId)?.name ?? venue?.name ?? "Sin sector",
                    eventId: currentEvent.id,
                    reservationIds: [],
                    guestIds: [],
                    closed: resource.status === "Closed" || resource.status === "Blocked",
                  },
                  reservations,
                  currentEvent.id,
                );
                const hasActiveReservation = Boolean(activeReservation);

                return (
                  <article
                    key={resource.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedResourceId(resource.id)}
                    onKeyDown={activateCardSelection(() => setSelectedResourceId(resource.id))}
                    className={[
                      "w-full rounded-[1.45rem] border p-4 text-left transition hover:-translate-y-0.5",
                      selected
                        ? "border-cyan-400/35 bg-cyan-400/10 shadow-[0_20px_60px_rgba(0,0,0,0.24)]"
                        : "border-white/10 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/55",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold tracking-tight text-white">{resource.name}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {resourceTypeLabels[resource.type]} · {resource.capacity} personas
                        </p>
                      </div>
                      <StatusBadge variant={resourceTone(summary?.status ?? resource.status)}>
                        {availability}
                      </StatusBadge>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <LiveSummaryRow label="Sector" value={venueSectors.find((sector) => sector.id === resource.sectorId)?.name ?? "Sin sector"} />
                      <LiveSummaryRow label="Ocupación" value={summary ? `${summary.metrics.assignedGuests}/${resource.capacity}` : `0/${resource.capacity}`} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {overCapacity > 0 ? <StatusBadge variant="danger">Sobrecapacidad +{overCapacity}</StatusBadge> : null}
                      {hasActiveReservation ? (
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedReservationResourceId(resource.id);
                            }}
                            className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-50"
                          >
                            Ver reserva
                          </button>
                          {!isTerminalEvent ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openReservationEditor(activeReservation.id, "edit");
                              }}
                              className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-50"
                            >
                              Editar reserva
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditResource(resource);
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void setResourceStatus(resource.id, resource.status === "Closed" ? "Available" : "Closed");
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white"
                        >
                        {resource.status === "Closed" ? "Activar" : "Desactivar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Formulario recurso
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  {editingResourceId ? "Editar recurso" : "Crear recurso"}
                </h3>
              </div>
              <StatusBadge variant="info">{editingResourceId ? "Edición" : "Nuevo"}</StatusBadge>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Nombre">
                <input
                  value={resourceForm.name}
                  onChange={(event) => setResourceForm((current) => ({ ...current, name: event.target.value }))}
                  className={inputClassName}
                  placeholder="Mesa 1"
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={resourceForm.type}
                  onChange={(event) => setResourceForm((current) => ({ ...current, type: event.target.value as ResourceType }))}
                  className={selectClassName}
                >
                  {Object.entries(resourceTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Capacidad">
                <input
                  value={resourceForm.capacity}
                  onChange={(event) => setResourceForm((current) => ({ ...current, capacity: event.target.value }))}
                  className={inputClassName}
                  placeholder="6"
                  type="number"
                />
              </Field>
              <Field label="Orden">
                <input
                  value={resourceForm.order}
                  onChange={(event) => setResourceForm((current) => ({ ...current, order: event.target.value }))}
                  className={inputClassName}
                  placeholder="1"
                  type="number"
                />
              </Field>
              <Field label="Sector">
                <select
                  value={resourceForm.sectorId}
                  onChange={(event) => setResourceForm((current) => ({ ...current, sectorId: event.target.value }))}
                  className={selectClassName}
                >
                  <option value="">Sin sector</option>
                  {venueSectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estado">
                <select
                  value={resourceForm.status}
                  onChange={(event) => setResourceForm((current) => ({ ...current, status: event.target.value as Resource["status"] }))}
                  className={selectClassName}
                >
                  <option value="Available">Disponible</option>
                  <option value="Reserved">Reservado</option>
                  <option value="Partially Occupied">Ocupado parcial</option>
                  <option value="Full">Completo</option>
                  <option value="Over Capacity">Sobrecapacidad</option>
                  <option value="Blocked">Bloqueado</option>
                  <option value="Closed">No disponible</option>
                </select>
              </Field>
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-200">Notas</span>
                <textarea
                  value={resourceForm.notes}
                  onChange={(event) => setResourceForm((current) => ({ ...current, notes: event.target.value }))}
                  className={`${inputClassName} min-h-[96px]`}
                  placeholder="Observaciones operativas del recurso"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveResource()}
                disabled={!resourceForm.name.trim()}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Guardar recurso
              </button>
              <button
                type="button"
                onClick={() => startCreateResource(selectedSector?.id ?? "")}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Limpiar
              </button>
            </div>
          </section>
        </div>
      </section>

      <ResourceReservationModal
        isOpen={Boolean(selectedReservationResourceId && selectedReservation)}
        resource={selectedReservationResource}
        reservation={selectedReservation}
        guests={selectedReservationGuests}
        summary={selectedReservationResource ? resourceSummaryMap.get(selectedReservationResource.id) ?? null : null}
        sectorName={
          selectedReservationResource
            ? venueSectors.find((sector) => sector.id === selectedReservationResource.sectorId)?.name ?? "Sin sector"
            : "Sin sector"
        }
        conflictCount={selectedReservationConflictCount}
        isTerminalEvent={isTerminalEvent}
        onClose={() => setSelectedReservationResourceId(null)}
        onAddManillas={() => {
          if (!selectedReservation) {
            return;
          }

          openReservationEditor(selectedReservation.id, "append");
        }}
        onEditReservation={() => {
          if (!selectedReservation) {
            return;
          }

          openReservationEditor(selectedReservation.id, "edit");
        }}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      {children}
    </label>
  );
}

const inputClassName =
  "h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]";

const selectClassName =
  "h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]";
