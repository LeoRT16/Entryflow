"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import ResourceReservationModal from "@/features/tables/components/resource-reservation-modal";
import { getPrimaryActiveTableReservation } from "@/features/tables/domain/table-domain";
import { canDeleteResource } from "@/features/tables/domain/resource-lifecycle";
import { canPersistResourceName } from "@/features/tables/domain/resource-validation";
import { getVenuesForOrganization } from "@/features/domain/selectors";
import {
  getVenueContextStorageKey,
  readVenueContextPreference,
  resolveVenueSectorName,
  resolveTablesVenueContext,
} from "@/features/tables/domain/venue-context";
import VenueManagementSection from "@/features/tables/components/venue-management-section";
import { isTerminalEventStatus } from "@/features/events/domain";
import { isTerminalReservationStatus } from "@/features/reservations/domain/reservation-domain";
import type {
  Event as PlatformEvent,
  Resource,
  ResourceType,
  Sector,
} from "@/features/domain/types";
import { createUuid, nowIso } from "@/lib/supabase/helpers";
import {
  resolveCurrentEventLayout,
  resolveCurrentVenueLayout,
  resolveCurrentVenueResources,
  resolveCurrentVenueSectors,
} from "@/services/workspace-layout-resolution";
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
  area: "Área",
};

type SectorFormState = {
  name: string;
  description: string;
  capacity: string;
  status: Sector["status"];
};

type ResourceFormState = {
  name: string;
  type: ResourceType;
  capacity: string;
  sectorId: string;
  status: Resource["status"];
  notes: string;
};

const emptySectorForm: SectorFormState = {
  name: "",
  description: "",
  capacity: "",
  status: "active",
};

const emptyResourceForm: ResourceFormState = {
  name: "",
  type: "table",
  capacity: "6",
  sectorId: "",
  status: "Available",
  notes: "",
};

const UNASSIGNED_ZONE_ID = "__unassigned__";

export default function TablesFlow() {
  const store = useCheckInStore();

  return <TablesFlowWorkspace key={store.currentEvent.id} />;
}

function TablesFlowWorkspace() {
  const { confirm, showToast } = useFeedback();
  const {
    currentOrganization,
    currentEvent,
    can,
    venueLayouts,
    eventLayouts,
    venueLayoutSectors,
    venueLayoutResources,
    eventLayoutSectors,
    eventLayoutResources,
    reservations,
    guests,
    tables,
    timelineEvents,
    tableSummaries,
    venues,
    sectors,
    resources,
    createVenue,
    updateVenue,
    createSector,
    updateSector,
    setSectorStatus,
    createResource,
    updateResource,
    setResourceStatus,
    deleteResource,
    moveResourceToSector,
    moveGuestToTable,
    changeReservationTable,
  } = useCheckInStore();
  const router = useRouter();
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);
  const canManageVenue = can("venue.manage");
  const venueContextStorageKey = getVenueContextStorageKey(
    currentOrganization.id,
  );
  const organizationVenues = useMemo(
    () => getVenuesForOrganization(currentOrganization.id, venues),
    [currentOrganization.id, venues],
  );
  const [isVenueCreateOpen, setIsVenueCreateOpen] = useState(false);
  const [isVenueConfigOpen, setIsVenueConfigOpen] = useState(false);
  const [isResourceFormOpen, setIsResourceFormOpen] = useState(false);
  const [isSectorFormOpen, setIsSectorFormOpen] = useState(false);
  const [venueNameDraft, setVenueNameDraft] = useState("");
  const [isCreatingVenue, setIsCreatingVenue] = useState(false);
  const [hasHydratedVenuePreference, setHasHydratedVenuePreference] =
    useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState(
    currentEvent.venueId ?? "",
  );
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(
    null,
  );
  const [selectedReservationResourceId, setSelectedReservationResourceId] =
    useState<string | null>(null);
  const [sectorForm, setSectorForm] =
    useState<SectorFormState>(emptySectorForm);
  const [resourceForm, setResourceForm] =
    useState<ResourceFormState>(emptyResourceForm);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedVenueId = readVenueContextPreference(
      window.localStorage,
      currentOrganization.id,
    );
    const validStoredVenueId = organizationVenues.some(
      (venue) => venue.id === storedVenueId,
    )
      ? storedVenueId
      : "";
    const validEventVenueId = organizationVenues.some(
      (venue) => venue.id === currentEvent.venueId,
    )
      ? currentEvent.venueId
      : "";
    // An event-scoped venue is authoritative. A previous organization-level
    // preference must not leak across event switches.
    const nextVenueId =
      validEventVenueId ||
      validStoredVenueId ||
      organizationVenues[0]?.id ||
      "";

    startTransition(() => {
      setSelectedVenueId(nextVenueId);
      setHasHydratedVenuePreference(true);
    });
  }, [currentEvent.venueId, currentOrganization.id, organizationVenues]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedVenuePreference) {
      return;
    }

    if (!selectedVenueId) {
      window.localStorage.removeItem(venueContextStorageKey);
      return;
    }
    window.localStorage.setItem(venueContextStorageKey, selectedVenueId);
  }, [hasHydratedVenuePreference, selectedVenueId, venueContextStorageKey]);

  const venueContext = useMemo(
    () =>
      resolveTablesVenueContext({
        venues: organizationVenues,
        sectors,
        resources,
        preferredVenueId: selectedVenueId || undefined,
        fallbackVenueId: currentEvent.venueId,
      }),
    [
      currentEvent.venueId,
      organizationVenues,
      resources,
      sectors,
      selectedVenueId,
    ],
  );
  const venue = venueContext.currentVenue;
  const hasCanonicalEventVenue = organizationVenues.some(
    (option) => option.id === currentEvent.venueId,
  );
  const venueOptions = hasCanonicalEventVenue
    ? venueContext.venueOptions.filter(
        (option) => option.id === currentEvent.venueId,
      )
    : venueContext.venueOptions;
  const currentVenueId = venue?.id ?? "";
  const currentEventLayout = useMemo(
    () =>
      resolveCurrentEventLayout({
        currentEventId: currentEvent.id,
        currentVenueId,
        eventLayouts,
      }),
    [currentEvent.id, currentVenueId, eventLayouts],
  );
  const currentVenueLayout = useMemo(
    () =>
      resolveCurrentVenueLayout({
        currentVenueId,
        currentEventLayout,
        venueLayouts,
      }),
    [currentEventLayout, currentVenueId, venueLayouts],
  );
  const venueSectors = useMemo(
    () =>
      resolveCurrentVenueSectors({
        currentVenueId,
        currentEventLayout,
        venueLayout: currentVenueLayout,
        sectors,
        venueLayoutSectors,
        eventLayoutSectors,
      }),
    [
      currentEventLayout,
      currentVenueId,
      currentVenueLayout,
      eventLayoutSectors,
      sectors,
      venueLayoutSectors,
    ],
  );
  const venueResources = useMemo(
    () =>
      resolveCurrentVenueResources({
        currentVenueId,
        currentEventLayout,
        venueLayout: currentVenueLayout,
        resources,
        venueLayoutResources,
        eventLayoutResources,
      }),
    [
      currentEventLayout,
      currentVenueId,
      currentVenueLayout,
      eventLayoutResources,
      resources,
      venueLayoutResources,
    ],
  );
  const hasUnassignedResources = venueResources.some(
    (resource) => !resource.sectorId,
  );
  const zoneOptions = useMemo(() => {
    const baseZones = venueSectors.map((sector) => ({
      id: sector.id,
      name: sector.name,
      status: sector.status,
      capacity: sector.capacity,
      isUnassigned: false,
    }));

    if (hasUnassignedResources) {
      baseZones.push({
        id: UNASSIGNED_ZONE_ID,
        name: "Sin zona",
        status: "inactive" as const,
        capacity: undefined,
        isUnassigned: true,
      });
    }

    return baseZones;
  }, [hasUnassignedResources, venueSectors]);
  const defaultSelectedZoneId = zoneOptions[0]?.id ?? "";
  const effectiveSelectedZoneId = zoneOptions.some(
    (zone) => zone.id === selectedSectorId,
  )
    ? selectedSectorId
    : defaultSelectedZoneId;
  const selectedZone =
    venueSectors.find((zone) => zone.id === effectiveSelectedZoneId) ?? null;
  const visibleResources = useMemo(() => {
    if (!effectiveSelectedZoneId) {
      return venueResources;
    }

    if (effectiveSelectedZoneId === UNASSIGNED_ZONE_ID) {
      return venueResources.filter((resource) => !resource.sectorId);
    }

    return venueResources.filter(
      (resource) => resource.sectorId === effectiveSelectedZoneId,
    );
  }, [effectiveSelectedZoneId, venueResources]);

  const resourceSummaryMap = useMemo(
    () => new Map(tableSummaries.map((summary) => [summary.id, summary])),
    [tableSummaries],
  );

  const selectedResource =
    visibleResources.find((resource) => resource.id === selectedResourceId) ??
    visibleResources[0] ??
    venueResources.find((resource) => resource.id === selectedResourceId) ??
    venueResources[0] ??
    null;
  const selectedReservationResource = selectedReservationResourceId
    ? (visibleResources.find(
        (resource) => resource.id === selectedReservationResourceId,
      ) ??
      venueResources.find(
        (resource) => resource.id === selectedReservationResourceId,
      ) ??
      null)
    : null;
  const selectedReservation = selectedReservationResource
    ? getPrimaryActiveTableReservation(
        {
          ...selectedReservationResource,
          location:
            venueSectors.find(
              (sector) => sector.id === selectedReservationResource.sectorId,
            )?.name ??
            venue?.name ??
            "Sin zona",
          eventId: currentEvent.id,
          reservationIds: [],
          guestIds: [],
          closed:
            selectedReservationResource.status === "Closed" ||
            selectedReservationResource.status === "Blocked",
        },
        reservations,
        currentEvent.id,
      )
    : null;
  const selectedReservationGuests = selectedReservation
    ? guests
        .filter((guest) => guest.reservationId === selectedReservation.id)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const selectedReservationConflictCount = selectedReservationResource
    ? (resourceSummaryMap.get(selectedReservationResource.id)?.metrics
        .activeReservations ?? 0)
    : 0;

  const startCreateSector = () => {
    if (isTerminalEvent) {
      showToast({
        title: "Evento cerrado",
        description: "No puedes crear zonas en un evento cerrado.",
        tone: "warning",
      });
      return;
    }

    setEditingSectorId(null);
    setSectorForm(emptySectorForm);
    setIsSectorFormOpen(true);
  };

  const startEditSector = (sector: Sector) => {
    if (isTerminalEvent) {
      showToast({
        title: "Evento cerrado",
        description: "No puedes editar zonas en un evento cerrado.",
        tone: "warning",
      });
      return;
    }

    setEditingSectorId(sector.id);
    setIsSectorFormOpen(true);
    setSelectedSectorId(sector.id);
    setSectorForm({
      name: sector.name,
      description: sector.description ?? "",
      capacity: sector.capacity ? String(sector.capacity) : "",
      status: sector.status,
    });
  };

  const startCreateResource = (
    sectorId = resourceForm.sectorId ||
      effectiveSelectedZoneId ||
      venueSectors[0]?.id ||
      "",
  ) => {
    if (isTerminalEvent) {
      showToast({
        title: "Evento cerrado",
        description: "No puedes crear espacios en un evento cerrado.",
        tone: "warning",
      });
      return;
    }

    setEditingResourceId(null);
    setIsResourceFormOpen(true);
    setResourceForm({
      ...emptyResourceForm,
      sectorId,
    });
  };

  const startEditResource = (resource: Resource) => {
    if (isTerminalEvent) {
      showToast({
        title: "Evento cerrado",
        description: "No puedes editar espacios en un evento cerrado.",
        tone: "warning",
      });
      return;
    }

    setEditingResourceId(resource.id);
    setIsResourceFormOpen(true);
    setSelectedResourceId(resource.id);
    setResourceForm({
      name: resource.name,
      type: resource.type,
      capacity: String(resource.capacity),
      sectorId: resource.sectorId ?? "",
      status: resource.status,
      notes: resource.notes ?? "",
    });
  };

  const saveSector = async () => {
    if (!venue) {
      return;
    }

    if (isTerminalEvent) {
      showToast({
        title: "Evento cerrado",
        description: "No puedes guardar zonas en un evento cerrado.",
        tone: "warning",
      });
      return;
    }

    const timestamp = nowIso();
    const payload: Sector = {
      id: editingSectorId ?? createUuid(),
      venueId: venue.id,
      name: sectorForm.name.trim() || "Sin nombre",
      description: sectorForm.description.trim() || undefined,
      capacity: sectorForm.capacity.trim()
        ? Number(sectorForm.capacity)
        : undefined,
      order: editingSectorId
        ? (sectors.find((item) => item.id === editingSectorId)?.order ?? 1)
        : Math.max(0, ...venueSectors.map((item) => item.order ?? 0)) + 1,
      status: sectorForm.status,
      createdAt: editingSectorId
        ? (sectors.find((item) => item.id === editingSectorId)?.createdAt ??
          timestamp)
        : timestamp,
      updatedAt: timestamp,
      metadata: {},
    };

    if (editingSectorId) {
      await updateSector(payload);
    } else {
      await createSector(payload);
      setResourceForm((current) => ({ ...current, sectorId: payload.id }));
      setSelectedSectorId(payload.id);
    }

    setEditingSectorId(null);
    setSectorForm(emptySectorForm);
    setIsSectorFormOpen(false);
  };

  const saveResource = async () => {
    if (!venue) {
      return;
    }

    if (isTerminalEvent) {
      showToast({
        title: "Evento cerrado",
        description: "No puedes guardar espacios en un evento cerrado.",
        tone: "warning",
      });
      return;
    }

    const resourceName = resourceForm.name.trim();

    if (!canPersistResourceName(resourceForm.name)) {
      showToast({
        title: "Nombre requerido",
        description: "El espacio necesita un nombre válido antes de guardarse.",
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
      order: editingResourceId
        ? (resources.find((item) => item.id === editingResourceId)?.order ?? 1)
        : Math.max(0, ...venueResources.map((item) => item.order ?? 0)) + 1,
      notes: resourceForm.notes.trim() || undefined,
      metadata: {},
      createdAt: editingResourceId
        ? (resources.find((item) => item.id === editingResourceId)?.createdAt ??
          timestamp)
        : timestamp,
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
    setIsResourceFormOpen(false);
  };

  const formatResourceStatus = (status: string) => {
    if (status === "Available") return "Disponible";
    if (status === "Reserved") return "Reservado";
    if (status === "Partially Occupied") return "Ocupación parcial";
    if (status === "Full") return "Completo";
    if (status === "Over Capacity") return "Sobrecapacidad";
    if (status === "Blocked") return "Bloqueado";
    return "No disponible";
  };

  const resourceTone = (status: string) => {
    if (status === "Available") return "success" as const;
    if (status === "Reserved") return "info" as const;
    if (status === "Partially Occupied" || status === "Full")
      return "warning" as const;
    return "danger" as const;
  };

  const activateCardSelection =
    (onSelect: () => void) => (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    };

  const openReservationEditor = (
    reservationId: string,
    action: "edit" | "append" = "edit",
  ) => {
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
        <section className="surface-panel p-5 sm:p-6">
          <div className="space-y-3">
            <p className="kicker">ESPACIOS</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.6rem]">
              Espacios
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
              Gestiona los espacios y su capacidad en el venue activo.
            </p>
          </div>
        </section>

        <section className="surface-quiet flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="kicker">VENUE</p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-white">
              Ningún venue activo
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Necesitas al menos un venue para ver zonas, espacios y layouts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canManageVenue ? (
              <button
                type="button"
                onClick={() => setIsVenueCreateOpen(true)}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Crear Venue
              </button>
            ) : (
              <StatusBadge variant="warning">
                Sin permiso para crear venues
              </StatusBadge>
            )}
          </div>
        </section>

        {isVenueCreateOpen && canManageVenue ? (
          <section className="surface-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="kicker">Nuevo venue</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  Crear venue
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsVenueCreateOpen(false)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">
                  Nombre del venue
                </span>
                <input
                  value={venueNameDraft}
                  onChange={(event) => setVenueNameDraft(event.target.value)}
                  placeholder="La Rota Carlota"
                  className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
              </label>

              <div className="flex items-end gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      if (!canManageVenue || !venueNameDraft.trim()) {
                        return;
                      }

                      setIsCreatingVenue(true);

                      try {
                        const timestamp = nowIso();
                        const nextVenue = await createVenue({
                          id: createUuid(),
                          organizationId: currentOrganization.id,
                          name: venueNameDraft.trim(),
                          status: "active",
                          createdAt: timestamp,
                          updatedAt: timestamp,
                        });

                        if (!hasCanonicalEventVenue) {
                          setSelectedVenueId(nextVenue.id);
                        }
                        setIsVenueCreateOpen(false);
                        setVenueNameDraft("");
                        showToast({
                          title: "Venue creado",
                          description: `${nextVenue.name} quedó activo en Espacios.`,
                          tone: "success",
                        });
                      } finally {
                        setIsCreatingVenue(false);
                      }
                    })()
                  }
                  disabled={!venueNameDraft.trim() || isCreatingVenue}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isCreatingVenue ? "Creando..." : "Crear Venue"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="kicker">ESPACIOS</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Distribución física
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {currentEvent.name} · {venue.name} · {venueSectors.length} zonas ·{" "}
              {venueResources.length} espacios
            </p>
          </div>
          {isTerminalEvent ? (
            <StatusBadge variant="warning">Evento cerrado</StatusBadge>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="min-w-0">
            <span className="sr-only">Seleccionar venue</span>
            <select
              value={venue.id}
              onChange={(event) => setSelectedVenueId(event.target.value)}
              disabled={hasCanonicalEventVenue}
              className="h-10 min-w-[14rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-400/50"
            >
              {venueOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.status !== "active" ? " · Inactivo" : ""}
                </option>
              ))}
            </select>
          </label>
          {venue.status !== "active" ? (
            <StatusBadge variant="warning">Venue inactivo</StatusBadge>
          ) : null}
          {canManageVenue ? (
            <button
              type="button"
              onClick={() => setIsVenueConfigOpen((open) => !open)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white"
            >
              Configurar venue
            </button>
          ) : null}
        </div>
      </section>
      {isVenueConfigOpen ? (
        <VenueManagementSection
          currentOrganizationId={currentOrganization.id}
          selectedVenue={venue}
          canManageVenue={canManageVenue}
          onSelectVenueId={setSelectedVenueId}
          createVenue={createVenue}
          updateVenue={updateVenue}
        />
      ) : null}
      <section className="surface-quiet flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="kicker mr-2">ZONAS</span>
          <button
            type="button"
            onClick={() => setSelectedSectorId("")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!selectedSectorId ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-50" : "border-white/10 bg-white/[0.04] text-white"}`}
          >
            Todas
          </button>
          {zoneOptions.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => setSelectedSectorId(zone.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${zone.id === effectiveSelectedZoneId ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-50" : "border-white/10 bg-white/[0.04] text-white"}`}
            >
              {zone.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startCreateSector}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white"
          >
            + Zona
          </button>
          {selectedZone ? (
            <>
              <button
                type="button"
                onClick={() => startEditSector(selectedZone)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white"
              >
                Editar zona
              </button>
              <button
                type="button"
                onClick={() =>
                  void setSectorStatus(
                    selectedZone.id,
                    selectedZone.status === "active" ? "inactive" : "active",
                  )
                }
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white"
              >
                {selectedZone.status === "active" ? "Desactivar" : "Activar"}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => startCreateResource()}
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950"
          >
            + Espacio
          </button>
        </div>
      </section>

      <section className="space-y-6">
        {isResourceFormOpen || isSectorFormOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
            <div className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-white/10 bg-[#0b0f14] p-5 shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
            <section className={isResourceFormOpen ? "surface-panel p-5" : "hidden"}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="kicker">Crear espacio</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {editingResourceId ? "Editar espacio" : "Crear espacio"}
                  </h2>
                </div>
                <StatusBadge variant="info">
                  {editingResourceId ? "Edición" : "Nuevo"}
                </StatusBadge>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Nombre">
                  <input
                    value={resourceForm.name}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className={inputClassName}
                    placeholder="Mesa 1"
                  />
                </Field>
                <Field label="Tipo">
                  <select
                    value={resourceForm.type}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        type: event.target.value as ResourceType,
                      }))
                    }
                    className={selectClassName}
                  >
                    {Object.entries(resourceTypeLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Capacidad">
                  <input
                    value={resourceForm.capacity}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        capacity: event.target.value,
                      }))
                    }
                    className={inputClassName}
                    placeholder="6"
                    type="number"
                  />
                </Field>
                <Field label="Zona">
                  <select
                    value={resourceForm.sectorId}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        sectorId: event.target.value,
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="">Sin zona</option>
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
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        status: event.target.value as Resource["status"],
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="Available">Disponible</option>
                    <option value="Reserved">Reservado</option>
                    <option value="Partially Occupied">
                      Ocupación parcial
                    </option>
                    <option value="Full">Completo</option>
                    <option value="Over Capacity">Sobrecapacidad</option>
                    <option value="Blocked">Bloqueado</option>
                    <option value="Closed">No disponible</option>
                  </select>
                </Field>
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    Notas
                  </span>
                  <textarea
                    value={resourceForm.notes}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    className={`${inputClassName} min-h-[96px]`}
                    placeholder="Observaciones operativas del espacio"
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
                  Crear espacio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsResourceFormOpen(false);
                    setEditingResourceId(null);
                    setResourceForm(emptyResourceForm);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                >
                  Cancelar
                </button>
              </div>
            </section>

            <section className={isSectorFormOpen ? "surface-panel p-5" : "hidden"}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="kicker">Configurar zona</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {editingSectorId ? "Editar zona" : "Crear zona"}
                  </h2>
                </div>
                <StatusBadge variant="info">
                  {editingSectorId ? "Edición" : "Nuevo"}
                </StatusBadge>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Nombre">
                  <input
                    value={sectorForm.name}
                    onChange={(event) =>
                      setSectorForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className={inputClassName}
                    placeholder="Planta Baja"
                  />
                </Field>
                <Field label="Capacidad opcional">
                  <input
                    value={sectorForm.capacity}
                    onChange={(event) =>
                      setSectorForm((current) => ({
                        ...current,
                        capacity: event.target.value,
                      }))
                    }
                    className={inputClassName}
                    placeholder="30"
                    type="number"
                  />
                </Field>
                <Field label="Estado">
                  <select
                    value={sectorForm.status}
                    onChange={(event) =>
                      setSectorForm((current) => ({
                        ...current,
                        status: event.target.value as Sector["status"],
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </Field>
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    Descripción
                  </span>
                  <textarea
                    value={sectorForm.description}
                    onChange={(event) =>
                      setSectorForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className={`${inputClassName} min-h-[96px]`}
                    placeholder="Zona principal cerca de la pista"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveSector()}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  Crear zona
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSectorFormOpen(false);
                    setEditingSectorId(null);
                    setSectorForm(emptySectorForm);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                >
                  Cancelar
                </button>
              </div>
            </section>
            </div>
          </div>
        ) : null}

        <div className="min-w-0 space-y-6">
          <section className="surface-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="kicker">Espacios existentes</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {visibleResources.length} espacios
                </h2>
              </div>
              <StatusBadge variant="info">
                {venueSectors.length} zonas
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {visibleResources.length ? (
                visibleResources.map((resource) => {
                  const summary = resourceSummaryMap.get(resource.id);
                  const occupancy = summary
                    ? `${summary.metrics.assignedGuests}/${resource.capacity}`
                    : `0/${resource.capacity}`;
                  const selected = resource.id === selectedResource?.id;
                  const statusLabel = summary
                    ? formatResourceStatus(summary.status)
                    : formatResourceStatus(resource.status);
                  const activeReservation = getPrimaryActiveTableReservation(
                    {
                      ...resource,
                      location:
                        venueSectors.find(
                          (sector) => sector.id === resource.sectorId,
                        )?.name ??
                        venue?.name ??
                        "Sin zona",
                      eventId: currentEvent.id,
                      reservationIds: [],
                      guestIds: [],
                      closed:
                        resource.status === "Closed" ||
                        resource.status === "Blocked",
                    },
                    reservations,
                    currentEvent.id,
                  );
                  const deleteDecision = canDeleteResource({
                    resourceId: resource.id,
                    reservations,
                    guests,
                    venueLayoutResources,
                    eventLayoutResources,
                    tables,
                    timelineEvents,
                  });

                  return (
                    <article
                      key={resource.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedResourceId(resource.id)}
                      onKeyDown={activateCardSelection(() =>
                        setSelectedResourceId(resource.id),
                      )}
                      className={[
                        "min-w-0 rounded-[1.35rem] border p-4 text-left transition hover:-translate-y-0.5",
                        selected
                          ? "border-cyan-400/35 bg-cyan-400/10 shadow-[0_20px_60px_rgba(0,0,0,0.24)]"
                          : "border-white/10 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/55",
                      ].join(" ")}
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-semibold tracking-tight text-white">
                            {resource.name}
                          </p>
                          <p className="mt-1 break-words text-sm text-slate-400">
                            {resourceTypeLabels[resource.type]} ·{" "}
                            {resolveVenueSectorName(
                              venueSectors,
                              resource.sectorId,
                            )}
                          </p>
                        </div>
                        <StatusBadge
                          variant={resourceTone(
                            summary?.status ?? resource.status,
                          )}
                        >
                          {statusLabel}
                        </StatusBadge>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                        <span className="text-base font-semibold text-white">
                          {occupancy}
                        </span>
                        {summary?.metrics.extraGuestCount ? (
                          <span className="context-chip" data-tone="warning">
                            +{summary.metrics.extraGuestCount} {summary.metrics.extraGuestCount === 1 ? "extra" : "extras"}
                          </span>
                        ) : null}
                        {summary?.metrics.overCapacity ? (
                          <span className="context-chip" data-tone="warning">
                            Sobrecapacidad +{summary.metrics.overCapacity}
                          </span>
                        ) : null}
                        {activeReservation ? (
                          <span className="context-chip" data-tone="info">
                            Reserva activa
                          </span>
                        ) : null}
                      </div>

                      <details className="mt-4">
                        <summary className="inline-flex cursor-pointer list-none rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-50">
                          Ver detalle
                        </summary>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activeReservation ? (
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
                              {can("resource.assign") && can("reservation.edit") && !isTerminalEvent && !isTerminalReservationStatus(activeReservation.status) ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedReservationResourceId(resource.id);
                                  }}
                                  className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-50"
                                >
                                  Cambiar mesa
                                </button>
                              ) : null}
                              {!isTerminalEvent ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openReservationEditor(
                                      activeReservation.id,
                                      "edit",
                                    );
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
                              if (isTerminalEvent) {
                                showToast({
                                  title: "Evento cerrado",
                                  description:
                                    "No puedes modificar el estado de un espacio en un evento cerrado.",
                                  tone: "warning",
                                });
                                return;
                              }

                              void setResourceStatus(
                                resource.id,
                                resource.status === "Closed"
                                  ? "Available"
                                  : "Closed",
                              );
                            }}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white"
                          >
                            {resource.status === "Closed"
                              ? "Activar"
                              : "Desactivar"}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (isTerminalEvent) {
                                showToast({
                                  title: "Evento cerrado",
                                  description:
                                    "No puedes eliminar un espacio desde un evento cerrado.",
                                  tone: "warning",
                                });
                                return;
                              }
                              if (!deleteDecision.allowed) {
                                showToast({
                                  title: "No se puede eliminar",
                                  description:
                                    "Este espacio ya tiene historial asociado. Puedes desactivarlo, pero no eliminarlo.",
                                  tone: "warning",
                                });
                                return;
                              }
                              confirm({
                                title: "Eliminar espacio",
                                description: `${resource.name} desaparecerá del inventario porque nunca tuvo uso.`,
                                confirmLabel: "Eliminar espacio",
                                tone: "danger",
                                onConfirm: () => {
                                  void deleteResource(resource.id)
                                    .then(() =>
                                      showToast({
                                        title: "Espacio eliminado",
                                        description: `${resource.name} ya no forma parte del inventario.`,
                                        tone: "success",
                                      }),
                                    )
                                    .catch((error: unknown) =>
                                      showToast({
                                        title: "No se pudo eliminar",
                                        description:
                                          error instanceof Error
                                            ? error.message
                                            : "No se pudo eliminar el espacio.",
                                        tone: "error",
                                      }),
                                    );
                                },
                              });
                            }}
                            className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-xs font-medium text-rose-100"
                          >
                            Eliminar
                          </button>
                        </div>
                      </details>
                    </article>
                  );
                })
              ) : (
                <div className="surface-quiet border-dashed p-4 text-sm text-slate-400">
                  Esta zona todavía no tiene espacios.
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      <ResourceReservationModal
        isOpen={Boolean(selectedReservationResourceId && selectedReservation)}
        resource={selectedReservationResource}
        reservation={selectedReservation}
        guests={selectedReservationGuests}
        summary={
          selectedReservationResource
            ? (resourceSummaryMap.get(selectedReservationResource.id) ?? null)
            : null
        }
        sectorName={
          selectedReservationResource
            ? resolveVenueSectorName(
                venueSectors,
                selectedReservationResource.sectorId,
              )
            : "Sin zona"
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
        availableResources={venueResources}
        resourceSummaries={resourceSummaryMap}
        canMoveGuests={can("resource.assign")}
        onMoveGuest={moveGuestToTable}
        canChangeTable={can("resource.assign") && can("reservation.edit")}
        onChangeTable={async (input) => {
          const result = await changeReservationTable(input);
          showToast({
            title:
              result.kind === "swap"
                ? "Mesas intercambiadas"
                : "Reserva movida",
            description:
              result.kind === "swap"
                ? "Las reservas fueron intercambiadas."
                : "La reserva fue movida a la nueva mesa.",
            tone: "success",
          });
          return result;
        }}
      />
    </div>
  );
}

function formatEventType(eventType: PlatformEvent["eventType"]) {
  if (eventType === "nightlife") return "Boliche";
  if (eventType === "concert") return "Concierto";
  if (eventType === "festival") return "Festival";
  if (eventType === "corporate") return "Corporativo";
  if (eventType === "conference") return "Conferencia";
  if (eventType === "seminar") return "Seminario";
  if (eventType === "workshop") return "Taller";
  if (eventType === "theatre") return "Teatro / Obra";
  if (eventType === "sports") return "Deportivo";
  if (eventType === "private") return "Privado";
  return "Personalizado";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-sm font-medium text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClassName =
  "h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]";

const selectClassName =
  "h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]";
