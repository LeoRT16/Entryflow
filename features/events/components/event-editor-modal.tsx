"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { Event, Venue } from "@/features/domain/types";
import {
  buildInvitationArtworkLabel,
  buildInvitationArtworkStoragePath,
  getEventInvitationArtwork,
  getEventInvitationArtworkBucket,
  mergeEventInvitationArtworkMetadata,
  validateInvitationArtworkUpload,
  type EventInvitationArtwork,
} from "@/features/events/domain/invitation-artwork";
import InvitationOverlayEditor from "@/features/events/components/invitation-overlay-editor";
import {
  getDefaultInvitationOverlayLayout,
  getEventInvitationOverlayLayout,
  mergeEventInvitationOverlayLayoutMetadata,
  type InvitationOverlayLayout,
} from "@/features/events/domain/invitation-overlay";
import { getEventTypeLabel, isTerminalEventStatus } from "@/features/events/domain";
import { buildEventVenueChangeConfirmation, shouldWarnBeforeChangingEventVenue } from "@/features/events/domain/event-venue-assignment";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CheckIn } from "@/features/check-in/types";
import type { Guest } from "@/features/check-in/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";

type EventEditorModalProps = {
  open: boolean;
  event: Event;
  venues: Venue[];
  reservations: ReservationRecord[];
  guests: Guest[];
  tables: TableRecord[];
  checkIns: CheckIn[];
  onClose: () => void;
  onSave: (event: Event) => Promise<Event | undefined>;
  onPatchEvent?: (event: Event) => Promise<Event | undefined>;
};

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    const previewUrl = URL.createObjectURL(file);

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(previewUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new Error("No pudimos leer la imagen seleccionada."));
    };

    image.src = previewUrl;
  });
}

function Field({
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

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-28 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}

export default function EventEditorModal({
  open,
  event,
  venues,
  reservations,
  guests,
  tables,
  checkIns,
  onClose,
  onSave,
  onPatchEvent,
}: EventEditorModalProps) {
  const { showToast, confirm } = useFeedback();
  const [isSaving, setIsSaving] = useState(false);
  const [isArtworkBusy, setIsArtworkBusy] = useState(false);
  const [eventArtwork, setEventArtwork] = useState<EventInvitationArtwork | null>(() => getEventInvitationArtwork(event));
  const [eventOverlayLayout, setEventOverlayLayout] = useState<InvitationOverlayLayout | null>(() => getEventInvitationOverlayLayout(event));
  const [overlayEditorOpen, setOverlayEditorOpen] = useState(false);
  const artworkInputRef = useRef<HTMLInputElement | null>(null);

  const venueOptions = useMemo(() => venues, [venues]);
  const defaultVenue = useMemo(() => venueOptions.find((venue) => venue.status === "active") ?? venueOptions[0] ?? null, [venueOptions]);
  const matchedVenue = useMemo(
    () => venueOptions.find((venue) => venue.id === event.venueId) ?? venueOptions.find((venue) => venue.name === event.venue),
    [event.venue, event.venueId, venueOptions],
  );
  const initialVenueId = event.venueId ?? matchedVenue?.id ?? defaultVenue?.id ?? "";
  const initialVenueIdRef = useRef(initialVenueId);
  const canEditEvent = !isTerminalEventStatus(event.status);
  const [eventName, setEventName] = useState(event.name);
  const [eventVenueId, setEventVenueId] = useState(initialVenueId);
  const [eventVenue, setEventVenue] = useState(event.venue);
  const [eventDescription, setEventDescription] = useState(event.description ?? "");
  const [eventCapacity, setEventCapacity] = useState(String(event.capacity));
  const [eventStartAt, setEventStartAt] = useState(event.startAt);
  const [eventStatus, setEventStatus] = useState(event.status);
  const pendingVenueEventRef = useRef<Event | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        keyboardEvent.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const persistEvent = onPatchEvent ?? onSave;
  const buildNextMetadata = (nextArtwork: EventInvitationArtwork | null = eventArtwork, nextOverlayLayout: InvitationOverlayLayout | null = eventOverlayLayout) =>
    mergeEventInvitationOverlayLayoutMetadata(
      mergeEventInvitationArtworkMetadata(event.metadata, nextArtwork),
      nextOverlayLayout,
    );

  const saveEvent = async (nextEvent: Event) => {
    setIsSaving(true);
    try {
      const savedEvent = await persistEvent(nextEvent);

      if (!savedEvent) {
        return;
      }

      showToast({
        title: "Evento actualizado",
        description: `${nextEvent.name} quedó sincronizado en Eventos.`,
        tone: "success",
      });
      onClose();
    } catch (error) {
      showToast({
        title: "No pudimos guardar el evento",
        description: error instanceof Error ? error.message : "Revisá la conexión con Supabase.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const commitPendingVenueChange = () => {
    const nextEvent = pendingVenueEventRef.current;
    pendingVenueEventRef.current = null;

    if (!nextEvent) {
      return;
    }

    void saveEvent(nextEvent);
  };

  const submit = async () => {
    const selectedVenue = venueOptions.find((venue) => venue.id === eventVenueId) ?? defaultVenue;
    const nextVenueId = selectedVenue?.id || eventVenueId || undefined;
    const nextEvent: Event = {
      ...event,
      name: eventName.trim() || event.name,
      venueId: nextVenueId,
      venue: selectedVenue?.name || eventVenue.trim() || event.venue,
      description: eventDescription.trim() || undefined,
      capacity: Number.parseInt(eventCapacity, 10) || event.capacity,
      startAt: eventStartAt,
      status: eventStatus,
      metadata: buildNextMetadata(),
    };

    const shouldWarn = shouldWarnBeforeChangingEventVenue({
      eventId: event.id,
      currentVenueId: event.venueId,
      nextVenueId,
      reservations,
      guests,
      tables,
      checkIns,
    });

    if (shouldWarn) {
      pendingVenueEventRef.current = nextEvent;
      const confirmation = buildEventVenueChangeConfirmation({
        eventName: nextEvent.name,
        currentVenueName: event.venue,
        nextVenueName: nextEvent.venue,
      });

      confirm({
        ...confirmation,
        onConfirm: commitPendingVenueChange,
        onCancel: () => {
          pendingVenueEventRef.current = null;
          setEventVenueId(initialVenueIdRef.current);
        },
      });
      return;
    }

    await saveEvent(nextEvent);
  };

  const handleArtworkFile = async (file: File | null) => {
    if (!canEditEvent || !file) {
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      showToast({
        title: "Supabase no está listo",
        description: "Falta la configuración de almacenamiento para cargar el arte de invitación.",
        tone: "error",
      });
      return;
    }

    setIsArtworkBusy(true);
    try {
      const { width, height } = await readImageDimensions(file);

      const validation = validateInvitationArtworkUpload({
        width,
        height,
        mimeType: file.type,
        size: file.size,
      });

      if (!validation.ok) {
        showToast({
          title: validation.message.includes("pesa") ? "Imagen demasiado pesada" : validation.message.includes("JPG") ? "Formato no compatible" : "Resolución insuficiente",
          description: validation.message,
          tone: "warning",
        });
        return;
      }

      const storagePath = buildInvitationArtworkStoragePath({
        organizationId: event.organizationId,
        eventId: event.id,
        fileName: file.name,
        mimeType: file.type,
      });
      const { error: uploadError } = await client.storage.from(getEventInvitationArtworkBucket()).upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = client.storage.from(getEventInvitationArtworkBucket()).getPublicUrl(storagePath);
      const nextArtwork: EventInvitationArtwork = {
        path: storagePath,
        url: publicUrlData.publicUrl,
        fileName: file.name,
        mimeType: file.type,
        width,
        height,
        size: file.size,
        label: buildInvitationArtworkLabel(file.name, eventName.trim() || event.name),
        updatedAt: new Date().toISOString(),
      };
      const nextEvent: Event = {
        ...event,
        metadata: buildNextMetadata(nextArtwork),
      };
      const savedEvent = await persistEvent(nextEvent);

      if (!savedEvent) {
        return;
      }

      setEventArtwork(nextArtwork);
      showToast({
        title: "Arte de invitación actualizado",
        description: "El evento ya usa la nueva pieza visual.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "No pudimos cargar el arte",
        description: error instanceof Error ? error.message : "Revisá el bucket y la policy de Supabase Storage.",
        tone: "error",
      });
    } finally {
      setIsArtworkBusy(false);
      if (artworkInputRef.current) {
        artworkInputRef.current.value = "";
      }
    }
  };

  const handleArtworkRemove = async () => {
    if (!canEditEvent || isArtworkBusy || !eventArtwork) {
      return;
    }

    setIsArtworkBusy(true);

    try {
      const nextEvent: Event = {
        ...event,
        metadata: buildNextMetadata(null),
      };
      const savedEvent = await persistEvent(nextEvent);

      if (!savedEvent) {
        return;
      }

      setEventArtwork(null);
      showToast({
        title: "Arte de invitación eliminado",
        description: "La invitación volvió al estilo base del evento.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "No pudimos quitar el arte",
        description: error instanceof Error ? error.message : "Revisá el bucket y la policy de Supabase Storage.",
        tone: "error",
      });
    } finally {
      setIsArtworkBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#08111f] p-5 shadow-[0_40px_140px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="shrink-0 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Eventos</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Editar evento</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Ajusta la configuración propia del evento sin salir de la biblioteca.
            </p>
          </div>

          <StatusBadge variant={canEditEvent ? "info" : "warning"}>{getEventTypeLabel(event.eventType)}</StatusBadge>
        </div>

        {canEditEvent ? null : (
          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            Este evento está cerrado y permanece en modo lectura.
          </div>
        )}

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del evento" value={eventName} onChange={setEventName} placeholder="Evento principal" disabled={!canEditEvent} />
            <Field label="Fecha y hora" value={eventStartAt} onChange={setEventStartAt} type="datetime-local" disabled={!canEditEvent} />
            <Field label="Capacidad" value={eventCapacity} onChange={setEventCapacity} placeholder="800" type="number" disabled={!canEditEvent} />
            {venueOptions.length ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Espacio del evento</span>
                <select
                  value={eventVenueId}
                  disabled={!canEditEvent}
                  onChange={(changeEvent) => setEventVenueId(changeEvent.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                >
                  {venueOptions.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Field
                label="Espacio del evento"
                value={eventVenue}
                onChange={setEventVenue}
                placeholder="Sala, club o espacio"
                disabled={!canEditEvent}
              />
            )}
          </div>

          <div className="mt-4">
            <TextArea
              label="Descripción"
              value={eventDescription}
              onChange={setEventDescription}
              placeholder="Contexto operativo del evento"
              disabled={!canEditEvent}
            />
          </div>

          <section className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Arte de invitación</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Sube la pieza visual del evento desde este editor. Se guarda junto al evento y se reutiliza en la invitación real.
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Formatos admitidos: JPG, PNG o WEBP. Tamaño máximo: 8 MB. Resolución mínima: 720 × 1280 px. Recomendado: 1080 × 1920 px.
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {eventOverlayLayout ? "Layout de sobreimpresión listo para guardar." : "La invitación usará el layout base hasta que ajustes los bloques."}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => artworkInputRef.current?.click()}
                  disabled={!canEditEvent || isArtworkBusy}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {eventArtwork ? "Reemplazar arte" : "Subir arte"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleArtworkRemove()}
                  disabled={!canEditEvent || isArtworkBusy || !eventArtwork}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isArtworkBusy && eventArtwork ? "Actualizando..." : "Quitar arte"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEventOverlayLayout((current) => current ?? getDefaultInvitationOverlayLayout());
                    setOverlayEditorOpen((current) => !current);
                  }}
                  disabled={!canEditEvent}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-fuchsia-400/25 bg-fuchsia-400/10 px-4 text-sm font-medium text-fuchsia-50 transition hover:bg-fuchsia-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {overlayEditorOpen ? "Ocultar ajuste" : "Ajustar datos"}
                </button>
              </div>
            </div>

            <input
              ref={artworkInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={!canEditEvent || isArtworkBusy}
              onChange={(changeEvent) => {
                const file = changeEvent.target.files?.[0] ?? null;
                void handleArtworkFile(file);
              }}
            />

            <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03]">
              {eventArtwork?.url ? (
                <div className="relative aspect-[16/9] w-full overflow-hidden">
                  <img src={eventArtwork.url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
                      {eventArtwork.label ?? buildInvitationArtworkLabel(eventArtwork.fileName, event.name)}
                    </p>
                    <p className="mt-2 text-sm text-slate-200">
                      {eventArtwork.width}x{eventArtwork.height}px · {(eventArtwork.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-40 items-center justify-center px-6 py-8 text-sm leading-6 text-slate-400">
                  Todavía no hay arte cargado para este evento.
                </div>
              )}
            </div>
          </section>

          {overlayEditorOpen ? (
            <div className="mt-4 min-h-0 overflow-x-hidden">
              <InvitationOverlayEditor
                eventName={event.name}
                eventStartAt={eventStartAt}
                eventVenue={matchedVenue?.name ?? defaultVenue?.name ?? (eventVenue.trim() || event.venue)}
                eventTimezone={event.timezone}
                artworkUrl={eventArtwork?.url}
                layout={eventOverlayLayout ?? getDefaultInvitationOverlayLayout()}
                onChange={setEventOverlayLayout}
              />
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Estado del evento</span>
              <select
                value={eventStatus}
                disabled={!canEditEvent}
                onChange={(changeEvent) => setEventStatus(changeEvent.target.value as Event["status"])}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Contexto</p>
              <p className="mt-2 text-sm text-slate-300">
                {matchedVenue?.name ?? defaultVenue?.name ?? event.venue} · {event.capacity} personas
              </p>
              <p className="mt-1 text-xs text-slate-500">La edición del evento ya no vive en Ajustes.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 shrink-0 border-t border-white/10 bg-[#08111f] pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Cancelar
            </button>

            {canEditEvent ? (
              <button
                type="button"
                onClick={submit}
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                {isSaving ? "Guardando..." : "Guardar cambios"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
