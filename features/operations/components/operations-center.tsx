"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { ContextualCard, GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import { useCheckInStore } from "@/services/workspace-service";
import TimelineFeed from "@/features/timeline/components/timeline-feed";

function accentTone(tone: "success" | "warning" | "danger" | "info") {
  return tone === "success"
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
    : tone === "warning"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
      : tone === "danger"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
        : "border-sky-400/20 bg-sky-400/10 text-sky-100";
}

export default function OperationsCenter() {
  const router = useRouter();
  const { workspaceIntelligence, workspacePriority } = useCheckInStore();
  const snapshot = workspaceIntelligence.operations;
  const priority = workspacePriority;
  const guidedActions = useMemo(() => {
    const candidates = [
      ...priority.criticalItems,
      ...priority.attentionNow,
      ...priority.nextBestActions,
    ].filter((item) =>
      item.module === "Operations" || item.module === "Reservations" || item.module === "Tables" || item.module === "Check-in" || item.module === "Timeline",
    );

    const seen = new Set<string>();

    return candidates
      .filter((item) => {
        if (seen.has(item.id)) {
          return false;
        }

        seen.add(item.id);
        return true;
      })
      .slice(0, 4)
      .map((item) =>
        buildGuidedActionItem(item, {
          href: item.route,
          impact:
            item.priority === "critical"
              ? "Abre el módulo que desbloquea la operación."
              : item.priority === "high"
                ? "Reduce la cola de alertas activas."
                : item.priority === "medium"
                  ? "Mantiene el flujo alineado."
                  : "Sostiene la estabilidad del evento.",
        }),
      );
  }, [priority]);

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Centro de operaciones"
        title="Operations"
        description="Panel vivo para monitorear el evento completo con el mismo estado compartido."
        primaryAction={{ label: "Ir a reservas", href: "/reservations" }}
        secondaryAction={{ label: "Abrir check-in", href: "/check-in" }}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {snapshot.metrics.map((metric) => (
          <article key={metric.label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{metric.label}</p>
            <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-2xl font-semibold ${accentTone(metric.tone)}`}>
              {metric.value}
            </p>
            <p className="mt-3 text-sm text-slate-400">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className={`rounded-3xl border p-5 ${accentTone(priority.summary.critical > 0 ? "danger" : priority.summary.attention > 0 ? "warning" : "success")}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Lectura operativa</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{priority.summary.message}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{priority.summary.nextBestAction}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Críticos</p>
              <p className="mt-2 text-sm font-medium text-white">{priority.summary.critical}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Atención</p>
              <p className="mt-2 text-sm font-medium text-white">{priority.summary.attention}</p>
            </div>
          </div>
        </div>

        <GuidedActionPanel
          title="Siguiente paso"
          description="Acciones contextualizadas para resolver primero lo que impacta la operación."
          items={guidedActions}
        />

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Prioridad operativa</p>
          <div className="mt-4 space-y-3">
            <PriorityBucket label="Critical" tone="danger" items={priority.criticalItems} />
            <PriorityBucket label="Warnings" tone="warning" items={priority.attentionNow} />
            <PriorityBucket label="Normal" tone="success" items={priority.healthySystems} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <TimelineFeed events={snapshot.recentActivity} />

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Próximas reservas
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  Siguientes reservas del día
                </h2>
              </div>
              <StatusBadge variant="info">{snapshot.upcomingReservations.length}</StatusBadge>
            </div>

            <div className="mt-5 space-y-3">
              {snapshot.upcomingReservations.map((reservation) => (
                <ContextualCard
                  key={reservation.id}
                  items={[
                    {
                      id: `${reservation.id}-open`,
                      label: "Abrir reserva",
                      description: "Ir a Reservations.",
                      tone: "info" as const,
                      onSelect: () => router.push("/reservations"),
                    },
                    {
                      id: `${reservation.id}-timeline`,
                      label: "Abrir Timeline",
                      description: "Ver actividad relacionada.",
                      tone: "info" as const,
                      onSelect: () => router.push("/timeline"),
                    },
                  ]}
                  className="rounded-2xl border border-white/10 bg-[#0f151d] p-4"
                >
                  <article className="rounded-2xl">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{reservation.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                          {reservation.code} · {reservation.time} · {reservation.eventName}
                        </p>
                      </div>
                      <StatusBadge variant={reservation.statusTone}>{reservation.status}</StatusBadge>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <LiveSummaryRow label="Invitados" value={`${reservation.metrics.guestCount}`} />
                      <LiveSummaryRow label="Confirmados" value={`${reservation.metrics.confirmedGuests}`} />
                      <LiveSummaryRow label="Ingresados" value={`${reservation.metrics.checkedInGuests}`} />
                      <LiveSummaryRow label="Mesa" value={reservation.tableName} />
                    </div>
                  </article>
                </ContextualCard>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Alertas operativas
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  Señales en vivo
                </h2>
              </div>
              <StatusBadge variant="warning">{snapshot.alerts.length}</StatusBadge>
            </div>

            <div className="mt-5 space-y-3">
              {snapshot.alerts.length ? (
                snapshot.alerts.map((alert) => (
                  <ContextualCard
                    key={alert.id}
                    items={[
                      {
                        id: `${alert.id}-open`,
                        label: "Abrir alerta",
                        description: "Ir al origen del problema.",
                        tone: "info" as const,
                        onSelect: () => router.push(alert.source === "Tables" ? "/tables" : alert.source === "Check-in" ? "/check-in" : "/reservations"),
                      },
                      {
                        id: `${alert.id}-resolve`,
                        label: "Resolver alerta",
                        description: "Abrir la pantalla donde se corrige.",
                        tone: "success" as const,
                        onSelect: () => router.push(alert.source === "Tables" ? "/tables" : alert.source === "Check-in" ? "/check-in" : "/reservations"),
                      },
                    ]}
                    className="rounded-2xl border border-white/10 bg-[#0f151d] p-4"
                  >
                    <article className="rounded-2xl">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{alert.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-400">{alert.description}</p>
                        </div>
                        <StatusBadge variant={alert.tone}>{alert.source}</StatusBadge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {alert.reservationName ? <StatusBadge variant="info">{alert.reservationName}</StatusBadge> : null}
                        {alert.tableName ? <StatusBadge variant="success">{alert.tableName}</StatusBadge> : null}
                      </div>
                    </article>
                  </ContextualCard>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
                  Sin alertas activas.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Resumen rápido
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  Vista compacta
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {snapshot.quickSummary.map((item) => (
                <LiveSummaryRow key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Mesas críticas
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  Capacidad bajo atención
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <CriticalGroup label="Mesas llenas" tone="warning" items={snapshot.criticalTables.full} />
              <CriticalGroup label="Con sobrecupo" tone="danger" items={snapshot.criticalTables.overCapacity} />
              <CriticalGroup label="Mesas vacías" tone="info" items={snapshot.criticalTables.empty} />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function CriticalGroup({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
  items: Array<{
    id: string;
    name: string;
    status: string;
    capacity: number;
    assignedGuests: number;
    overCapacity: number;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <StatusBadge variant={tone}>{items.length}</StatusBadge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <StatusBadge key={item.id} variant={tone}>
              {item.name}
            </StatusBadge>
          ))
        ) : (
          <StatusBadge variant="info">Sin incidencias</StatusBadge>
        )}
      </div>
    </div>
  );
}

function PriorityBucket({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
  items: Array<{
    id: string;
    title: string;
    description: string;
    route: string;
    module: string;
    priority: string;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <StatusBadge variant={tone}>{items.length}</StatusBadge>
      </div>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.slice(0, 4).map((item) => (
            <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm font-medium text-white">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {item.module} · {item.route}
              </p>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
            Sin incidencias.
          </div>
        )}
      </div>
    </div>
  );
}
