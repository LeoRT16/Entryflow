"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { useFeedback } from "@/components/premium-feedback";
import { admissionFilters, deliveryFilters, reservationFilters, quickFilters } from "@/features/customers/mock/customers";
import { buildOperationalNotes, buildTimeline, getGuestAuditRows, getGuestIncidents, getIncidentToneClass, getIncidentVariant, reservationFilterToStatus, statusTone, admissionFilterToStatus } from "@/features/customers/domain/customer-directory";
import type {
  AdmissionFilter,
  AuditRow,
  GuestIncident,
  GuestRecord,
  OperationalNote,
  ReservationFilter,
  TimelineEntry,
} from "@/features/customers/types";
import { matchesText, normalizeText } from "@/features/customers/utils";
import { useCheckInStore } from "@/features/check-in/state/check-in-store";

export default function GuestDirectory() {
  const { showToast } = useFeedback();
  const { activeEvent: storeActiveEvent, customers, setActiveEventId } = useCheckInStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [admissionFilter, setAdmissionFilter] = useState<AdmissionFilter>("Todos");
  const [deliveryFilter, setDeliveryFilter] = useState<(typeof deliveryFilters)[number]>("Todos");
  const [reservationFilter, setReservationFilter] = useState<ReservationFilter>("Todas");
  const [quickFilterKeys, setQuickFilterKeys] = useState<Array<(typeof quickFilters)[number]["key"]>>([]);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoaded(true), 180);
    return () => window.clearTimeout(timer);
  }, []);

  const activeEvent = storeActiveEvent;

  const selectedEventStats = customers.eventStats[activeEvent.name];

  const visibleGuests = useMemo(() => {
    const baseGuests = customers.guestRecords.filter((guest) => guest.eventName === activeEvent.name);
    const query = normalizeText(searchQuery.trim());

    return baseGuests
      .filter((guest) => {
        if (!query) {
          return true;
        }

        const haystack = [
          guest.guestName,
          guest.carnet,
          guest.whatsapp || "Sin WhatsApp",
          guest.invitationCode,
          guest.reservationCode,
          guest.reservationName,
          guest.eventName,
        ].join(" ");

        return matchesText(haystack, query);
      })
      .filter((guest) => {
        const selectedAdmissionStatus = admissionFilterToStatus(admissionFilter);
        if (selectedAdmissionStatus && guest.admissionStatus !== selectedAdmissionStatus) {
          return false;
        }

        if (deliveryFilter !== "Todos" && guest.deliveryStatus !== deliveryFilter) {
          return false;
        }

        const selectedReservationStatus = reservationFilterToStatus(reservationFilter);
        if (selectedReservationStatus && guest.reservationStatus !== selectedReservationStatus) {
          return false;
        }

        if (quickFilterKeys.includes("attention") && !guest.attention) {
          return false;
        }

        if (quickFilterKeys.includes("recent") && !guest.recentChange) {
          return false;
        }

        if (quickFilterKeys.includes("noWhatsapp") && !guest.noWhatsApp) {
          return false;
        }

        if (quickFilterKeys.includes("noInvitation") && !guest.noInvitationSent) {
          return false;
        }

        if (quickFilterKeys.includes("manual") && !guest.manualAdmission) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aPriority = a.attention ? 0 : a.admissionStatus === "Pendiente" ? 1 : 2;
        const bPriority = b.attention ? 0 : b.admissionStatus === "Pendiente" ? 1 : 2;
        return aPriority - bPriority;
      });
  }, [activeEvent.name, admissionFilter, customers.guestRecords, deliveryFilter, quickFilterKeys, reservationFilter, searchQuery]);

  const attentionGuests = useMemo(
    () => customers.guestRecords.filter((guest) => guest.eventName === activeEvent.name && guest.attention),
    [activeEvent.name, customers.guestRecords],
  );

  const selectedGuest = useMemo(
    () => customers.guestRecords.find((guest) => guest.id === selectedGuestId) ?? null,
    [customers.guestRecords, selectedGuestId],
  );

  useEffect(() => {
    if (selectedGuest && !visibleGuests.some((guest) => guest.id === selectedGuest.id)) {
      const frame = requestAnimationFrame(() => setSelectedGuestId(null));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [selectedGuest, visibleGuests]);

  useEffect(() => {
    if (!selectedGuestId) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedGuestId(null);
        requestAnimationFrame(() => lastTriggerRef.current?.focus());
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedGuestId]);

  useEffect(() => {
    if (!selectedGuestId) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();

    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedGuestId]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }

      if (event.key === "Escape" && !selectedGuestId && searchQuery) {
        event.preventDefault();
        setSearchQuery("");
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [searchQuery, selectedGuestId]);

  const activeFilterTags = [
    admissionFilter !== "Todos" ? admissionFilter : null,
    deliveryFilter !== "Todos" ? deliveryFilter : null,
    reservationFilter !== "Todas" ? reservationFilter : null,
    ...quickFilterKeys.map((key) => quickFilters.find((item) => item.key === key)?.label ?? ""),
  ].filter(Boolean) as string[];

  const hasFilters =
    searchQuery.trim().length > 0 ||
    admissionFilter !== "Todos" ||
    deliveryFilter !== "Todos" ||
    reservationFilter !== "Todas" ||
    quickFilterKeys.length > 0;

  const pendingGuests = visibleGuests.filter((guest) => guest.admissionStatus === "Pendiente");
  const attentionVisible = attentionGuests.filter((guest) => visibleGuests.some((item) => item.id === guest.id));

  const openGuest = (guest: GuestRecord, trigger?: HTMLElement | null) => {
    lastTriggerRef.current = trigger ?? null;
    setSelectedGuestId(guest.id);
    showToast({
      title: "Invitación abierta",
      description: `${guest.guestName} se cargó en el panel operativo.`,
      tone: "info",
    });
  };

  function closeDrawer() {
    setSelectedGuestId(null);
    requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && visibleGuests[0]) {
      event.preventDefault();
      openGuest(visibleGuests[0]);
    }

    if (event.key === "Escape") {
      if (searchQuery) {
        event.preventDefault();
        setSearchQuery("");
      } else if (selectedGuestId) {
        event.preventDefault();
        closeDrawer();
      }
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setAdmissionFilter("Todos");
    setDeliveryFilter("Todos");
    setReservationFilter("Todas");
    setQuickFilterKeys([]);
    showToast({
      title: "Filtros restablecidos",
      description: "La búsqueda volvió al estado operativo inicial.",
      tone: "success",
    });
  };

  const toggleQuickFilter = (key: (typeof quickFilters)[number]["key"]) => {
    setQuickFilterKeys((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  };

  if (!isLoaded) {
    return <DirectorySkeleton />;
  }

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Invitados"
        title="Directorio de invitados"
        description="Busca personas, reservas e invitaciones del evento en curso."
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Evento activo
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <p className="text-xl font-semibold tracking-tight text-white">
                  {activeEvent.name}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {activeEvent.status} · {selectedEventStats.checkedIn} ingresados
                </p>
              </div>

              <StatusBadge variant="info">{activeEvent.status}</StatusBadge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <MiniMetric label="Invitados" value={selectedEventStats.expectedGuests} tone="info" />
            <MiniMetric label="Ingresaron" value={selectedEventStats.checkedIn} tone="success" />
            <MiniMetric label="Pendientes" value={selectedEventStats.pending} tone="warning" />
            <MiniMetric label="Requieren atención" value={selectedEventStats.attention} tone="danger" />
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Selector de evento
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Cambia el contexto operativo sin salir del directorio.
              </p>
            </div>
            <StatusBadge variant="info">Local</StatusBadge>
          </div>

          <label className="block">
            <span className="sr-only">Seleccionar evento</span>
            <select
              value={activeEvent.name}
              onChange={(event) => setActiveEventId(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]"
            >
              {customers.eventOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name} — {option.status}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusBadge variant="success">{selectedEventStats.checkedIn} ingresados</StatusBadge>
            <StatusBadge variant="warning">{selectedEventStats.pending} pendientes</StatusBadge>
            <StatusBadge variant="danger">{selectedEventStats.attention} atención</StatusBadge>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Búsqueda global
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Busca personas, reservas e invitaciones del evento en curso.
                </h2>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">/</span>
                <span>foco</span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Esc</span>
                <span>limpia</span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Buscar por nombre, carnet, WhatsApp, código o reserva"
                  className="h-13 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 pr-24 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-cyan-500/10"
                />
                <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.08]"
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Limpiar filtros
              </button>
            </div>

            {activeFilterTags.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
                  Filtros activos
                </span>
                {activeFilterTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FilterGroup
              title="Ingreso"
              options={admissionFilters}
              value={admissionFilter}
              onChange={(value) => setAdmissionFilter(value as AdmissionFilter)}
            />
            <FilterGroup
              title="Entrega"
              options={deliveryFilters}
              value={deliveryFilter}
              onChange={(value) => setDeliveryFilter(value as (typeof deliveryFilters)[number])}
            />
            <FilterGroup
              title="Reserva"
              options={reservationFilters}
              value={reservationFilter}
              onChange={(value) => setReservationFilter(value as ReservationFilter)}
            />
            <FilterGroup
              title="Atajos"
              options={quickFilters.map((item) => item.label)}
              multi
              selectedValues={quickFilterKeys.map(
                (key) => quickFilters.find((item) => item.key === key)?.label ?? "",
              )}
              onToggle={(label) => {
                const entry = quickFilters.find((item) => item.label === label);
                if (entry) {
                  toggleQuickFilter(entry.key);
                }
              }}
            />
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Resultados
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {visibleGuests.length} invitados visibles
                </h2>
              </div>
              <p className="text-sm text-slate-400">
                Selecciona una invitación para abrir el panel operativo.
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {visibleGuests.length ? (
                visibleGuests.map((guest) => (
                  <GuestCard
                    key={guest.id}
                    guest={guest}
                    onOpenGuest={openGuest}
                    isSelected={selectedGuestId === guest.id}
                  />
                ))
              ) : (
                <ResultsEmptyState
                  noPending={admissionFilter === "Pendientes" && pendingGuests.length === 0}
                  noAttention={quickFilterKeys.includes("attention") && visibleGuests.length === 0}
                  searchActive={searchQuery.trim().length > 0 || hasFilters}
                />
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Requieren atención
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Casos que necesitan revisión
                </h2>
              </div>
              <StatusBadge variant="warning">{attentionVisible.length}</StatusBadge>
            </div>

            <div className="mt-5 space-y-3">
              {attentionVisible.length ? (
                attentionVisible.map((guest) => (
                  <button
                    key={`${guest.id}-attention`}
                    type="button"
                    onClick={(event) => openGuest(guest, event.currentTarget)}
                    className="flex w-full items-start justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left transition hover:border-white/15 hover:bg-slate-950/55"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{guest.guestName}</p>
                      <p className="mt-1 text-sm text-slate-400">{guest.attention}</p>
                    </div>
                    <StatusBadge variant={guest.attentionTone === "danger" ? "danger" : guest.attentionTone === "info" ? "info" : "warning"}>
                      Revisar
                    </StatusBadge>
                  </button>
                ))
              ) : (
                <EmptyCallout
                  icon="spark"
                  title="No hay invitados que requieran atención."
                  description="Cuando aparezca una incidencia operativa, se mostrará aquí."
                />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Guía operativa
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <GuideRow title="Ruta rápida" detail="Buscá por nombre, carnet, WhatsApp o código." />
              <GuideRow title="Estado visible" detail="Entrega e ingreso quedan visibles sin abrir detalles." />
              <GuideRow title="Acceso seguro" detail="La reserva se abre desde la acción principal o desde el detalle." />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Pendientes de ingreso
            </p>
            <div className="mt-4 space-y-3">
              {pendingGuests.length ? (
                pendingGuests.slice(0, 4).map((guest) => (
                  <button
                    key={`${guest.id}-pending`}
                    type="button"
                    onClick={(event) => openGuest(guest, event.currentTarget)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left transition hover:bg-slate-950/55"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{guest.guestName}</p>
                      <p className="mt-1 text-xs text-slate-400">{guest.reservationName}</p>
                    </div>
                    <StatusBadge variant="warning">Pendiente</StatusBadge>
                  </button>
                ))
              ) : (
                <EmptyCallout
                  icon="check"
                  title="Todos los invitados encontrados ya ingresaron."
                  description="No quedan pendientes en el contexto actual."
                />
              )}
            </div>
          </section>
        </aside>
      </div>

      {selectedGuest ? (
        <GuestDrawer
          guest={selectedGuest}
          onClose={closeDrawer}
          drawerRef={drawerRef}
        />
      ) : null}
    </div>
  );
}

function GuestCard({
  guest,
  onOpenGuest,
  isSelected,
}: {
  guest: GuestRecord;
  onOpenGuest: (guest: GuestRecord, trigger?: HTMLElement | null) => void;
  isSelected: boolean;
}) {
  const { showToast, confirm } = useFeedback();
  const deliveryTone = statusTone(guest.deliveryStatus);
  const admissionTone = statusTone(guest.admissionStatus);
  const incidents = getGuestIncidents(guest);

  return (
    <article
      className={[
        "rounded-[1.75rem] border bg-slate-950/40 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-slate-950/55 hover:shadow-[0_24px_70px_rgba(0,0,0,0.25)]",
        isSelected ? "border-cyan-400/30 shadow-[0_24px_70px_rgba(0,0,0,0.25)]" : "border-white/10",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold tracking-tight text-white">{guest.guestName}</h3>
            <p className="mt-1 text-sm text-slate-400">
              {guest.reservationName} · {guest.eventName}
            </p>
            {incidents.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {incidents.slice(0, 4).map((incident) => (
                  <StatusBadge key={`${guest.id}-${incident.title}`} variant={getIncidentVariant(incident.severity)}>
                    {incident.badge}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge variant={deliveryTone}>{guest.deliveryStatus}</StatusBadge>
            <StatusBadge variant={admissionTone}>
              {guest.admissionStatus}
              {guest.checkInTime ? ` · ${guest.checkInTime}` : ""}
            </StatusBadge>
            {guest.gate ? <StatusBadge variant="info">{guest.gate}</StatusBadge> : null}
          </div>
        </div>

        {guest.attention ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Atención
            </p>
            <p className="mt-1 text-sm text-white">{guest.attention}</p>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <MetaLine label="Invitación" value={`${guest.invitationSequence}`} />
          <MetaLine label="Código" value={guest.invitationCode} />
          <MetaLine label="Carnet" value={guest.carnet} />
          <MetaLine label="WhatsApp" value={guest.whatsapp || "Sin WhatsApp"} />
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex flex-wrap gap-2">
            <ActionLink
              label="Ver invitación"
              tone="info"
              onClick={(event) => onOpenGuest(guest, event.currentTarget)}
            />
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Abrir reserva
            </button>
            {guest.admissionStatus === "Pendiente" ? (
              <ActionButton
                label="Marcar ingreso"
                tone="success"
                onClick={() =>
                  showToast({
                    title: "Ingreso marcado (simulación)",
                    description: `${guest.guestName} quedó registrado visualmente.`,
                    tone: "success",
                  })
                }
              />
            ) : null}
            {guest.attention ? (
              <ActionButton
                label="Ver incidencia"
                tone={guest.attentionTone === "danger" ? "danger" : "warning"}
                onClick={() =>
                  showToast({
                    title: "Incidencia abierta",
                    description: "La ficha de incidencia se abrió en modo lectura.",
                    tone: "info",
                  })
                }
              />
            ) : null}
            {guest.deliveryStatus === "Fallida" || guest.noInvitationSent ? (
              <ActionButton
                label="Reenviar invitación"
                tone="info"
                onClick={() =>
                  showToast({
                    title: "Invitación reenviada (simulación)",
                    description: `${guest.guestName} recibirá otra notificación mock.`,
                    tone: "info",
                  })
                }
              />
            ) : null}
            {guest.recentChange ? (
              <ActionButton
                label="Ver transferencia"
                tone="neutral"
                onClick={() =>
                  showToast({
                    title: "Transferencia consultada",
                    description: "Se abrió el detalle operativo de la transferencia.",
                    tone: "info",
                  })
                }
              />
            ) : null}
          </div>

          <details className="group relative">
            <summary className="inline-flex h-11 cursor-pointer list-none items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]">
              Más acciones
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-72 rounded-[1.4rem] border border-white/10 bg-[#0d1117] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <div className="space-y-2">
                {[
                  "Editar invitado",
                  "Cambiar WhatsApp",
                  "Corregir carnet",
                  "Transferir invitación",
                  "Regenerar diseño",
                  "Rotar QR",
                  "Anular invitación",
                  "Ver historial",
                ].map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      if (action === "Anular invitación") {
                        confirm({
                          title: "Anular invitación",
                          description:
                            "La invitación solo se cancelará en modo visual. No se eliminará ninguna información real.",
                          tone: "danger",
                          confirmLabel: "Anular invitación",
                          onConfirm: () =>
                            showToast({
                              title: "Invitación anulada (simulación)",
                              description: `${guest.guestName} quedó marcada como cancelada.`,
                              tone: "warning",
                            }),
                        });
                        return;
                      }

                      showToast({
                        title: `${action} (modo demo)`,
                        description: "La acción únicamente genera retroalimentación visual.",
                        tone: "info",
                      });
                    }}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left text-sm transition hover:-translate-y-0.5 active:scale-[0.98]",
                      action === "Rotar QR" || action === "Anular invitación"
                        ? "border-red-400/15 bg-red-400/10 text-red-100 hover:bg-red-400/15"
                        : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]",
                    ].join(" ")}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

function GuestDrawer({
  guest,
  onClose,
  drawerRef,
}: {
  guest: GuestRecord;
  onClose: () => void;
  drawerRef: RefObject<HTMLDivElement | null>;
}) {
  const { showToast, confirm } = useFeedback();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const timeline = useMemo(() => buildTimeline(guest), [guest]);
  const notes = useMemo(() => buildOperationalNotes(guest), [guest]);
  const incidents = getGuestIncidents(guest);
  const auditRows = getGuestAuditRows(guest);
  const lastSend = guest.deliveryHistory.find((item) => item.title === "Enviada" || item.title === "Reenviada")?.time ?? "18:53";
  const lastOpen = guest.deliveryHistory.find((item) => item.title === "Vista")?.time ?? "—";
  const retries = guest.deliveryHistory.filter((item) => item.title === "Reenviada").length;
  const infoSeat = guest.seat ?? "Mesa asignada";

  const deliveryStateTone =
    guest.deliveryStatus === "Enviada" || guest.deliveryStatus === "Reenviada" || guest.deliveryStatus === "Vista"
      ? "success"
      : guest.deliveryStatus === "Fallida"
        ? "danger"
        : "warning";

  const invitationState =
    guest.admissionStatus === "Ingresó"
      ? { label: "Check-in", tone: "success" as const }
      : guest.admissionStatus === "Anulada"
        ? { label: "Cancelada", tone: "danger" as const }
        : guest.admissionStatus === "Bloqueada"
          ? { label: "Bloqueada", tone: "warning" as const }
          : guest.deliveryStatus === "Vista"
            ? { label: "Vista", tone: "info" as const }
            : { label: "Pendiente", tone: "warning" as const };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className={[
          "absolute inset-0 bg-black/60 backdrop-blur-[1px] transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-label="Cerrar detalle del invitado"
        onClick={onClose}
      />

      <div
        className={[
          "absolute inset-y-0 right-0 flex w-[min(100vw,560px)] transition-transform duration-300 ease-out",
          isVisible ? "translate-x-0" : "translate-x-4",
        ].join(" ")}
      >
        <div
          ref={drawerRef}
          tabIndex={-1}
          className="ml-auto flex h-full w-full flex-col border-l border-white/10 bg-[#0d1117] shadow-[0_24px_120px_rgba(0,0,0,0.45)] outline-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-drawer-title"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
              Panel operativo
            </p>
            <h2 id="guest-drawer-title" className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {guest.guestName}
            </h2>
            {incidents.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {incidents.slice(0, 4).map((incident) => (
                  <StatusBadge key={`${incident.badge}-${incident.timestamp}`} variant={getIncidentVariant(incident.severity)}>
                    {incident.badge}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
            <p className="mt-1 truncate text-sm text-slate-400">
              {guest.reservationName} · {guest.invitationSequence} · {guest.invitationCode}
            </p>
          </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                <StatusBadge variant={statusTone(guest.deliveryStatus)}>{guest.deliveryStatus}</StatusBadge>
                <StatusBadge variant={statusTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
                <StatusBadge variant="info">{guest.reservationCode}</StatusBadge>
                {incidents.length ? <StatusBadge variant="warning">{incidents.length} incidencias</StatusBadge> : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                >
                  Abrir reserva
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Vista previa de invitación
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Versión compacta, lista para compartir desde el panel operativo.
                  </p>
                </div>
                <StatusBadge variant={invitationState.tone}>{invitationState.label}</StatusBadge>
              </div>

              <InvitationPreviewCard guest={guest} />
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Incidentes
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Señales operativas que requieren seguimiento durante el evento.
                  </p>
                </div>
                <StatusBadge variant={incidents.length ? "warning" : "success"}>
                  {incidents.length ? `${incidents.length} abiertos` : "Sin incidencias"}
                </StatusBadge>
              </div>

              <div className="mt-4 space-y-3">
                {incidents.length ? (
                  incidents.map((incident) => <IncidentCard key={`${incident.title}-${incident.timestamp}`} incident={incident} />)
                ) : (
                  <EmptyCallout
                    icon="check"
                    title="No existen incidencias registradas."
                    description="Cuando aparezca una situación operativa, se mostrará aquí con su severidad, hora y operador."
                  />
                )}
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Timeline
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Secuencia operativa del comportamiento de esta invitación.
                  </p>
                </div>
                <StatusBadge variant="info">{timeline.length} eventos</StatusBadge>
              </div>

              <div className="mt-4 space-y-3">
                {timeline.map((item) => (
                  <TimelineRow key={`${item.time}-${item.title}`} item={item} />
                ))}
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Información del invitado
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetaLine label="Nombre" value={guest.guestName} />
                <MetaLine label="Documento" value={guest.carnet} />
                <MetaLine label="Teléfono" value={guest.whatsapp || "Sin WhatsApp"} />
                <MetaLine label="Reserva" value={guest.reservationName} />
                <MetaLine label="Código de invitación" value={guest.invitationCode} />
                <MetaLine label="Seat" value={infoSeat} />
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Notas operativas
              </p>
              <div className="mt-4 grid gap-3">
                {notes.map((note) => (
                  <NoteCard key={note.label} note={note} />
                ))}
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Entrega
                  </p>
                  <p className="mt-1 text-sm text-slate-400">Estado de WhatsApp y últimos eventos de envío.</p>
                </div>
                <StatusBadge variant={deliveryStateTone}>{guest.deliveryStatus}</StatusBadge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DeliveryField label="WhatsApp" value={guest.whatsapp || "Sin WhatsApp"} />
                <DeliveryField label="Vista" value={guest.deliveryStatus === "Vista" ? "Sí" : "No"} />
                <DeliveryField label="Último envío" value={lastSend} />
                <DeliveryField label="Última apertura" value={lastOpen} />
                <DeliveryField label="Reintentos" value={`${retries}`} />
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Acciones manuales
                  </p>
                  <p className="mt-1 text-sm text-slate-400">Botones visuales para resolver un incidente en sala.</p>
                </div>
                <StatusBadge variant="info">Mock</StatusBadge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton
                  label="Validar identidad"
                  tone="neutral"
                  onClick={() =>
                    showToast({
                      title: "Identidad validada (simulación)",
                      description: "La validación quedó registrada visualmente.",
                      tone: "info",
                    })
                  }
                />
                <ActionButton
                  label="Permitir ingreso"
                  tone="success"
                  onClick={() =>
                    showToast({
                      title: "Ingreso permitido (modo demo)",
                      description: "El acceso quedó aprobado solo a nivel visual.",
                      tone: "success",
                    })
                  }
                />
                <ActionButton
                  label="Bloquear ingreso"
                  tone="danger"
                  onClick={() =>
                    confirm({
                      title: "Bloquear ingreso",
                      description:
                        "Esta acción solo afectará la interfaz. No se bloqueará ningún registro real.",
                      tone: "danger",
                      confirmLabel: "Bloquear ingreso",
                      onConfirm: () =>
                        showToast({
                          title: "Ingreso bloqueado (simulación)",
                          description: "El invitado quedó marcado como bloqueado en la vista.",
                          tone: "warning",
                        }),
                    })
                  }
                />
                <ActionButton
                  label="Registrar incidencia"
                  tone="warning"
                  onClick={() =>
                    showToast({
                      title: "Incidencia registrada",
                      description: "Se generó una fila visual de auditoría.",
                      tone: "warning",
                    })
                  }
                />
                <ActionButton
                  label="Reasignar invitación"
                  tone="info"
                  onClick={() =>
                    showToast({
                      title: "Invitación reasignada",
                      description: "La reasignación se mostró en modo mock.",
                      tone: "info",
                    })
                  }
                />
                <ActionButton
                  label="Escalar supervisor"
                  tone="warning"
                  onClick={() =>
                    showToast({
                      title: "Supervisor notificado",
                      description: "La escalación se mostró como confirmada.",
                      tone: "warning",
                    })
                  }
                />
                <ActionButton
                  label="Generar nueva invitación"
                  tone="info"
                  onClick={() =>
                    showToast({
                      title: "Nueva invitación generada",
                      description: "Se regeneró la representación visual.",
                      tone: "success",
                    })
                  }
                />
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Actividad
                  </p>
                  <p className="mt-1 text-sm text-slate-400">Registro visual de las últimas intervenciones manuales.</p>
                </div>
                <StatusBadge variant="info">{auditRows.length ? `${auditRows.length} filas` : "Sin actividad"}</StatusBadge>
              </div>

              <div className="mt-4 space-y-3">
                {auditRows.length ? (
                  auditRows.map((row) => <AuditRowCard key={`${row.time}-${row.action}`} row={row} />)
                ) : (
                  <EmptyCallout
                    icon="spark"
                    title="Sin actividad manual registrada."
                    description="Los botones de acción crearían aquí una fila de auditoría visual."
                  />
                )}
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Notas del operador
              </p>
              <div className="mt-4 space-y-3">
                <textarea
                  readOnly
                  value={
                    guest.internalNotes ??
                    "Operador: revisar identidad visual.\nAcción sugerida: validar en puerta.\nEstado: sin cambios pendientes."
                  }
                  rows={6}
                  className="w-full resize-none rounded-[1.4rem] border border-white/10 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-200 outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  <StatusBadge variant="warning">Editable mock</StatusBadge>
                  <StatusBadge variant="info">Solo lectura</StatusBadge>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvitationPreviewCard({ guest }: { guest: GuestRecord }) {
  const presentation =
    guest.admissionStatus === "Ingresó"
      ? { label: "Ingresó", tone: "success" as const }
      : guest.admissionStatus === "Bloqueada"
        ? { label: "Bloqueada", tone: "warning" as const }
        : guest.admissionStatus === "Anulada"
          ? { label: "Cancelada", tone: "danger" as const }
          : guest.deliveryStatus === "Vista"
            ? { label: "Vista", tone: "info" as const }
            : guest.deliveryStatus === "Reenviada"
              ? { label: "Reenviada", tone: "info" as const }
              : { label: "Pendiente", tone: "warning" as const };

  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-950/80">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-semibold uppercase tracking-[0.24em] text-white">
            LR
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">La Rota Carlota</p>
            <p className="mt-1 text-sm text-slate-300">Invitación premium</p>
          </div>
        </div>
        <StatusBadge variant={presentation.tone}>{presentation.label}</StatusBadge>
      </div>

      <div className="space-y-4 p-4">
        <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_rgba(15,23,42,0.92)_68%)] p-4">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute left-0 top-0 h-20 w-20 rounded-full bg-cyan-400/20 blur-2xl" />
            <div className="absolute right-0 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          </div>
          <div className="relative flex h-48 flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Event artwork
                </p>
                <p className="mt-2 max-w-[12rem] text-xl font-semibold tracking-tight text-white">
                  {guest.eventName}
                </p>
              </div>
              <StatusBadge variant="info">Story</StatusBadge>
            </div>

            <div className="rounded-[1.4rem] border border-white/10 bg-slate-950/65 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Guest</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{guest.guestName}</p>
              <p className="mt-1 text-sm text-slate-400">{guest.reservationName}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <DetailChip label="Fecha" value="8 de agosto de 2026" />
            <DetailChip label="Hora" value="21:00" />
            <DetailChip label="Ubicación" value="La Rota Carlota, Sopocachi" />
            <DetailChip label="Dress Code" value="Elegante oscuro" />
          </div>

          <div className="flex flex-col items-center gap-3 rounded-[1.4rem] border border-dashed border-white/15 bg-white/[0.03] px-4 py-4">
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={[
                    "h-3 w-3 rounded-[0.2rem]",
                    index % 2 === 0 ? "bg-white/90" : "bg-cyan-400/55",
                  ].join(" ")}
                />
              ))}
            </div>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">QR</p>
              <p className="mt-1 text-sm text-slate-300">Uso único</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailChip label="Código único" value={guest.invitationCode} />
          <DetailChip label="Estado" value={guest.admissionStatus} />
        </div>

        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-sm font-medium text-white">La captura de pantalla no garantiza el ingreso.</p>
        </div>
      </div>
    </div>
  );
}

function IncidentCard({ incident }: { incident: GuestIncident }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-200">
            {incident.badge}
          </span>
          <StatusBadge variant={getIncidentVariant(incident.severity)}>
            {incident.severity === "critical"
              ? "Crítica"
              : incident.severity === "warning"
                ? "Advertencia"
                : incident.severity === "resolved"
                  ? "Resuelta"
                  : "Info"}
          </StatusBadge>
        </div>
          <p className="mt-3 text-sm font-semibold text-white">{incident.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">{incident.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {incident.timestamp}
          </p>
          <p className="mt-2 text-xs text-slate-400">{incident.operator}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getIncidentToneClass(incident.severity)}`}>
          {incident.severity === "critical"
            ? "Crítica"
            : incident.severity === "warning"
              ? "Advertencia"
              : incident.severity === "resolved"
                ? "Resuelta"
                : "Informativa"}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineEntry }) {
  const toneClass =
    item.tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : item.tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : item.tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : item.tone === "info"
            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.03] text-white";

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
      <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold uppercase tracking-[0.2em] ${toneClass}`}>
        <span className="sr-only">{item.tone}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">{item.title}</p>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            {item.time}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-400">{item.detail}</p>
      </div>
    </div>
  );
}

function AuditRowCard({ row }: { row: AuditRow }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{row.action}</p>
          <p className="mt-1 text-sm text-slate-400">{row.actor} · {row.area}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          {row.time}
        </span>
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: OperationalNote }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{note.label}</p>
      <p className="mt-2 text-sm font-medium text-white">{note.detail}</p>
    </div>
  );
}

function DeliveryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function DetailChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function FilterGroup({
  title,
  options,
  value,
  onChange,
  multi = false,
  selectedValues = [],
  onToggle,
}: {
  title: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  multi?: boolean;
  selectedValues?: string[];
  onToggle?: (value: string) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = multi ? selectedValues.includes(option) : value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => (multi ? onToggle?.(option) : onChange?.(option))}
              className={[
                "inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition",
                active
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function GuideRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function EmptyCallout({
  icon,
  title,
  description,
}: {
  icon: "check" | "clock" | "spark" | "user";
  title: string;
  description: string;
}) {
  const iconSvg =
    icon === "user" ? (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 16c1.6-2.4 3.6-3.5 6-3.5s4.4 1.1 6 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : icon === "spark" ? (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M10 3l1.7 4.3L16 9l-4.3 1.7L10 15l-1.7-4.3L4 9l4.3-1.7L10 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ) : icon === "check" ? (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path
          d="M4.75 10.5 8.4 14.2 15.25 6.75"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M10 4.5v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 16.5a6.5 6.5 0 1 0-4.6-1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );

  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300">
        {iconSvg}
      </div>
      <p className="mt-3 text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

function ResultsEmptyState({
  noPending,
  noAttention,
  searchActive,
}: {
  noPending: boolean;
  noAttention: boolean;
  searchActive: boolean;
}) {
  let title = "No encontramos invitados con esos datos.";
  let description = "Prueba con el nombre, carnet, WhatsApp, código de invitación o nombre de reserva.";
  let icon: "check" | "clock" | "spark" | "user" = "spark";

  if (noPending) {
    title = "Todos los invitados encontrados ya ingresaron.";
    description = "No quedan pendientes de ingreso en la combinación actual.";
    icon = "check";
  } else if (noAttention) {
    title = "No hay invitados que requieran atención.";
    description = "Cuando exista una incidencia operativa, aparecerá en esta vista.";
    icon = "spark";
  } else if (!searchActive) {
    title = "No hay resultados visibles.";
    description = "Ajusta el evento, los filtros o la búsqueda para ver invitados.";
    icon = "user";
  }

  return <EmptyCallout icon={icon} title={title} description={description} />;
}

function DirectorySkeleton() {
  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Invitados"
        title="Directorio de invitados"
        description="Busca personas, reservas e invitaciones del evento en curso."
      />
      <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SkeletonBlock className="h-[220px]" />
        <SkeletonBlock className="h-[220px]" />
      </div>
      <SkeletonBlock className="h-[120px]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-[118px]" />
        ))}
      </div>
      <SkeletonBlock className="h-[320px]" />
      <SkeletonBlock className="h-[200px]" />
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.04] ${className}`} />;
}

function ActionLink({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "info" | "neutral";
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-medium transition hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
        tone === "info"
          ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15"
          : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ActionButton({
  label,
  tone,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
      : tone === "info"
        ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15"
        : tone === "warning"
          ? "border-amber-400/25 bg-amber-400/10 text-amber-50 hover:bg-amber-400/15"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100 hover:bg-red-400/15"
          : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-medium transition hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
        toneClass,
      ].join(" ")}
    >
      <span className={loading ? "animate-pulse" : ""}>{loading ? "Cargando..." : label}</span>
    </button>
  );
}
