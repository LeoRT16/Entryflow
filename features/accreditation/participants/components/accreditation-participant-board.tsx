"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { AccreditationParticipantOperationalReadModel } from "@/features/accreditation/participants";
import AccreditationParticipantFormFields from "./accreditation-participant-form-fields";
import AccreditationParticipantRow from "./accreditation-participant-row";

function SummaryCard({
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

async function sendParticipantMutation(
  input: RequestInfo | URL,
  init: RequestInit,
) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || "No se pudo completar la operación.");
  }

  return payload;
}

function buildParticipantBody(formData: FormData) {
  const stringValue = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  return {
    name: stringValue("name"),
    email: stringValue("email"),
    phone: stringValue("phone"),
    categoryId: stringValue("categoryId"),
    company: stringValue("company"),
    jobTitle: stringValue("jobTitle"),
    badgeName: stringValue("badgeName"),
    participantRole: stringValue("participantRole"),
  };
}

export default function AccreditationParticipantBoard({
  eventId,
  categories,
  model,
  canManageParticipants,
}: {
  eventId: string;
  categories: Array<{ id: string; name: string }>;
  model: AccreditationParticipantOperationalReadModel;
  canManageParticipants: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageParticipants || isCreating) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const body = buildParticipantBody(formData);

    if (!body.name) {
      showToast({
        title: "Falta el nombre",
        description: "La inscripción necesita al menos un nombre.",
        tone: "warning",
      });
      return;
    }

    setIsCreating(true);
    try {
      await sendParticipantMutation(`/api/accreditation/events/${eventId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      showToast({
        title: "Participante creado",
        description: "La inscripción de acreditación quedó registrada.",
        tone: "success",
      });
      event.currentTarget.reset();
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
        <SummaryCard label="Participantes" value={model.summary.total} tone="info" />
        <SummaryCard label="Activos" value={model.summary.active} tone="success" />
        <SummaryCard label="Cancelados" value={model.summary.cancelled} tone="warning" />
        <SummaryCard label="Ingresados" value={model.summary.checkedIn} tone="success" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Credenciales activas" value={model.summary.credentialActive} />
        <SummaryCard label="Credenciales revocadas" value={model.summary.credentialRevoked} tone="danger" />
        <SummaryCard label="Sin acceso" value={model.summary.credentialMissing} tone="warning" />
        <SummaryCard label="Invitados con envíos" value={model.summary.invited} />
      </div>

      {canManageParticipants ? (
        <section className="rounded-[1.6rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Nuevo participante</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Crear inscripción individual</h2>
            </div>
            <StatusBadge variant="info">Operación individual</StatusBadge>
          </div>

          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <AccreditationParticipantFormFields categories={categories} />
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-50 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Creando..." : "Crear inscripción"}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-[1.6rem] border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-50">
          Solo lectura. No tenés permiso para crear, editar o cancelar participantes desde esta vista.
        </section>
      )}

      {model.rows.length ? (
        <div className="space-y-3">
          {model.rows.map((row) => (
            <AccreditationParticipantRow key={row.enrollmentId} eventId={eventId} categories={categories} row={row} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Sin participantes</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Todavía no hay inscripciones para este evento.</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Cuando agregues participantes de Festival, Concierto, Corporativo, Conferencia, Seminario, Teatro o Taller, aparecerán aquí con su perfil, credencial, invitación e ingreso.
          </p>
        </div>
      )}
    </section>
  );
}
