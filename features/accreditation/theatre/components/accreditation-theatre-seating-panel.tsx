"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { TheatreSeat, TheatreSeatAssignment } from "@/features/accreditation/theatre/types";

type Participant = { id: string; name: string };

export default function AccreditationTheatreSeatingPanel({
  eventId,
  seats,
  assignments,
  participants,
  canManage,
}: {
  eventId: string;
  seats: TheatreSeat[];
  assignments: TheatreSeatAssignment[];
  participants: Participant[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const activeAssignments = assignments.filter((assignment) => !assignment.releasedAt);
  const assignmentBySeat = new Map(activeAssignments.map((assignment) => [assignment.seatId, assignment]));
  const participantById = new Map(participants.map((participant) => [participant.id, participant.name]));

  async function submit(path: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos completar la operación.");
      showToast({ title: success, description: "El estado operativo quedó actualizado.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({ title: "No se pudo completar", description: error instanceof Error ? error.message : "Ocurrió un error inesperado.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-[1.8rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Teatro</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Asientos asignados</h2>
          <p className="mt-2 text-sm text-slate-400">Estructura compacta por sección, fila y número. La admisión continúa usando la credencial existente.</p>
        </div>
        <StatusBadge variant="info">{activeAssignments.length}/{seats.length} asignados</StatusBadge>
      </div>

      {canManage ? (
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void submit(`/api/accreditation/events/${eventId}/theatre-seats`, { section: String(data.get("section") || "").trim(), rowLabel: String(data.get("rowLabel") || "").trim(), seatLabels: String(data.get("seatLabels") || "").split(",").map((value) => value.trim()).filter(Boolean) }, "Asientos creados"); event.currentTarget.reset(); }}>
            <p className="text-sm font-semibold text-white">Crear fila</p>
            <input name="section" placeholder="Sección (opcional)" className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600" />
            <input name="rowLabel" placeholder="Fila A" required className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600" />
            <input name="seatLabels" placeholder="1, 2, 3, 4" required className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600" />
            <button disabled={busy} className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-50 disabled:opacity-50">Crear asientos</button>
          </form>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void submit(`/api/accreditation/events/${eventId}/theatre-seat-assignments`, { seatId: data.get("seatId"), enrollmentId: data.get("enrollmentId"), accessGrantId: data.get("accessGrantId") || undefined }, "Asiento asignado"); }}>
            <p className="text-sm font-semibold text-white">Asignar a participante</p>
            <select name="enrollmentId" required className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"><option value="">Participante</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select>
            <select name="seatId" required className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"><option value="">Asiento disponible</option>{seats.filter((seat) => seat.status === "active" && !assignmentBySeat.has(seat.id)).map((seat) => <option key={seat.id} value={seat.id}>{seat.section ? `${seat.section} · ` : ""}{seat.rowLabel} · {seat.seatLabel}</option>)}</select>
            <button disabled={busy} className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-50 disabled:opacity-50">Asignar asiento</button>
          </form>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {seats.map((seat) => {
          const assignment = assignmentBySeat.get(seat.id);
          return <div key={seat.id} className={`rounded-xl border p-3 ${assignment ? "border-emerald-400/20 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.03]"}`}><div className="flex items-center justify-between gap-2"><p className="font-medium text-white">{seat.section ? `${seat.section} · ` : ""}{seat.rowLabel} · {seat.seatLabel}</p><StatusBadge variant={seat.status === "active" ? assignment ? "success" : "info" : "warning"}>{seat.status === "active" ? assignment ? "Asignado" : "Libre" : "Inactivo"}</StatusBadge></div>{assignment ? <p className="mt-2 text-xs text-slate-400">{participantById.get(assignment.enrollmentId) || "Participante"}</p> : null}</div>;
        })}
      </div>
      {!seats.length ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Todavía no hay asientos configurados.</p> : null}
    </section>
  );
}
