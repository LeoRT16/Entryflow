"use client";

import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import ModuleGuard from "@/components/module-guard";
import PermissionGuard from "@/components/permission-guard";
import { GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import { useCheckInStore } from "@/services/workspace-service";
import TimelineFeed from "@/features/timeline/components/timeline-feed";

export default function TimelinePage() {
  const { workspaceIntelligence, workspacePriority } = useCheckInStore();
  const events = workspacePriority.recentChanges;
  const summary = workspaceIntelligence.timeline.summary;
  const timelineInsights = workspacePriority.byModule.Timeline;
  const health = workspaceIntelligence.health;
  const activity = workspaceIntelligence.activity;
  const priority = workspacePriority;
  const guidedActions = timelineInsights.slice(0, 3).map((item) =>
    buildGuidedActionItem(item, {
      href: item.route,
      impact: item.description,
    }),
  );

  return (
    <PermissionGuard permission="timeline.view">
      <ModuleGuard module="activity">
        <div className="space-y-6">
          <Topbar
            eyebrow="Actividad operativa"
            title="Línea de tiempo"
            description="Seguimiento en tiempo real de las acciones compartidas entre Reservas, Invitados, Ingreso, Resumen y Recursos."
          />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Eventos" value={`${summary.total}`} tone="info" detail="Entradas sincronizadas" />
            <SummaryCard label="Ingresos" value={`${summary.checkedIn}`} tone="success" detail="Ingresos registrados" />
            <SummaryCard label="Alertas" value={`${summary.alerts}`} tone="warning" detail="Intentos bloqueados o inválidos" />
            <SummaryCard label="Último evento" value={summary.latest} tone="info" detail="Hora más reciente" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Lectura operativa</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{health.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{priority.summary.message}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Críticos" value={`${priority.summary.critical}`} tone="danger" detail={priority.summary.nextBestAction} />
                <SummaryCard label="Atención" value={`${priority.summary.attention}`} tone="warning" detail={priority.summary.canIgnore} />
                <SummaryCard label="Actividad" value={activity.recentWindow} tone="info" detail={activity.lastActivity} />
                <SummaryCard label="Capacidad" value={`${workspaceIntelligence.capacity.occupancyPercent}%`} tone="warning" detail={workspaceIntelligence.capacity.summary} />
              </div>
            </div>

            <GuidedActionPanel
              title="Siguiente paso"
              description="Las acciones se priorizan por el cambio que más aporta al flujo operativo."
              items={guidedActions}
              className="rounded-[2rem] border border-white/10 bg-slate-950/40"
            />

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Cambios relevantes</p>
              <div className="mt-4 space-y-3">
                {timelineInsights.length ? (
                  timelineInsights.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-400">{item.description}</p>
                          <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.module} · {item.route}</p>
                        </div>
                        <StatusBadge variant={item.tone}>{item.priority}</StatusBadge>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
                    No hay recomendaciones activas.
                  </div>
                )}
              </div>
            </div>
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
      <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-2xl font-semibold ${toneClasses}`}>
        {value}
      </p>
      <p className="mt-3 text-sm text-slate-400">{detail}</p>
    </article>
  );
}
