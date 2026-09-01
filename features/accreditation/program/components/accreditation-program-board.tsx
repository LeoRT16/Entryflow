"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { AccreditationProgramDateGroup, AccreditationProgramReadModel, AccreditationProgramSessionDisplay } from "@/features/accreditation/program";
import {
  formatAccreditationProgramDateTimeInput,
  resolveAccreditationProgramDateTimeIso,
} from "@/features/accreditation/program";

type SessionMutationPayload = {
  title: string;
  description?: string;
  sessionType?: string;
  startsAt: string;
  endsAt: string;
  room?: string;
  capacity?: number;
  metadata?: Record<string, unknown>;
};

function SummaryTile({
  label,
  value,
  tone = "info",
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses = {
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-50",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-50",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-50",
    info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-50",
  }[tone];

  return (
    <div className={`rounded-[1.5rem] border p-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function getRequestString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getRequestNumber(value: FormDataEntryValue | null) {
  const text = getRequestString(value);

  if (!text) {
    return undefined;
  }

  const numberValue = Number(text);

  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : NaN;
}

function buildMutationPayload(formData: FormData, timeZone: string): SessionMutationPayload {
  const startsAtLocal = getRequestString(formData.get("startsAt"));
  const endsAtLocal = getRequestString(formData.get("endsAt"));
  const startsAt = resolveAccreditationProgramDateTimeIso(startsAtLocal, timeZone);
  const endsAt = resolveAccreditationProgramDateTimeIso(endsAtLocal, timeZone);

  return {
    title: getRequestString(formData.get("title")),
    description: getRequestString(formData.get("description")),
    sessionType: getRequestString(formData.get("sessionType")),
    startsAt,
    endsAt,
    room: getRequestString(formData.get("room")),
    capacity: getRequestNumber(formData.get("capacity")),
  };
}

function buildEditablePayload(session: AccreditationProgramSessionDisplay, timeZone: string) {
  return {
    title: session.title,
    description: session.description ?? "",
    sessionType: session.sessionType,
    startsAt: formatAccreditationProgramDateTimeInput(session.startsAt, timeZone),
    endsAt: formatAccreditationProgramDateTimeInput(session.endsAt, timeZone),
    room: session.room ?? "",
    capacity: session.capacity?.toString() ?? "",
  };
}

async function sendSessionMutation(input: RequestInfo | URL, init: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || "No se pudo completar la operación.");
  }

  return payload;
}

function SessionFormFields({
  timeZone,
  defaultValues,
}: {
  timeZone: string;
  defaultValues?: {
    title?: string;
    description?: string;
    sessionType?: string;
    startsAt?: string;
    endsAt?: string;
    room?: string;
    capacity?: string;
  };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 md:col-span-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Título</span>
        <input name="title" defaultValue={defaultValues?.title} className="surface-interactive w-full px-3 py-2" />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Tipo</span>
        <select name="sessionType" defaultValue={defaultValues?.sessionType ?? "other"} className="surface-interactive w-full px-3 py-2">
          <option value="keynote">Keynote</option>
          <option value="talk">Charla</option>
          <option value="panel">Panel</option>
          <option value="workshop">Taller</option>
          <option value="break">Pausa</option>
          <option value="networking">Networking</option>
          <option value="other">Otro</option>
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Sala / lugar</span>
        <input name="room" defaultValue={defaultValues?.room} className="surface-interactive w-full px-3 py-2" />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Inicio</span>
        <input name="startsAt" type="datetime-local" defaultValue={defaultValues?.startsAt} className="surface-interactive w-full px-3 py-2" />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Fin</span>
        <input name="endsAt" type="datetime-local" defaultValue={defaultValues?.endsAt} className="surface-interactive w-full px-3 py-2" />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Capacidad</span>
        <input name="capacity" type="number" min="0" step="1" defaultValue={defaultValues?.capacity} className="surface-interactive w-full px-3 py-2" />
      </label>
      <label className="space-y-2 md:col-span-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Descripción</span>
        <textarea name="description" rows={3} defaultValue={defaultValues?.description} className="surface-interactive w-full px-3 py-2" />
      </label>
      <p className="md:col-span-2 text-xs text-slate-500">Las horas se interpretan y se muestran en {timeZone}.</p>
    </div>
  );
}

function SessionCard({
  eventId,
  timeZone,
  session,
  canManageProgram,
}: {
  eventId: string;
  timeZone: string;
  session: AccreditationProgramSessionDisplay;
  canManageProgram: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const saveSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageProgram || isSaving) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = buildMutationPayload(formData, timeZone);

    if (!payload.title || !payload.startsAt || !payload.endsAt) {
      showToast({ title: "Faltan datos", description: "La sesión necesita título, inicio y fin.", tone: "warning" });
      return;
    }

    setIsSaving(true);
    try {
      await sendSessionMutation(`/api/accreditation/events/${eventId}/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setIsEditing(false);
      showToast({ title: "Sesión actualizada", description: "Los cambios quedaron guardados.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo actualizar",
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelSession = async () => {
    if (!canManageProgram || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await sendSessionMutation(`/api/accreditation/events/${eventId}/sessions/${session.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      showToast({ title: "Sesión cancelada", description: "La sesión quedó preservada en historial.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo cancelar",
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight text-white">{session.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge variant="info">{session.sessionTypeLabel}</StatusBadge>
            <StatusBadge variant={session.lifecycleState === "in_progress" ? "success" : session.lifecycleState === "cancelled" ? "danger" : "warning"}>
              {session.lifecycleStateLabel}
            </StatusBadge>
            <StatusBadge variant={session.status === "active" ? "success" : "warning"}>{session.statusLabel}</StatusBadge>
          </div>
        </div>
        <div className="text-right text-sm text-slate-400">
          <p>{session.timeRangeLabel}</p>
          <p>{session.roomLabel}</p>
          {session.capacityLabel ? <p>{session.capacityLabel}</p> : null}
        </div>
      </div>

      {session.description ? <p className="mt-3 text-sm leading-6 text-slate-400">{session.description}</p> : null}

      {canManageProgram ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsEditing((value) => !value)}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white"
          >
            {isEditing ? "Cerrar edición" : "Editar"}
          </button>
          <button
            type="button"
            onClick={cancelSession}
            disabled={isSaving || session.status === "cancelled"}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 text-sm font-medium text-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {session.status === "cancelled" ? "Cancelada" : isSaving ? "Cancelando..." : "Cancelar"}
          </button>
        </div>
      ) : null}

      {canManageProgram && isEditing ? (
        <form onSubmit={saveSession} className="mt-4 space-y-4 rounded-[1.4rem] border border-white/10 bg-slate-950/50 p-4">
          <SessionFormFields
            timeZone={timeZone}
            defaultValues={buildEditablePayload(session, timeZone)}
          />
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function DateGroupSection({
  eventId,
  timeZone,
  group,
  canManageProgram,
}: {
  eventId: string;
  timeZone: string;
  group: AccreditationProgramDateGroup;
  canManageProgram: boolean;
}) {
  return (
    <section className="space-y-3 rounded-[1.6rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Fecha</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{group.dateLabel}</h3>
        </div>
        <StatusBadge variant="info">{group.sessions.length} sesiones</StatusBadge>
      </div>

      <div className="space-y-3">
        {group.sessions.map((session) => (
          <SessionCard
            key={session.id}
            eventId={eventId}
            timeZone={timeZone}
            session={session}
            canManageProgram={canManageProgram}
          />
        ))}
      </div>
    </section>
  );
}

export default function AccreditationProgramBoard({
  eventId,
  eventTimezone,
  model,
  canManageProgram,
}: {
  eventId: string;
  eventTimezone: string;
  model: AccreditationProgramReadModel;
  canManageProgram: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageProgram || isCreating) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = buildMutationPayload(formData, eventTimezone);

    if (!payload.title || !payload.startsAt || !payload.endsAt) {
      showToast({ title: "Faltan datos", description: "La sesión necesita título, inicio y fin.", tone: "warning" });
      return;
    }

    setIsCreating(true);
    try {
      await sendSessionMutation(`/api/accreditation/events/${eventId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      event.currentTarget.reset();
      showToast({ title: "Sesión creada", description: "La sesión quedó registrada en el programa.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo crear",
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        tone: "error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Sesiones" value={model.summary.total} tone="info" />
        <SummaryTile label="Programadas" value={model.summary.upcoming} tone="warning" />
        <SummaryTile label="En curso" value={model.summary.inProgress} tone="success" />
        <SummaryTile label="Canceladas" value={model.summary.cancelled} tone="danger" />
      </div>

      {canManageProgram ? (
        <section className="rounded-[1.6rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Nueva sesión</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Crear bloque de programa</h2>
            </div>
            <StatusBadge variant="info">Agenda</StatusBadge>
          </div>

          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <SessionFormFields timeZone={eventTimezone} />
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Creando..." : "Crear sesión"}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-[1.6rem] border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-50">
          Solo lectura. No tenés permiso para crear, editar o cancelar sesiones desde esta vista.
        </section>
      )}

      {model.dateGroups.length ? (
        <div className="space-y-4">
          {model.dateGroups.map((group) => (
            <DateGroupSection key={group.dateKey} eventId={eventId} timeZone={eventTimezone} group={group} canManageProgram={canManageProgram} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Sin programa</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Todavía no hay sesiones programadas para este evento.</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Cuando agregues sesiones de Festival, Concierto, Corporativo, Conferencia, Seminario, Teatro o Taller, aparecerán aquí agrupadas por fecha y ordenadas cronológicamente.
          </p>
        </div>
      )}
    </section>
  );
}
