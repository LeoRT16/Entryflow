"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { AccreditationEventDay } from "@/features/accreditation/festival";

export default function AccreditationFestivalDayPanel({
  eventId,
  days,
  canManage,
}: {
  eventId: string;
  days: AccreditationEventDay[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function createDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    const data = new FormData(event.currentTarget);
    const body = { dayNumber: Number(data.get("dayNumber")), name: String(data.get("name") || "").trim(), eventDate: String(data.get("eventDate") || "") };
    setBusy(true);
    try {
      const response = await fetch(`/api/accreditation/events/${eventId}/days`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos crear el día.");
      showToast({ title: "Día creado", description: "El día quedó disponible para la operación del Festival.", tone: "success" });
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      showToast({ title: "No se pudo crear", description: error instanceof Error ? error.message : "Ocurrió un error inesperado.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-[1.8rem] border border-amber-400/15 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-300/70">Festival</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Días del evento</h2><p className="mt-2 text-sm text-slate-400">Un solo evento con días operativos explícitos. Las credenciales no se duplican.</p></div><StatusBadge variant={days.length ? "success" : "warning"}>{days.length} días</StatusBadge></div>{canManage ? <form onSubmit={createDay} className="mt-4 grid gap-3 md:grid-cols-[0.5fr_1.4fr_1fr_auto]"><input name="dayNumber" type="number" min="1" placeholder="#" required className="surface-interactive w-full px-3 py-2" /><input name="name" placeholder="Viernes · apertura" required className="surface-interactive w-full px-3 py-2" /><input name="eventDate" type="date" required className="surface-interactive w-full px-3 py-2" /><button disabled={busy} className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-50 disabled:opacity-50">Agregar día</button></form> : null}<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{days.map((day) => <div key={day.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium text-white">Día {day.dayNumber} · {day.name}</p><StatusBadge variant={day.status === "active" ? "success" : "warning"}>{day.status === "active" ? "Activo" : "Inactivo"}</StatusBadge></div><p className="mt-2 text-xs text-slate-500">{day.eventDate}</p></div>)}</div></section>;
}
