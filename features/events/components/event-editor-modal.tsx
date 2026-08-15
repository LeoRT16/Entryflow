"use client";

import { useEffect, useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { Event, Venue } from "@/features/domain/types";
import { getEventTypeLabel, isTerminalEventStatus } from "@/features/events/domain";

type EventEditorModalProps = {
  open: boolean;
  event: Event;
  venues: Venue[];
  onClose: () => void;
  onSave: (event: Event) => Promise<Event | undefined>;
};

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

export default function EventEditorModal({ open, event, venues, onClose, onSave }: EventEditorModalProps) {
  const { showToast } = useFeedback();
  const [isSaving, setIsSaving] = useState(false);

  const venueOptions = useMemo(() => venues.filter((venue) => venue.organizationId === event.organizationId), [event.organizationId, venues]);
  const defaultVenue = useMemo(() => venueOptions.find((venue) => venue.status === "active") ?? venueOptions[0] ?? null, [venueOptions]);
  const matchedVenue = useMemo(
    () => venueOptions.find((venue) => venue.id === event.venueId) ?? venueOptions.find((venue) => venue.name === event.venue),
    [event.venue, event.venueId, venueOptions],
  );
  const canEditEvent = !isTerminalEventStatus(event.status);
  const [eventName, setEventName] = useState(event.name);
  const [eventVenueId, setEventVenueId] = useState(event.venueId ?? matchedVenue?.id ?? defaultVenue?.id ?? "");
  const [eventVenue, setEventVenue] = useState(event.venue);
  const [eventDescription, setEventDescription] = useState(event.description ?? "");
  const [eventCapacity, setEventCapacity] = useState(String(event.capacity));
  const [eventStartAt, setEventStartAt] = useState(event.startAt);
  const [eventStatus, setEventStatus] = useState(event.status);

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

  const submit = async () => {
    const selectedVenue = venueOptions.find((venue) => venue.id === eventVenueId) ?? defaultVenue;
    const nextEvent: Event = {
      ...event,
      name: eventName.trim() || event.name,
      venueId: selectedVenue?.id || eventVenueId || undefined,
      venue: selectedVenue?.name || eventVenue.trim() || event.venue,
      description: eventDescription.trim() || undefined,
      capacity: Number.parseInt(eventCapacity, 10) || event.capacity,
      startAt: eventStartAt,
      status: eventStatus,
    };

    setIsSaving(true);
    try {
      const savedEvent = await onSave(nextEvent);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-[#08111f] p-5 shadow-[0_40px_140px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
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

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
              {event.venue} · {event.capacity} personas
            </p>
            <p className="mt-1 text-xs text-slate-500">La edición del evento ya no vive en Ajustes.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
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
  );
}
