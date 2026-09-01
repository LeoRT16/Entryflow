"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import { deriveAccreditationSectorPresence } from "@/features/accreditation/sector-access";
import type { AccreditationAccessSector, AccreditationSectorMovement, AccreditationSectorAccessAttemptSource } from "@/features/accreditation/sector-access";

export default function AccreditationSectorAccessMovementPanel({
  eventId,
  sectors,
  movements,
  canOperate,
}: {
  eventId: string;
  sectors: AccreditationAccessSector[];
  movements: AccreditationSectorMovement[];
  canOperate: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const presence = deriveAccreditationSectorPresence(movements);
  const insideCount = (sectorId: string) => presence.filter((item) => item.sectorId === sectorId && item.inside).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canOperate || busy) return;
    const form = new FormData(event.currentTarget);
    const credential = String(form.get("credential") || "").trim();
    const sectorId = String(form.get("sectorId") || "").trim();
    const movement = String(form.get("movement") || "entry");
    const source = String(form.get("source") || "manual_code") as AccreditationSectorAccessAttemptSource;
    if (!credential || !sectorId) {
      showToast({ title: "Faltan datos", description: "Ingresá una credencial y elegí un sector.", tone: "warning" });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/accreditation/events/${eventId}/sector-access/movements`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential, sectorId, movement, source }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: { status?: string; inside?: boolean }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "No se pudo registrar el movimiento.");
      const status = payload?.result?.status;
      showToast({ title: status === "denied" ? "Entrada denegada" : status === "already_inside" || status === "already_outside" ? "Sin cambios" : "Movimiento registrado", description: status?.replaceAll("_", " ") || "Listo.", tone: status === "denied" ? "warning" : "success" });
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      showToast({ title: "No se pudo registrar", description: error instanceof Error ? error.message : "Ocurrió un error inesperado.", tone: "error" });
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-[1.8rem] border border-emerald-400/15 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">Phase 3C</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Entrada y salida por sector</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Registra movimientos sin modificar el check-in de evento. La ocupación es informativa.</p></div>
        <StatusBadge variant={canOperate ? "success" : "warning"}>{canOperate ? "Puede operar" : "Solo lectura"}</StatusBadge>
      </div>
      {canOperate ? <form onSubmit={submit} className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto]">
        <input name="credential" placeholder="Código o QR exacto" className="surface-interactive w-full px-3 py-2" />
        <select name="sectorId" defaultValue="" className="surface-interactive w-full px-3 py-2"><option value="" disabled>Elegí un sector</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name} · {sector.code}</option>)}</select>
        <select name="movement" defaultValue="entry" className="surface-interactive w-full px-3 py-2"><option value="entry">Entrada</option><option value="exit">Salida</option></select>
        <select name="source" defaultValue="manual_code" className="surface-interactive w-full px-3 py-2"><option value="qr">QR</option><option value="manual_code">Código</option><option value="manual_operator">Operador</option></select>
        <button type="submit" disabled={busy} className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-50 transition hover:bg-emerald-400/15 disabled:opacity-60">{busy ? "Registrando..." : "Registrar"}</button>
      </form> : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sectors.map((sector) => <div key={sector.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"><p className="font-medium text-white">{sector.name}</p><p className="mt-1 text-xs text-slate-500">Dentro: {insideCount(sector.id)}{sector.capacity == null ? " · capacidad no definida" : ` · capacidad ${sector.capacity} (informativa)`}</p></div>)}</div>
      <div className="mt-6"><p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Historial de movimientos</p><div className="mt-3 space-y-2">{movements.length ? movements.slice(0, 12).map((movement) => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm"><div><p className="font-medium text-white">{movement.credentialReference} · {movement.sectorReference}</p><p className="mt-1 text-xs text-slate-500">{movement.movement === "entry" ? "Entrada" : "Salida"} · {new Date(movement.movedAt).toLocaleString()}</p></div><StatusBadge variant={movement.movement === "entry" ? "success" : "info"}>{movement.movement === "entry" ? "DENTRO" : "FUERA"}</StatusBadge></div>) : <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">Todavía no hay movimientos para este evento.</p>}</div></div>
    </section>
  );
}
