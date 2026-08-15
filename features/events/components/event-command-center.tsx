"use client";

import Link from "next/link";
import { useMemo } from "react";

import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { isTerminalEventStatus } from "@/features/events/domain";
import { buildLiveDashboardModel } from "@/features/events/domain/live-dashboard";
import { useCheckInStore } from "@/services/workspace-service";

function toneToVariant(tone: "success" | "warning" | "danger" | "info") {
  return tone;
}

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

function getReservationStatusLabel(status: string) {
  if (status === "Confirmed") return "Confirmada";
  if (status === "Checked In") return "Ingresada";
  if (status === "Pending") return "Pendiente";
  if (status === "Completed") return "Completada";
  if (status === "Cancelled") return "Cancelada";
  if (status === "No Show") return "No asistió";
  if (status === "Draft") return "Borrador";
  return status;
}

function getReservationStatusTone(status: string) {
  if (status === "Confirmed" || status === "Checked In" || status === "Completed") return "success";
  if (status === "Pending") return "warning";
  if (status === "Cancelled" || status === "No Show") return "danger";
  return "info";
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <article className={`rounded-2xl border p-4 ${valueToneClass(tone)}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </article>
  );
}

function PreviewHeader({
  title,
  action,
}: {
  title: string;
  action: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
      </div>
      <Link
        href={action.href}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        {action.label}
      </Link>
    </div>
  );
}

function ActivityEntry({
  tone,
  href,
  timestamp,
  title,
  description,
}: {
  tone: "success" | "warning" | "danger" | "info";
  href: string;
  timestamp: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-white/10 bg-[#0f151d] p-4 transition hover:bg-white/[0.06]"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 inline-flex h-3 w-3 rounded-full border ${sectionToneClass(tone)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={toneToVariant(tone)}>{timestamp}</StatusBadge>
            <p className="text-sm font-semibold text-white">{title}</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function ReservationEntry({
  href,
  time,
  title,
  status,
  tableName,
  guestCount,
}: {
  href: string;
  time: string;
  title: string;
  status: string;
  tableName: string;
  guestCount: number;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-white/10 bg-[#0f151d] p-4 transition hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant="info">{time}</StatusBadge>
            <StatusBadge variant={getReservationStatusTone(status)}>{getReservationStatusLabel(status)}</StatusBadge>
          </div>
          <p className="mt-3 text-sm font-semibold text-white">{title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {tableName} · {guestCount} invitados
          </p>
        </div>
        <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-white">
          Ver
        </span>
      </div>
    </Link>
  );
}

export default function EventCommandCenter() {
  const { currentOrganization, currentEvent, workspaceIntelligence, workspacePriority, status, setEventStatus } = useCheckInStore();
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);

  const model = useMemo(
    () =>
      buildLiveDashboardModel({
        currentOrganizationName: currentOrganization.name,
        currentEvent,
        workspaceStatus: status,
        workspaceIntelligence,
        workspacePriority,
      }),
    [currentEvent, currentOrganization.name, status, workspaceIntelligence, workspacePriority],
  );

  return (
    <div className="space-y-6">
      <Topbar eyebrow="Resumen" title="Resumen" />

      <section className="surface-panel overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="kicker">{model.header.organizationName}</p>
            <h2 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{model.header.eventName}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
              {model.header.eventType} · {model.header.timestampLabel} · {model.header.venue}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge variant={toneToVariant(model.header.liveTone)}>{model.header.liveLabel}</StatusBadge>
              <StatusBadge variant="info">{model.header.statusLabel}</StatusBadge>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            {!isTerminalEvent ? (
              <button
                type="button"
                onClick={() => setEventStatus(currentEvent.id, "finished")}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
              >
                Cerrar evento
              </button>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Evento cerrado</p>
                <p className="mt-2 text-sm text-slate-300">La vista permanece en lectura.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.kpis.map((metric) => (
          <MiniMetric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-panel p-5 sm:p-6">
          <PreviewHeader title="Actividad reciente" action={{ label: "Ver actividad", href: "/timeline" }} />
          <div className="mt-5 space-y-3">
            {model.recentActivity.length ? (
              model.recentActivity.map((event) => (
                <ActivityEntry
                  key={event.id}
                  tone={event.tone}
                  href="/timeline"
                  timestamp={event.timestamp}
                  title={event.title}
                  description={event.description}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
                No hay actividad reciente para mostrar.
              </div>
            )}
          </div>
        </section>

        <section className="surface-panel p-5 sm:p-6">
          <PreviewHeader title="Próximas reservas" action={{ label: "Ver reservas", href: "/reservations" }} />
          <div className="mt-5 space-y-3">
            {model.upcomingReservations.length ? (
              model.upcomingReservations.map((reservation) => (
                <ReservationEntry
                  key={reservation.id}
                  href="/reservations"
                  time={reservation.time}
                  title={reservation.name}
                  status={reservation.status}
                  tableName={reservation.tableName}
                  guestCount={reservation.guestCount}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
                No hay reservas próximas para mostrar.
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
