"use client";

import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { useCheckInStore } from "@/services/workspace-service";
import PermissionGuard from "@/components/permission-guard";

function StatCard({
  label,
  value,
  hint,
  tone = "info",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses =
    tone === "danger"
      ? "border-rose-400/20 bg-rose-400/8"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/8"
        : tone === "success"
          ? "border-emerald-400/20 bg-emerald-400/8"
          : "border-cyan-400/20 bg-cyan-400/8";

  return (
    <div className={`surface-panel flex min-h-[108px] min-w-0 flex-col justify-between border ${toneClasses} p-4`}>
      <p className="kicker">{label}</p>
      <p className="min-w-0 break-words text-3xl font-semibold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-5 text-slate-400">{hint}</p> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses =
    tone === "danger"
      ? "border-rose-400/20 bg-rose-400/8 text-rose-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/8 text-amber-100"
        : tone === "success"
          ? "border-emerald-400/20 bg-emerald-400/8 text-emerald-100"
          : "border-cyan-400/20 bg-cyan-400/8 text-cyan-100";

  return (
    <div className={`rounded-[1.25rem] border p-4 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <StatusBadge variant={tone}>{tone === "danger" ? "Crítico" : tone === "warning" ? "Atención" : tone === "success" ? "Saludable" : "Info"}</StatusBadge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
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
  const statistics = workspaceIntelligence.statistics;
  const statisticsInsights = workspacePriority.byModule.Statistics;
  const health = workspaceIntelligence.health;
  const activity = workspaceIntelligence.activity;
  const prioritySummary = workspacePriority.summary;
  const commercial = statistics.commercial;

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

      <section className="surface-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Métricas canónicas</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Lectura analítica del evento</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Esta superficie resume el comportamiento del evento activo con los indicadores que ya alimentan el workspace.
            </p>
          </div>
          <StatusBadge variant="info">{statistics.metrics.length} métricas</StatusBadge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {statistics.metrics.map((metric) => (
            <MetricCard key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} tone={metric.tone} />
          ))}
        </div>
      </section>

      {commercial ? <section className="surface-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Valor comercial registrado</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Consolidado histórico</h2>
          </div>
          <p className="text-2xl font-semibold text-white">{commercial.currency} {commercial.totals.commercialValue.toLocaleString("es-BO")}</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Mesas", `${commercial.currency} ${commercial.mesa.value.toLocaleString("es-BO")}`],
            ["Preventa", `${commercial.currency} ${commercial.presale.value.toLocaleString("es-BO")}`],
            ["Manillas extra", `${commercial.currency} ${commercial.extraWristbands.value.toLocaleString("es-BO")}`],
            ["Cortesías", `${commercial.courtesy.people} personas`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-400">Personas registradas: {commercial.totals.registeredPeople}</p>
      </section> : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="surface-panel p-5">
          <p className="kicker">Lectura inteligente</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{health.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{health.description}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {health.modules.slice(0, 4).map((module) => (
              <div key={module.module} className="rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{module.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">{module.module}</p>
                  </div>
                  <StatusBadge variant={module.tone}>{module.state}</StatusBadge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">{module.detail}</p>
              </div>
            ))}
          </div>

          {health.blockers.length ? (
            <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
              <p className="kicker">Bloqueadores</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {health.blockers.map((blocker) => (
                  <span key={blocker} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                    {blocker}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="surface-panel p-5">
          <p className="kicker">Ritmo reciente</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Actividad y capacidad</h2>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Último ingreso</p>
              <p className="mt-2 text-lg font-semibold text-white">{statistics.cards.lastCheckInAt}</p>
              <p className="mt-1 text-sm text-slate-400">Marca el último movimiento de check-in del evento.</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Última reserva</p>
              <p className="mt-2 text-lg font-semibold text-white">{statistics.cards.lastReservationAt}</p>
              <p className="mt-1 text-sm text-slate-400">Ayuda a entender el ritmo de entrada de demanda.</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Pico de check-ins</p>
              <p className="mt-2 text-lg font-semibold text-white">{statistics.cards.peakCheckInMinute}</p>
              <p className="mt-1 text-sm text-slate-400">
                {statistics.cards.checkInsPerMinute} ingresos por minuto en promedio.
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Actividad reciente</p>
              <p className="mt-2 text-lg font-semibold text-white">{statistics.cards.recentActivity}</p>
              <p className="mt-1 text-sm text-slate-400">{statistics.cards.averageCheckInIntervalMinutes} min entre ingresos en promedio.</p>
            </div>
          </div>

          <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Operadores activos</p>
              <StatusBadge variant={statistics.cards.activeOperators.length ? "success" : "info"}>
                {statistics.cards.activeOperators.length}
              </StatusBadge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {statistics.cards.activeOperators.length ? (
                statistics.cards.activeOperators.map((operator) => (
                  <span key={operator} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                    {operator}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400">No se registraron operadores activos.</span>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {statisticsInsights.length ? (
              statisticsInsights.map((item) => (
                <div key={item.id} className="rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
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
                No hay señales de foco activas.
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
