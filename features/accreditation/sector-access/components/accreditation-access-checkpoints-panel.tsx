"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { AccreditationAccessCheckpoint, AccreditationAccessSector } from "@/features/accreditation/sector-access";

export default function AccreditationAccessCheckpointsPanel({
  eventId,
  checkpoints,
  sectors,
  canManage,
}: {
  eventId: string;
  checkpoints: AccreditationAccessCheckpoint[];
  sectors: AccreditationAccessSector[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") || "").trim(),
      code: String(form.get("code") || "").trim() || null,
      sectorId: String(form.get("sectorId") || "").trim(),
      status: String(form.get("status") || "active"),
    };
    if (!body.name || !body.sectorId) {
      showToast({ title: "Faltan datos", description: "El checkpoint necesita nombre y sector.", tone: "warning" });
      return;
    }
    setBusy(true);
    try {
      const url = editingId
        ? `/api/accreditation/events/${eventId}/checkpoints/${editingId}`
        : `/api/accreditation/events/${eventId}/checkpoints`;
      const response = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "No se pudo guardar el checkpoint.");
      showToast({ title: editingId ? "Checkpoint actualizado" : "Checkpoint creado", description: "El punto operativo quedó guardado.", tone: "success" });
      event.currentTarget.reset();
      setEditingId(null);
      router.refresh();
    } catch (error) {
      showToast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : "Ocurrió un error inesperado.", tone: "error" });
    } finally { setBusy(false); }
  }

  async function deactivate(id: string) {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/accreditation/events/${eventId}/checkpoints/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo desactivar el checkpoint.");
      router.refresh();
    } catch (error) {
      showToast({ title: "No se pudo desactivar", description: error instanceof Error ? error.message : "Ocurrió un error inesperado.", tone: "error" });
    } finally { setBusy(false); }
  }

  const sectorById = new Map(sectors.map((sector) => [sector.id, sector]));
  const editing = checkpoints.find((checkpoint) => checkpoint.id === editingId);

  return <section className="rounded-[1.8rem] border border-amber-400/15 bg-[#0d1117] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-300/70">Phase 3D</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Checkpoints operativos</h2><p className="mt-2 text-sm leading-6 text-slate-400">Cada punto físico apunta a un único sector. No crea entitlements ni modifica el check-in.</p></div><StatusBadge variant={canManage ? "success" : "warning"}>{canManage ? "Puede configurar" : "Solo lectura"}</StatusBadge></div>
    {canManage ? <form onSubmit={submit} className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.8fr_1fr_0.8fr_auto]"><input name="name" defaultValue={editing?.name ?? ""} key={editingId ?? "new"} placeholder="Nombre del checkpoint" className="surface-interactive w-full px-3 py-2" /><input name="code" defaultValue={editing?.code ?? ""} key={`code-${editingId ?? "new"}`} placeholder="Código opcional" className="surface-interactive w-full px-3 py-2" /><select name="sectorId" defaultValue={editing?.sectorId ?? ""} key={`sector-${editingId ?? "new"}`} className="surface-interactive w-full px-3 py-2"><option value="" disabled>Sector objetivo</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name} · {sector.code}</option>)}</select><select name="status" defaultValue={editing?.status ?? "active"} key={`status-${editingId ?? "new"}`} className="surface-interactive w-full px-3 py-2"><option value="active">Activo</option><option value="inactive">Inactivo</option></select><button type="submit" disabled={busy} className="inline-flex h-11 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 text-sm text-amber-50 disabled:opacity-60">{editingId ? "Guardar" : "Crear"}</button></form> : null}
    <div className="mt-5 space-y-2">{checkpoints.length ? checkpoints.map((checkpoint) => <div key={checkpoint.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"><div><p className="font-medium text-white">{checkpoint.name}{checkpoint.code ? ` · ${checkpoint.code}` : ""}</p><p className="mt-1 text-xs text-slate-500">Sector: {sectorById.get(checkpoint.sectorId)?.name ?? checkpoint.sectorId}</p></div><div className="flex items-center gap-2"><StatusBadge variant={checkpoint.status === "active" ? "success" : "warning"}>{checkpoint.status === "active" ? "ACTIVO" : "INACTIVO"}</StatusBadge>{canManage ? <><button type="button" onClick={() => setEditingId(checkpoint.id)} className="text-xs text-cyan-300">Editar</button>{checkpoint.status === "active" ? <button type="button" onClick={() => void deactivate(checkpoint.id)} className="text-xs text-amber-300">Desactivar</button> : null}</> : null}</div></div>) : <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">Todavía no hay checkpoints operativos.</p>}</div>
  </section>;
}
