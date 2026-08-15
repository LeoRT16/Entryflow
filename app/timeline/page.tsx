"use client";

import Topbar from "@/components/topbar";
import ModuleGuard from "@/components/module-guard";
import PermissionGuard from "@/components/permission-guard";
import TimelineFeed from "@/features/timeline/components/timeline-feed";
import { useCheckInStore } from "@/services/workspace-service";

export default function TimelinePage() {
  const { workspaceIntelligence, workspacePriority } = useCheckInStore();
  const summary = workspaceIntelligence.timeline.summary;
  const events = workspacePriority.recentChanges;

  return (
    <PermissionGuard permission="timeline.view">
      <ModuleGuard module="activity">
        <div className="space-y-6">
          <Topbar
            eyebrow="Actividad"
            title="Actividad"
            description="Cronología en tiempo real de los cambios operativos del evento activo."
          />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Eventos" value={`${summary.total}`} tone="info" detail="Entradas sincronizadas" />
            <SummaryCard label="Ingresos" value={`${summary.checkedIn}`} tone="success" detail="Ingresos registrados" />
            <SummaryCard label="Alertas" value={`${summary.alerts}`} tone="warning" detail="Intentos bloqueados o inválidos" />
            <SummaryCard label="Último evento" value={summary.latest} tone="info" detail="Hora más reciente" />
          </section>

          <TimelineFeed events={events} />
        </div>
      </ModuleGuard>
    </PermissionGuard>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
  detail: string;
}) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
          : "border-sky-400/20 bg-sky-400/10 text-sky-100";

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-2xl font-semibold ${toneClasses}`}>{value}</p>
      <p className="mt-3 text-sm text-slate-400">{detail}</p>
    </article>
  );
}
