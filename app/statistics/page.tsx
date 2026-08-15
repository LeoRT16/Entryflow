"use client";

import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import { useCheckInStore } from "@/services/workspace-service";
import PermissionGuard from "@/components/permission-guard";

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="surface-panel flex min-h-[108px] min-w-0 flex-col justify-between p-4">
      <p className="kicker">{label}</p>
      <p className="min-w-0 break-words text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

export default function StatisticsPage() {
  const { status, error } = useCheckInStore();

  if (status === "loading") {
    return (
      <StateShell title="Cargando estadísticas" description="Estamos reuniendo las métricas del evento activo." />
    );
  }

  if (status === "error") {
    return (
      <StateShell
        title="No pudimos cargar estadísticas"
        description={error?.message ?? "Reintentá la carga desde Supabase."}
        actionLabel="Reintentar"
      />
    );
  }

  return (
    <PermissionGuard permission="statistics.view">
      <StatisticsContent />
    </PermissionGuard>
  );
}

function StatisticsContent() {
  const { workspaceIntelligence, workspacePriority, tableSummaries } = useCheckInStore();

  const currentEventSummary = workspaceIntelligence.dashboard.currentEventSummary;
  const tableInsight = workspaceIntelligence.tables;
  const dashboard = workspaceIntelligence.dashboard;
  const occupancy = tableInsight.occupancyPercent;
  const statisticsInsights = workspacePriority.byModule.Statistics;
  const health = workspaceIntelligence.health;
  const activity = workspaceIntelligence.activity;
  const prioritySummary = workspacePriority.summary;
  const guidedActions = statisticsInsights.slice(0, 3).map((item) =>
    buildGuidedActionItem(item, {
      href: item.route,
      impact: item.description,
    }),
  );

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Estadísticas"
        title="Estadísticas"
        description={`Métricas operativas del evento activo: ${dashboard.currentEvent.name}.`}
        primaryAction={{ label: "Ir al dashboard", href: "/" }}
        secondaryAction={{ label: "Ver timeline", href: "/timeline" }}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Críticos"
          value={prioritySummary.critical}
        />
        <StatCard
          label="Atención"
          value={prioritySummary.attention}
        />
        <StatCard
          label="Eventos recientes"
          value={activity.recentEvents}
        />
        <StatCard
          label="Estables"
          value={prioritySummary.healthy}
        />
      </section>

      <GuidedActionPanel
        title="Recomendaciones"
        description="Las recomendaciones operativas se ordenan por el impacto inmediato que tienen sobre la operación."
        items={guidedActions}
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="surface-panel p-5">
          <p className="kicker">Lectura inteligente</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{health.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{health.description}</p>
        </div>

        <div className="surface-panel p-5">
          <p className="kicker">Recomendaciones</p>
          <div className="mt-4 space-y-3">
            {statisticsInsights.length ? (
              statisticsInsights.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{item.description}</p>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          {item.module} · {item.route}
                        </p>
                    </div>
                    <StatusBadge variant={item.tone}>{item.priority}</StatusBadge>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
                No hay recomendaciones activas.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="surface-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="kicker">Capacidad operativa</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Distribución del evento</h2>
            </div>
            <StatusBadge variant="info">{occupancy}%</StatusBadge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {tableSummaries.slice(0, 4).map((table) => (
              <div key={table.id} className="rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
                <p className="text-sm font-medium text-white">{table.name}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">{table.status}</p>
                <p className="mt-3 text-sm text-slate-300">
                  {table.metrics.assignedGuests}/{table.capacity} ocupados
                </p>
                <p className="mt-1 text-xs text-slate-500">Restantes: {table.metrics.capacityRemaining}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel p-5">
          <p className="kicker">Estado del dashboard</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Resumen operativo vivo</h2>

          <div className="mt-5 space-y-3">
            {[
              ["Reservas", currentEventSummary.reservations],
              ["Invitados", currentEventSummary.expectedGuests],
              ["Ingresados", currentEventSummary.checkedIn],
              ["Pendientes", currentEventSummary.pending],
              ["Atención", workspaceIntelligence.dashboard.summaryMetrics.find((item) => item.label === "Atención")?.value ?? "0"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <span className="text-sm text-slate-300">{label}</span>
                <span className="text-sm font-semibold text-white">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StateShell({
  title,
  description,
  actionLabel,
}: {
  title: string;
  description: string;
  actionLabel?: string;
}) {
  return (
    <div className="space-y-6">
      <Topbar eyebrow="Estadísticas" title={title} description={description} />
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm text-slate-300">{description}</p>
        {actionLabel ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </div>
  );
}
