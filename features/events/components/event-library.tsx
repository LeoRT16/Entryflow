"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import type { Event } from "@/features/domain/types";
import { getEventsForOrganization, getVenuesForOrganization } from "@/features/domain/selectors";
import { isTerminalEventStatus } from "@/features/events/domain";
import EventEditorModal from "@/features/events/components/event-editor-modal";
import EventCreationWizard from "@/features/events/components/event-creation-wizard";
import { useCheckInStore } from "@/services/workspace-service";
import { useFeedback } from "@/components/premium-feedback";

type EventStatusGroup = "live" | "upcoming" | "finished";
type ArchivedEvent = Pick<Event, "id" | "organizationId" | "name" | "description" | "status" | "startAt" | "timezone" | "venue"> & { deletedAt: string };

type EventAction = {
  label: string;
  tone: "success" | "warning" | "info";
  onClick: () => void;
};

function formatEventStatusLabel(status: Event["status"]) {
  if (status === "live") return "En vivo";
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

export default function EventLibrary() {
  const {
    events,
    currentEventId,
    currentEvent,
    currentOrganization,
    reservations,
    guests,
    tables,
    checkIns,
    createEvent,
    updateEvent,
    prepareEventPhysicalLayout,
    setCurrentEventId,
    setEventStatus,
    activateEvent,
    archiveEvent,
    can,
    currentAccount,
    venues,
  } = useCheckInStore();
  const { confirm, notify } = useFeedback();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardOrganizationId, setWizardOrganizationId] = useState(currentOrganization.id);
  const [editorEventId, setEditorEventId] = useState<string | null>(null);
  const [activatingEventId, setActivatingEventId] = useState<string | null>(null);
  const [archivedEvents, setArchivedEvents] = useState<ArchivedEvent[]>([]);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveDate, setArchiveDate] = useState("");
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoringEventId, setRestoringEventId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<ArchivedEvent | null>(null);
  const [permanentDeletePhrase, setPermanentDeletePhrase] = useState("");
  const [permanentDeleteLoading, setPermanentDeleteLoading] = useState(false);
  const [permanentDeleteError, setPermanentDeleteError] = useState<string | null>(null);
  const loadArchivedEvents = useCallback(async (signal?: AbortSignal) => {
    const organizationId = currentOrganization.id;
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const response = await fetch(`/api/events/archived?organizationId=${encodeURIComponent(organizationId)}`, { signal });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; events?: Array<Record<string, unknown>> } | null;
      if (!response.ok || !payload?.ok) throw new Error("No se pudieron cargar los eventos archivados.");
      setArchivedEvents((payload.events ?? []).map((event) => ({
        id: String(event.id), organizationId: String(event.organization_id), name: String(event.name), description: typeof event.description === "string" ? event.description : undefined,
        status: event.status as Event["status"], startAt: String(event.start_at), timezone: String(event.timezone ?? "UTC"), venue: typeof event.venue === "string" ? event.venue : "Venue no definido", deletedAt: String(event.deleted_at),
      })));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Intenta nuevamente.";
      setArchiveError(message);
      notify({ title: "No se pudieron cargar los archivados", description: message, tone: "danger", icon: "alert" });
    } finally {
      if (!(signal?.aborted)) setArchiveLoading(false);
    }
  }, [currentOrganization.id, notify]);
  // The archive list is an authenticated server projection and must refresh when the organization changes.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadArchivedEvents(controller.signal);
    return () => controller.abort();
  }, [loadArchivedEvents]);
  const organizationEvents = useMemo(() => getEventsForOrganization(currentOrganization.id, events), [currentOrganization.id, events]);


  const organizationVenues = useMemo(() => getVenuesForOrganization(currentOrganization.id, venues), [currentOrganization.id, venues]);

  const groupedEvents = useMemo(() => {
    const groups: Record<EventStatusGroup, Event[]> = {
      live: [],
      upcoming: [],
      finished: [],
    };

    organizationEvents.forEach((event) => {
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
  }, [organizationEvents]);

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
          title: "Eventos disponibles",
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
  const filteredArchivedEvents = useMemo(() => archivedEvents.filter((event) => event.name.toLowerCase().includes(archiveSearch.trim().toLowerCase()) && (!archiveDate || event.startAt.slice(0, 10) === archiveDate)), [archiveDate, archiveSearch, archivedEvents]);
  const canPermanentlyDelete = Boolean(currentAccount.isPlatformRoot || currentAccount.roleSlug === "owner");
  const requestPermanentDelete = (event: ArchivedEvent) => { setPermanentDeleteTarget(event); setPermanentDeletePhrase(""); setPermanentDeleteError(null); };
  const permanentlyDelete = async () => {
    if (!permanentDeleteTarget || permanentDeletePhrase !== "ELIMINAR" || permanentDeleteLoading) return;
    setPermanentDeleteLoading(true); setPermanentDeleteError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(permanentDeleteTarget.id)}/permanent`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: { code?: string } } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.code === "event_delete_blocked" ? "El evento tiene procesos externos pendientes." : "No se pudo eliminar permanentemente el evento.");
      setArchivedEvents((current) => current.filter((event) => event.id !== permanentDeleteTarget.id));
      setPermanentDeleteTarget(null); notify({ title: "Evento eliminado", description: "El evento archivado y sus datos exclusivos fueron eliminados.", tone: "success", icon: "check" });
    } catch (error) { const message = error instanceof Error ? error.message : "La operación no pudo completarse."; setPermanentDeleteError(message); notify({ title: "No se pudo eliminar el evento", description: message, tone: "danger", icon: "alert" }); }
    finally { setPermanentDeleteLoading(false); }
  };

  const openEventWizard = (organizationId: string = currentOrganization.id) => {
    setWizardOrganizationId(organizationId);
    setWizardOpen(true);
  };

  const editorEvent = useMemo(
    () => organizationEvents.find((event) => event.id === editorEventId) ?? null,
    [editorEventId, organizationEvents],
  );

  const openEventEditor = (event: Event) => {
    setEditorEventId(event.id);
  };

  const currentEventAction: EventAction | null =
    isTerminalEventStatus(currentEvent.status)
      ? null
      : currentEvent.status === "draft"
        ? {
            label: "Publicar evento",
            tone: "info",
            onClick: () => confirm({ title: "¿Publicar este evento?", description: "Al publicarlo podrás gestionar reservas, invitados y accesos.", confirmLabel: "Publicar evento", cancelLabel: "Cancelar", tone: "info", onConfirm: () => void setEventStatus(currentEvent.id, "published") }),
          }
        : currentEvent.status === "live" ? {
            label: "Cerrar evento",
            tone: "warning",
            onClick: () => { void setEventStatus(currentEvent.id, "finished").catch(() => undefined); },
        } : null;

  const cancelEvent = (event: Event) => confirm({ title: "¿Cancelar este evento?", description: "Dejará de aceptar operación nueva. El historial se conservará y la acción es irreversible.", confirmLabel: "Cancelar evento", cancelLabel: "Volver", tone: "danger", onConfirm: () => void setEventStatus(event.id, "cancelled") });

  const requestActivation = (event: Event) => {
    const liveEvent = organizationEvents.find((candidate) => candidate.status === "live" && candidate.id !== event.id);
    confirm({
      title: "¿Activar este evento?",
      description: liveEvent
        ? `“${liveEvent.name}” está actualmente en vivo. Al continuar, ese evento se cerrará y “${event.name}” pasará a ser el evento operativo.`
        : `“${event.name}” será el evento operativo de la organización. Recepción y Puerta trabajarán sobre este evento.`,
      confirmLabel: "Activar evento",
      cancelLabel: "Cancelar",
      tone: "success",
      onConfirm: () => {
        setActivatingEventId(event.id);
        void activateEvent(event.id).catch((error) => notify({ title: "No se pudo activar el evento", description: error instanceof Error ? error.message : "La operación no pudo completarse.", tone: "danger", icon: "alert" })).finally(() => setActivatingEventId(null));
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1140px] space-y-5 px-4 sm:px-6 lg:px-0">
      <header className="surface-panel flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem]">Eventos</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
              Crea y administra los eventos de tu organización.
            </p>
          </div>

          {can("event.create") ? (
            <button
              type="button"
              onClick={() => openEventWizard(currentOrganization.id)}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              + Crear evento
            </button>
          ) : null}
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
              onEditEvent={openEventEditor}
              onActivateEvent={requestActivation}
              onCancelEvent={cancelEvent}
              onArchiveEvent={(event) => confirm({ title: "Archivar evento", description: "Este evento dejará de aparecer en las listas habituales y se moverá a Archivados. Sus reservas, invitados y reportes se conservarán.", confirmLabel: "Archivar evento", cancelLabel: "Cancelar", tone: "info", onConfirm: () => { void archiveEvent(event.id, true).then(async () => { await loadArchivedEvents(); notify({ title: "Evento archivado", description: "El evento se movió a Archivados y sus datos se conservaron.", tone: "success", icon: "check" }); }).catch((error) => notify({ title: "No se pudo archivar el evento", description: error instanceof Error ? error.message : "La operación no pudo completarse.", tone: "danger", icon: "alert" })); } })}
              canActivate={can("event.edit")}
              canEdit={can("event.edit")}
              canArchive={can("event.delete")}
              activatingEventId={activatingEventId}
            />
          ))
        ) : (
          <section className="surface-panel p-4 sm:p-5">
            <p className="text-sm text-slate-400">No hay eventos para mostrar.</p>
          </section>
        )}
      </section>

      <section className="surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="kicker">Archivados</p><p className="mt-1 text-sm text-slate-400">Consulta histórica y restauración, sin volverlos operativos.</p></div>
          <div className="flex flex-wrap gap-2"><input value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder="Buscar por nombre" className="h-9 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white" /><input type="date" value={archiveDate} onChange={(event) => setArchiveDate(event.target.value)} className="h-9 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white" /></div>
        </div>
        {archiveLoading ? <p className="mt-4 text-sm text-slate-400">Cargando histórico…</p> : archiveError ? <p className="mt-4 text-sm text-rose-300">{archiveError}</p> : filteredArchivedEvents.length ? <div className="mt-3 grid gap-2.5 xl:grid-cols-2">{filteredArchivedEvents.map((event) => <ArchivedEventCard key={event.id} event={event} canRestore={can("event.delete")} canPermanentlyDelete={canPermanentlyDelete} restoring={restoringEventId === event.id} onRestore={() => confirm({ title: "Restaurar evento", description: "El evento volverá a aparecer en la categoría correspondiente a su estado actual. Su información histórica se conservará.", confirmLabel: "Restaurar evento", cancelLabel: "Cancelar", tone: "info", onConfirm: () => { setRestoringEventId(event.id); void archiveEvent(event.id, false).then(() => loadArchivedEvents()).catch((error) => notify({ title: "No se pudo restaurar el evento", description: error instanceof Error ? error.message : "Intenta nuevamente.", tone: "danger", icon: "alert" })).finally(() => setRestoringEventId(null)); } })} onPermanentDelete={() => requestPermanentDelete(event)} />)}</div> : <p className="mt-4 text-sm text-slate-400">No hay eventos archivados.</p>}
      </section>

      {permanentDeleteTarget ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="permanent-delete-title"><div className="surface-elevated w-full max-w-lg p-5"><h2 id="permanent-delete-title" className="text-lg font-semibold text-white">Eliminar evento permanentemente</h2><p className="mt-2 text-sm leading-6 text-slate-300">Esta acción no se puede deshacer. Se eliminarán los datos exclusivos de “{permanentDeleteTarget.name}”. Los archivos externos no se borrarán.</p><label className="mt-4 block text-sm text-slate-300" htmlFor="permanent-delete-phrase">Escribe <strong className="text-white">ELIMINAR</strong> para confirmar</label><input id="permanent-delete-phrase" value={permanentDeletePhrase} onChange={(event) => setPermanentDeletePhrase(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white" autoComplete="off" />{permanentDeleteError ? <p className="mt-2 text-sm text-rose-300">{permanentDeleteError}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPermanentDeleteTarget(null)} disabled={permanentDeleteLoading} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-3 text-sm text-white disabled:opacity-60">Cancelar</button><button type="button" onClick={() => void permanentlyDelete()} disabled={permanentDeletePhrase !== "ELIMINAR" || permanentDeleteLoading} className="inline-flex h-10 items-center rounded-xl bg-rose-500 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{permanentDeleteLoading ? "Eliminando…" : "Eliminar permanentemente"}</button></div></div></div> : null}

      {wizardOpen ? (
        <EventCreationWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreate={createEvent}
          organizationId={wizardOrganizationId}
          organizationTimezone={currentOrganization.timezone}
          venues={organizationVenues}
        />
      ) : null}

      {editorEvent ? (
        <EventEditorModal
          key={editorEvent.id}
          open={Boolean(editorEvent)}
          event={editorEvent}
          venues={organizationVenues}
          reservations={reservations}
          guests={guests}
          tables={tables}
          checkIns={checkIns}
          onClose={() => setEditorEventId(null)}
          onSave={createEvent}
          onPatchEvent={updateEvent}
          onPrepareEventPhysicalLayout={prepareEventPhysicalLayout}
        />
      ) : null}
    </div>
  );
}

function ArchivedEventCard({ event, canRestore, canPermanentlyDelete, restoring, onRestore, onPermanentDelete }: { event: ArchivedEvent; canRestore: boolean; canPermanentlyDelete: boolean; restoring: boolean; onRestore: () => void; onPermanentDelete: () => void }) {
  return <article className="surface-elevated flex flex-col gap-3 p-3 sm:p-4"><div className="flex items-start justify-between gap-3"><div><StatusBadge variant="warning">Archivado · {formatEventStatusLabel(event.status)}</StatusBadge><h3 className="mt-2 break-words text-lg font-semibold text-white">{event.name}</h3><p className="text-sm text-slate-400">{new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: event.timezone }).format(new Date(event.startAt))} · {event.venue}</p></div><div className="flex flex-wrap justify-end gap-2"><Link href={`/events/history/${event.id}`} className="inline-flex h-9 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white">Ver historial</Link>{canRestore ? <button type="button" disabled={restoring} onClick={onRestore} className="inline-flex h-9 items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm text-cyan-50 disabled:opacity-60">{restoring ? "Restaurando…" : "Restaurar evento"}</button> : null}{canPermanentlyDelete ? <button type="button" onClick={onPermanentDelete} className="inline-flex h-9 items-center rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 text-sm text-rose-100">Eliminar permanentemente</button> : null}</div></div><p className="text-xs text-slate-500">Los datos históricos, reportes y operaciones se conservan.</p></article>;
}

function LibrarySection({
  title,
  events,
  accent,
  currentEventId,
  currentEventAction,
  onSelectEvent,
  onEditEvent,
  onActivateEvent,
  onCancelEvent,
  onArchiveEvent,
  activatingEventId,
  canActivate,
  canEdit,
  canArchive,
}: {
  title: string;
  events: Event[];
  accent: "success" | "info" | "warning";
  currentEventId: string;
  currentEventAction: EventAction | null;
  onSelectEvent: (eventId: string) => void;
  onEditEvent: (event: Event) => void;
  onActivateEvent: (event: Event) => void;
  onCancelEvent: (event: Event) => void;
  onArchiveEvent: (event: Event) => void;
  activatingEventId: string | null;
  canActivate: boolean;
  canEdit: boolean;
  canArchive: boolean;
}) {
  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">{title}</p>
        </div>
        <StatusBadge variant={accent}>{events.length}</StatusBadge>
      </div>

      <div className="mt-3 grid gap-2.5 xl:grid-cols-2">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            current={event.id === currentEventId}
            currentEventAction={event.id === currentEventId && canEdit ? currentEventAction : null}
            onSelect={() => onSelectEvent(event.id)}
            onEditEvent={() => onEditEvent(event)}
            onActivateEvent={() => onActivateEvent(event)}
            onCancelEvent={onCancelEvent}
            onArchiveEvent={onArchiveEvent}
            activating={activatingEventId === event.id}
            canActivate={canActivate}
            canEdit={canEdit}
            canArchive={canArchive}
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
  onEditEvent,
  onActivateEvent,
  onCancelEvent,
  onArchiveEvent,
  activating,
  canActivate,
  canEdit,
  canArchive,
}: {
  event: Event;
  current: boolean;
  currentEventAction: EventAction | null;
  onSelect: () => void;
  onEditEvent: () => void;
  onActivateEvent: () => void;
  onCancelEvent: (event: Event) => void;
  onArchiveEvent: (event: Event) => void;
  activating: boolean;
  canActivate: boolean;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const venueLabel = event.venue?.trim() || "Venue no definido";

  return (
    <article
      className={`surface-elevated flex h-full flex-col gap-3 p-3 transition sm:p-4 ${
        current
          ? "border-cyan-400/50 bg-cyan-400/8 shadow-[0_0_0_1px_rgba(34,211,238,0.14)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={getEventStatusTone(event.status)}>{formatEventStatusLabel(event.status)}</StatusBadge>
          </div>

          <h3 className="break-words text-[1.05rem] font-semibold tracking-tight text-white sm:text-lg">{event.name}</h3>

          {event.description ? <p className="line-clamp-2 break-words text-sm leading-5 text-slate-400">{event.description}</p> : null}
        </div>

        {current ? <StatusBadge variant="info">En uso</StatusBadge> : null}
      </div>

      <div className="min-w-0 text-sm text-slate-300">
        <span className="text-slate-500">Venue</span>{" "}{venueLabel}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          {current ? null : (
            <button
              type="button"
              onClick={onSelect}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              Seleccionar
            </button>
          )}
          {canEdit ? (
            <button
              type="button"
              onClick={onEditEvent}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              Editar
            </button>
          ) : null}
          {(event.status === "draft" || event.status === "published") && canEdit ? <button type="button" onClick={() => onCancelEvent(event)} className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 text-sm font-medium text-rose-50">Cancelar evento</button> : null}
          {event.status === "finished" && canArchive ? <button type="button" onClick={() => onArchiveEvent(event)} className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-slate-200">Archivar evento</button> : null}
          {event.status === "published" && canActivate ? (
            <button
              type="button"
              disabled={activating}
              onClick={onActivateEvent}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              {activating ? "Activando…" : "Activar evento"}
            </button>
          ) : null}
          {current && currentEventAction ? (
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
      </div>
    </article>
  );
}
