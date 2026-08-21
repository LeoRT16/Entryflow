"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { isTerminalEventStatus } from "@/features/events/domain";
import { buildLiveDashboardModel, type LiveDashboardAlert } from "@/features/events/domain/live-dashboard";
import { formatTimelineDisplayTime } from "@/features/timeline/domain/timeline-domain";
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

function CompactStat({
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
  return (
    <article className={`rounded-2xl border p-4 ${valueToneClass(tone)}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
    </article>
  );
}

function AdmissionCapacityBlock({ model }: { model: ReturnType<typeof buildLiveDashboardModel> }) {
  const capacityTone =
    model.capacity.state === "blocked" ? "danger" : model.capacity.state === "watch" ? "warning" : "success";

  return (
    <section className="surface-panel p-5 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="kicker">Admisión + capacidad</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-white">Pulso operativo del evento</h2>
        </div>
        <StatusBadge variant={capacityTone}>{model.capacity.state === "blocked" ? "Crítica" : model.capacity.state === "watch" ? "En vigilancia" : "Estable"}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
          <p className="kicker">Admisión</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CompactStat label="Esperados" value={String(model.statisticsCards.expectedGuests)} tone="info" detail="Total de invitados del evento activo." />
            <CompactStat label="Ingresados" value={String(model.statisticsCards.checkedInGuests)} tone="success" detail="Accesos confirmados en la puerta." />
            <CompactStat label="Pendientes" value={String(model.statisticsCards.pendingGuests)} tone={model.statisticsCards.pendingGuests > 0 ? "warning" : "success"} detail="Invitados por ingresar." />
            <CompactStat label="Check-ins/min" value={String(model.statisticsCards.checkInsPerMinute)} tone={model.statisticsCards.checkInsPerMinute > 0 ? "success" : "info"} detail="Promedio derivado del flujo activo." />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">{model.admission.summary}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
          <p className="kicker">Capacidad</p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl font-semibold tracking-tight text-white">{model.capacity.occupancyPercent}%</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {model.capacity.used}/{model.capacity.total} ocupados · {model.capacity.remaining} libres
              </p>
            </div>
            <StatusBadge variant={capacityTone}>{model.capacity.state === "blocked" ? "Bloqueada" : model.capacity.state === "watch" ? "Vigilar" : "Estable"}</StatusBadge>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/5">
            <div
              className={[
                "h-full rounded-full",
                capacityTone === "danger"
                  ? "bg-rose-400"
                  : capacityTone === "warning"
                    ? "bg-amber-400"
                    : "bg-emerald-400",
              ].join(" ")}
              style={{ width: `${Math.min(Math.max(model.capacity.occupancyPercent, 0), 100)}%` }}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CompactStat label="Bloqueos" value={String(model.admission.blockedSignals)} tone={model.admission.blockedSignals > 0 ? "danger" : "success"} detail="Señales de acceso bloqueado o duplicado." />
            <CompactStat label="Cola" value={String(model.admission.pendingQueue)} tone={model.admission.pendingQueue > 0 ? "warning" : "success"} detail="Invitados esperando en el acceso." />
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-400">{model.capacity.summary}</p>
        </div>
      </div>
    </section>
  );
}

function CompactAlertCenter({ alerts, alertCount }: { alerts: LiveDashboardAlert[]; alertCount: number }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (rootRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0f151d] px-4 py-4 text-left transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={`Centro de alertas operativas${alertCount > 0 ? `, ${alertCount} alertas activas` : ""}`}
      >
        <div className="min-w-0">
          <p className="kicker">Centro de alertas</p>
          <p className="mt-2 text-sm font-medium text-white">Incidencias y prioridades</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{alertCount > 0 ? "Abre el panel para revisar señales activas." : "Sin alertas activas."}</p>
        </div>
        <StatusBadge variant={alertCount > 0 ? "warning" : "success"}>{alertCount > 0 ? `${alertCount}` : "0"}</StatusBadge>
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.75rem)] z-20 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b0f14] shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <p className="kicker">Alertas activas</p>
            <StatusBadge variant={alertCount > 0 ? "warning" : "success"}>{alertCount > 0 ? `${alertCount} activas` : "Sin alertas"}</StatusBadge>
          </div>

          <div className="max-h-[24rem] space-y-2 overflow-y-auto p-2">
            {alerts.length ? (
              alerts.map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.route}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{alert.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{alert.description}</p>
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{alert.source}</p>
                    </div>
                    <StatusBadge variant={alert.tone}>{alert.source}</StatusBadge>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm leading-6 text-slate-400">
                No hay alertas activas. La operación está limpia.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function EventCommandCenter() {
  const { currentOrganization, currentEvent, currentVenue, workspaceIntelligence, workspacePriority, status, setEventStatus } = useCheckInStore();
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);

  const model = useMemo(
    () =>
      buildLiveDashboardModel({
        currentOrganizationName: currentOrganization.name,
        currentEvent,
        currentVenueName: currentVenue?.name,
        workspaceStatus: status,
        workspaceIntelligence,
        workspacePriority,
      }),
    [currentEvent, currentOrganization.name, currentVenue?.name, status, workspaceIntelligence, workspacePriority],
  );

  return (
    <div className="space-y-6">
      <Topbar eyebrow="Resumen" title="Resumen" />

      <section className="surface-panel overflow-hidden p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">
            <p className="kicker">{model.header.organizationName}</p>
            <h2 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{model.header.eventName}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
              {model.header.eventType} · {model.header.timestampLabel} · {model.header.venue}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">{model.header.summary}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge variant={toneToVariant(model.header.liveTone)}>{model.header.liveLabel}</StatusBadge>
              <StatusBadge variant="info">{model.header.statusLabel}</StatusBadge>
              <StatusBadge variant={model.alertCount > 0 ? "warning" : "success"}>{model.alertCount > 0 ? `${model.alertCount} alertas` : "Sin alertas"}</StatusBadge>
            </div>
          </div>

          <div className="space-y-3 xl:justify-self-end">
            <CompactAlertCenter alerts={model.alerts} alertCount={model.alertCount} />
            {!isTerminalEvent ? (
              <button
                type="button"
                onClick={() => setEventStatus(currentEvent.id, "finished")}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
              >
                Cerrar evento
              </button>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
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

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <AdmissionCapacityBlock model={model} />

        <section className="surface-panel p-5 sm:p-6">
          <PreviewHeader title="Actividad reciente" action={{ label: "Ver actividad", href: "/timeline" }} />
          <div className="mt-5 space-y-3">
            {model.recentActivity.length ? (
              model.recentActivity.map((event) => (
                <ActivityEntry
                  key={event.id}
                  tone={event.tone}
                  href="/timeline"
                  timestamp={formatTimelineDisplayTime(event.timestamp)}
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
      </section>
    </div>
  );
}
