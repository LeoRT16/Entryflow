import Topbar from "@/components/topbar";
import DashboardQuickActions from "@/components/dashboard-quick-actions";
import MetricCard from "@/components/metric-card";
import RecentReservationsTable from "@/components/recent-reservations-table";
import { recentReservations, summaryMetrics, todayEvent } from "@/lib/mock-data";

export default function Home() {
  const checkInProgress = Math.round(
    (todayEvent.checkedIn / todayEvent.expectedGuests) * 100,
  );

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Buenas noches"
        title="La Rota Carlota"
        primaryAction={{ label: "Nueva reserva", href: "/reservations" }}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              Evento de hoy
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {todayEvent.name}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {todayEvent.date} · Inicia a las {todayEvent.startsAt}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
              Ingresos en curso
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">
              {todayEvent.checkedIn} de {todayEvent.expectedGuests} invitados
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
            <p className="text-sm text-slate-400">Reservas</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {todayEvent.reservations}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
            <p className="text-sm text-slate-400">Invitados esperados</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {todayEvent.expectedGuests}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4">
            <p className="text-sm text-blue-200">Ingresados</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {todayEvent.checkedIn}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-400">Progreso de ingresos</span>
            <span className="font-medium text-white">{checkInProgress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${checkInProgress}%` }}
            />
          </div>
        </div>

        <div className="mt-6">
          <DashboardQuickActions />
        </div>
      </section>

      <RecentReservationsTable reservations={recentReservations} />
    </div>
  );
}
