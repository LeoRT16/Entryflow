"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";

import DashboardQuickActions from "@/components/dashboard-quick-actions";
import StatusBadge from "@/components/status-badge";
import TimelineFeed from "@/features/timeline/components/timeline-feed";
import { isModuleEnabled } from "@/features/events/domain";
import { buildLiveDashboardModel } from "@/features/events/domain/live-dashboard";
import { useCheckInStore } from "@/services/workspace-service";

function sectionToneClass(tone: "success" | "warning" | "danger" | "info") {
  if (tone === "success") return "border-emerald-400/15 bg-emerald-400/8";
  if (tone === "warning") return "border-amber-400/15 bg-amber-400/8";
  if (tone === "danger") return "border-rose-400/15 bg-rose-400/8";
  return "border-sky-400/15 bg-sky-400/8";
}

function valueToneClass(tone: "success" | "warning" | "danger" | "info") {
  if (tone === "success") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  if (tone === "danger") return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  return "border-sky-400/20 bg-sky-400/10 text-sky-100";
}

function metricTone(tone: "success" | "warning" | "danger" | "info") {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "danger") return "danger";
  return "info";
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-2 text-sm text-slate-400">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function KpiCard({
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
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-lg font-semibold ${valueToneClass(tone)}`}>{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
    </article>
  );
}

function LiveAlertCard({
  id,
  title,
  description,
  tone,
  source,
  route,
  reservationName,
  tableName,
}: {
  id: string;
  title: string;
  description: string;
  tone: "success" | "warning" | "danger" | "info";
  source: string;
  route: string;
  reservationName?: string;
  tableName?: string;
}) {
  return (
    <Link
      href={route}
      id={id}
      className={`block rounded-2xl border p-4 transition hover:bg-white/[0.06] ${sectionToneClass(tone)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={metricTone(tone)}>{title}</StatusBadge>
            <StatusBadge variant="info">{source}</StatusBadge>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {reservationName ? <StatusBadge variant="info">{reservationName}</StatusBadge> : null}
            {tableName ? <StatusBadge variant="success">{tableName}</StatusBadge> : null}
          </div>
        </div>
        <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-white">
          Abrir
        </span>
      </div>
    </Link>
  );
}

export default function EventCommandCenter() {
  const { currentOrganization, currentEvent, reservationSummaries, workspaceIntelligence, workspacePriority, status, setEventStatus } = useCheckInStore();

  const model = useMemo(
    () =>
      buildLiveDashboardModel({
        currentOrganizationName: currentOrganization.name,
        currentEvent,
        workspaceStatus: status,
        workspaceIntelligence,
        workspacePriority,
        reservationSummaries,
      }),
    [currentEvent, currentOrganization.name, reservationSummaries, status, workspaceIntelligence, workspacePriority],
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(15,23,42,0.96)_54%,rgba(11,15,20,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-100/70">Event Command Center</p>
            <h1 className="mt-3 truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl">{model.header.eventName}</h1>
            <p className="mt-3 text-sm font-medium text-slate-300 sm:text-base">
              {model.header.eventType} · {model.header.organizationName} · {model.header.venue}
            </p>
            <p className="mt-2 text-sm text-slate-400 sm:text-[0.95rem]">
              {model.header.timestampLabel} · {currentEvent.capacity > 0 ? `${currentEvent.capacity} cupos` : "Sin límite"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge variant={metricTone(model.header.liveTone)}>{model.header.liveLabel}</StatusBadge>
              <StatusBadge variant={metricTone(model.header.liveTone)}>{model.header.statusLabel}</StatusBadge>
              {isModuleEnabled(currentEvent, "resources") ? <StatusBadge variant="warning">Recursos activos</StatusBadge> : null}
              {isModuleEnabled(currentEvent, "analytics") ? <StatusBadge variant="info">Analítica lista</StatusBadge> : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            {currentEvent.status !== "finished" ? (
              <button
                type="button"
                onClick={() => setEventStatus(currentEvent.id, "finished")}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
              >
                Cerrar evento
              </button>
            ) : null}
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Siguiente paso</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-300">{model.header.nextAction}</p>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-300 text-left lg:text-right">{model.header.summary}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Atención inmediata"
          title="Alertas operativas"
          description="Solo aparecen señales que requieren intervención ahora."
        />
        <div className="mt-5 space-y-3">
          {model.alerts.length ? (
            model.alerts.map((alert) => (
              <LiveAlertCard key={alert.id} {...alert} />
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
              Operación estable. No hay incidencias abiertas.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} tone={kpi.tone} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <section className={`rounded-[2rem] border p-5 sm:p-6 ${sectionToneClass(model.capacity.state === "blocked" ? "danger" : model.capacity.state === "watch" ? "warning" : "success")}`}>
          <SectionHeader
            eyebrow="Admisión"
            title="Flujo y throughput"
            description="Evalúa la velocidad de ingreso y si la cola está creciendo."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <KpiCard
              label="Check-ins/min"
              value={`${model.admission.checkInsPerMinute}`}
              detail="Velocidad reciente de ingreso"
              tone={model.admission.checkInsPerMinute > 0 ? "success" : "info"}
            />
            <KpiCard
              label="Intervalo medio"
              value={`${model.admission.averageCheckInIntervalMinutes} min`}
              detail="Tiempo promedio entre check-ins"
              tone={model.admission.averageCheckInIntervalMinutes > 0 ? "info" : "success"}
            />
            <KpiCard
              label="Cola pendiente"
              value={`${model.admission.pendingQueue}`}
              detail="Invitados aún sin ingresar"
              tone={model.admission.pendingQueue > 0 ? "warning" : "success"}
            />
            <KpiCard
              label="Señales bloqueadas"
              value={`${model.admission.blockedSignals}`}
              detail={`${model.admission.recentCheckIns} eventos recientes de ingreso`}
              tone={model.admission.blockedSignals > 0 ? "danger" : "success"}
            />
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-300">{model.admission.summary}</p>
        </section>

        <section className={`rounded-[2rem] border p-5 sm:p-6 ${sectionToneClass(model.capacity.state === "blocked" ? "danger" : model.capacity.state === "watch" ? "warning" : "success")}`}>
          <SectionHeader
            eyebrow="Capacidad"
            title="Presión de ocupación"
            description="Usa los datos reales de recursos del evento activo."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <KpiCard
              label="Ocupación"
              value={`${model.capacity.used}/${model.capacity.total}`}
              detail={`${model.capacity.occupancyPercent}% de ocupación`}
              tone={model.capacity.state === "blocked" ? "danger" : model.capacity.state === "watch" ? "warning" : "info"}
            />
            <KpiCard
              label="Disponibles"
              value={`${model.capacity.remaining}`}
              detail="Cupos restantes en mesas activas"
              tone={model.capacity.remaining > 0 ? "success" : "warning"}
            />
            <KpiCard
              label="Estado"
              value={model.capacity.state === "blocked" ? "Crítico" : model.capacity.state === "watch" ? "Vigilancia" : "Estable"}
              detail={model.capacity.summary}
              tone={model.capacity.state === "blocked" ? "danger" : model.capacity.state === "watch" ? "warning" : "success"}
            />
            <KpiCard
              label="Umbral"
              value={`${model.capacity.occupancyPercent}%`}
              detail={model.capacity.occupancyPercent >= 90 ? "En o sobre el límite crítico" : model.capacity.occupancyPercent >= 80 ? "Cerca del límite configurado" : "Todavía con margen"}
              tone={model.capacity.occupancyPercent >= 90 ? "danger" : model.capacity.occupancyPercent >= 80 ? "warning" : "success"}
            />
          </div>
        </section>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Acciones rápidas"
          title="Siguiente gesto operativo"
          description="El scanner se mantiene como la primera acción visible del operador."
        />
        <div className="mt-5">
          <DashboardQuickActions />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <SectionHeader
            eyebrow="Actividad viva"
            title="Reciente"
            description="Timeline compacto de check-ins, cambios de reservas y eventos relevantes."
          />
          <div className="mt-5">
            <TimelineFeed events={model.recentActivity} />
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <SectionHeader
            eyebrow="Pendientes"
            title="Próximas reservas"
            description="Solo las reservas que todavía importan operativamente."
          />
          <div className="mt-5 space-y-3">
            {model.upcomingReservations.length ? (
              model.upcomingReservations.map((reservation) => (
                <Link
                  key={reservation.id}
                  href="/reservations"
                  className="block rounded-2xl border border-white/10 bg-[#0f151d] p-4 transition hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge variant={metricTone(reservation.tone)}>{reservation.time}</StatusBadge>
                        <StatusBadge variant="info">{reservation.code}</StatusBadge>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-white">{reservation.name}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {reservation.tableName} · {reservation.guestCount} invitados · {reservation.checkedInGuests} ingresados · {reservation.pendingGuests} pendientes
                      </p>
                    </div>
                    <span className="inline-flex rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-200">
                      {reservation.status}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
                No hay reservas pendientes para mostrar.
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
