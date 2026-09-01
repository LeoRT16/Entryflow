"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type {
  AccreditationAccessSector,
  AccreditationSectorAccessAttempt,
  AccreditationSectorAccessAttemptSource,
  AccreditationAccessCheckpoint,
} from "@/features/accreditation/sector-access";
import type { AccreditationEventDay } from "@/features/accreditation/festival";

function requestJson(input: RequestInfo | URL, init: RequestInit) {
  return fetch(input, init).then(async (response) => {
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message || "No se pudo completar la operación.");
    }

    return payload;
  });
}

function sourceLabel(source: AccreditationSectorAccessAttemptSource) {
  return { qr: "QR", manual_code: "Código", manual_operator: "Operador" }[source];
}

function reasonLabel(reason?: string) {
  return reason?.replaceAll("_", " ") || "Permitido";
}

export default function AccreditationSectorAccessEvaluationPanel({
  eventId,
  sectors,
  checkpoints,
  eventDays,
  attempts,
  canEvaluate,
}: {
  eventId: string;
  sectors: AccreditationAccessSector[];
  checkpoints: AccreditationAccessCheckpoint[];
  eventDays?: AccreditationEventDay[];
  attempts: AccreditationSectorAccessAttempt[];
  canEvaluate: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEvaluate || busy) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const credential = String(form.get("credential") || "").trim();
    const checkpointId = String(form.get("checkpointId") || "").trim();
    const eventDayId = String(form.get("eventDayId") || "").trim();
    const source = String(form.get("source") || "manual_code");

    if (!credential || !checkpointId || (eventDays?.length && !eventDayId)) {
      showToast({ title: "Faltan datos", description: "Ingresá una credencial y elegí un sector.", tone: "warning" });
      return;
    }

    setBusy(true);

    try {
      const payload = await requestJson(`/api/accreditation/events/${eventId}/sector-access/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, checkpointId, eventDayId: eventDayId || undefined, source }),
      });
      const decision = (payload as { decision?: { allowed?: boolean; reason?: string } } | null)?.decision;

      showToast({
        title: decision?.allowed ? "Acceso permitido" : "Acceso denegado",
        description: decision?.allowed ? "La credencial tiene entitlement activo para el sector." : `Motivo: ${reasonLabel(decision?.reason)}.`,
        tone: decision?.allowed ? "success" : "warning",
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo evaluar",
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[1.8rem] border border-cyan-400/15 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-300/70">Phase 3B</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Evaluación de acceso</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Evalúa una credencial existente para un sector y guarda el resultado como historial. No realiza check-in de evento.
          </p>
        </div>
        <StatusBadge variant={canEvaluate ? "success" : "warning"}>{canEvaluate ? "Puede evaluar" : "Solo lectura"}</StatusBadge>
      </div>

      {canEvaluate ? (
        <form onSubmit={handleSubmit} className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto]">
          <input name="credential" placeholder="Código o QR exacto" className="surface-interactive w-full px-3 py-2" />
          {eventDays?.length ? <select name="eventDayId" defaultValue="" className="surface-interactive w-full px-3 py-2"><option value="" disabled>Elegí el día</option>{eventDays.filter((day) => day.status === "active").map((day) => <option key={day.id} value={day.id}>Día {day.dayNumber} · {day.name}</option>)}</select> : null}
          <select name="checkpointId" defaultValue="" className="surface-interactive w-full px-3 py-2">
            <option value="" disabled>Elegí un checkpoint</option>
            {checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name} · {sectors.find((sector) => sector.id === checkpoint.sectorId)?.name ?? checkpoint.sectorId}</option>)}
          </select>
          <select name="source" defaultValue="manual_code" className="surface-interactive w-full px-3 py-2">
            <option value="qr">QR</option>
            <option value="manual_code">Código</option>
            <option value="manual_operator">Operador</option>
          </select>
          <button type="submit" disabled={busy} className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Evaluando..." : "Evaluar acceso"}
          </button>
        </form>
      ) : null}

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Historial</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Últimas evaluaciones</h3>
          </div>
          <span className="text-xs text-slate-500">{attempts.length} registros</span>
        </div>
        <div className="mt-3 space-y-2">
          {attempts.length ? attempts.slice(0, 12).map((attempt) => (
            <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-white">{attempt.credentialReference} · {attempt.sectorReference}</p>
                <p className="mt-1 text-xs text-slate-500">{sourceLabel(attempt.source)} · {new Date(attempt.evaluatedAt).toLocaleString()}</p>
              </div>
              <StatusBadge variant={attempt.decision === "allow" ? "success" : "danger"}>{attempt.decision === "allow" ? "ALLOW" : `DENY · ${reasonLabel(attempt.denialReason)}`}</StatusBadge>
            </div>
          )) : <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">Todavía no hay evaluaciones para este evento.</p>}
        </div>
      </div>
    </section>
  );
}
