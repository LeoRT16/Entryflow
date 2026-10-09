"use client";

import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { useCheckInStore } from "@/services/workspace-service";
import PermissionGuard from "@/components/permission-guard";
import { buildStatisticsViewModel, displayMoney } from "@/features/reporting/domain/statistics-view-model";
import { formatTime, formatTimestamp } from "@/lib/date-time";

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
  const { eventReport, workspaceIntelligence, workspacePriority, currentEvent } = useCheckInStore();
  const reportStatistics = buildStatisticsViewModel(eventReport, workspaceIntelligence);
  const statistics = workspaceIntelligence.statistics;
  const summary = eventReport.summary;
  const attention = buildStatisticsAttention(workspacePriority.allItems, reportStatistics, summary, statistics.cards.checkInsPerMinute);
  const formatStatTime = (value: string) => value.includes("T") ? formatTimestamp(value, currentEvent.timezone) : value;
  const formatPeakTime = (value: string) => value.includes("T") ? formatTime(value, currentEvent.timezone) : value;
  const formatRate = (value: number) => value === 0 ? "0/min" : value < 1 ? `${value.toLocaleString("es-BO", { maximumFractionDigits: 3 })}/min` : `${value}/min`;

  return (
    <div className="space-y-5">
      <Topbar title="Estadísticas" description="Métricas operativas y comerciales del evento activo." compact />
      <section className="surface-panel p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="kicker">Resumen del evento</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Lectura operativa</h2></div><StatusBadge variant="info">{summary.operationalPeople} personas</StatusBadge></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <CompactStat label="Personas operativas" value={summary.operationalPeople} detail="En reservas activas" />
          <CompactStat label="Ingresados" value={summary.checkedInPeople} detail="Accesos confirmados" tone="success" />
          <CompactStat label="Pendientes" value={summary.pendingPeople} detail="Por ingresar" tone="warning" />
          <CompactStat label="Reservas activas" value={summary.activeReservations} detail="En operación" />
          <CompactStat label="Capacidad" value={`${reportStatistics.capacity.capacityAssigned}/${reportStatistics.capacity.physicalCapacity}`} detail={`${reportStatistics.capacity.capacityRemaining} disponibles · ${reportStatistics.capacity.occupancyPercent}%`} />
        </div>
      </section>
      <section className="surface-panel p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="kicker">Comercial</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Resumen comercial</h2><p className="mt-1 text-sm text-slate-400">Valores registrados para el evento activo.</p></div><p className="text-xl font-semibold text-white">{displayMoney(reportStatistics.commercial.total)}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Mesas", displayMoney(reportStatistics.commercial.mesas.value)], ["Preventa", displayMoney(reportStatistics.commercial.presales.value)], ["Manillas extra", displayMoney(reportStatistics.commercial.extraWristbands.value)], ["Cortesías", `${reportStatistics.commercial.courtesies.people} personas`]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>)}</div></section>
      <section className="surface-panel p-4 sm:p-5"><div><p className="kicker">Ingreso y ritmo</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Flujo de admisión</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><CompactStat label="Último ingreso" value={formatStatTime(statistics.cards.lastCheckInAt)} detail="Último ingreso registrado" /><CompactStat label="Check-ins por minuto" value={formatRate(statistics.cards.checkInsPerMinute)} detail="Promedio de ingresos registrados" /><CompactStat label="Intervalo promedio" value={`${statistics.cards.averageCheckInIntervalMinutes} min`} detail="Promedio entre ingresos registrados" /><CompactStat label="Pico de ingresos" value={formatPeakTime(statistics.cards.peakCheckInMinute)} detail="Mayor concentración de ingresos" /></div></section>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><div className="surface-panel p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="kicker">Distribución</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Ocupación física</h2></div><StatusBadge variant="info">{reportStatistics.capacity.occupancyPercent}%</StatusBadge></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{reportStatistics.resources.map((resource) => <div key={resource.resourceId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><p className="truncate text-sm font-medium text-white">{resource.resourceName}</p><p className="mt-1 text-xs text-slate-500">{resource.sectorName ?? "Sin zona"}</p><p className="mt-2 text-sm text-slate-300">{resource.capacityAssigned}/{resource.physicalCapacity} ocupados</p><p className="text-xs text-slate-500">{resource.capacityRemaining} disponibles{resource.extraWristbands ? ` · ${resource.extraWristbands} extras` : ""}</p></div>)}</div></div><div className="surface-panel p-4 sm:p-5"><div><p className="kicker">Atención</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Excepciones operativas</h2></div>{attention.length ? <div className="mt-4 space-y-2">{attention.map((item) => <div key={item.id} className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3"><p className="text-sm font-medium text-white">{item.title}</p><p className="mt-1 text-sm leading-5 text-slate-400">{item.description}</p></div>)}</div> : <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-100">Sin alertas operativas.</p>}</div></section>
    </div>
  );
}

function buildStatisticsAttention(items: Array<{ id: string; title: string; description: string; requiresAction: boolean; priority: string; blocking?: boolean }>, reportStatistics: ReturnType<typeof buildStatisticsViewModel>, summary: { pendingPeople: number }, checkInsPerMinute: number) {
  const result: Array<{ id: string; title: string; description: string }> = [];
  const seen = new Set<string>();
  const clean = (value: string) => value.replace(/Work(?:space)/g, "la operación").replace(/Oper(?:ations)/g, "Operaciones");
  const add = (id: string, title: string, description: string) => { if (!seen.has(id)) { seen.add(id); result.push({ id, title: clean(title), description: clean(description) }); } };
  const overCapacity = reportStatistics.resources.filter((resource) => resource.capacityAssigned > resource.physicalCapacity);
  if (overCapacity.length) add("capacity-over", "Mesa sobreocupada", `${overCapacity.length} recurso${overCapacity.length === 1 ? " supera" : "s superan"} su capacidad física.`);
  const flowStopped = summary.pendingPeople > 0 && checkInsPerMinute === 0;
  for (const item of items.filter((item) => item.requiresAction && (item.blocking || item.priority === "critical" || item.priority === "high"))) {
    if (item.title === "Capacidad alta" || item.title === "Mesa sobreocupada" || item.title === "Check-in detenido" || item.title === "Puerta congestionada" || item.title === "Actividad detenida") continue;
    add(item.id, item.title, item.description);
  }
  if (flowStopped && !result.some((item) => item.id === "admission-flow")) add("admission-flow", "Invitados pendientes de ingreso", `${summary.pendingPeople} personas siguen pendientes de ingreso.`);
  return result.slice(0, 6);
}

function CompactStat({ label, value, detail, tone = "info" }: { label: string; value: string | number; detail: string; tone?: "info" | "success" | "warning" }) {
  const color = tone === "success" ? "text-emerald-100" : tone === "warning" ? "text-amber-100" : "text-white";
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><p className="kicker">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${color}`}>{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>;
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
