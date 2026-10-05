"use client";

import Link from "next/link";
import { useMemo } from "react";

import StatusBadge from "@/components/status-badge";
import { isAccreditationPhase2EventType } from "@/features/accreditation/events";
import { buildOperationsIncidents, type OperationsIncident } from "@/features/operations/domain/operations-domain";
import { useCheckInStore } from "@/services/workspace-service";

const MODULE_LABELS: Record<string, string> = {
  Operations: "Operaciones",
  Reservations: "Reservas",
  Tables: "Espacios",
  "Check-in": "Ingreso",
  Timeline: "Actividad",
  Dashboard: "Resumen",
  Statistics: "Estadísticas",
};

const ACTION_LABELS: Record<string, string> = {
  Operations: "Ver operaciones",
  Reservations: "Ver reservas",
  Tables: "Ver espacios",
  "Check-in": "Abrir ingreso",
  Timeline: "Ver actividad",
  Dashboard: "Ver resumen",
  Statistics: "Ver estadísticas",
};

function getModuleLabel(module: string) {
  return MODULE_LABELS[module] ?? module;
}

function getActionLabel(module: string) {
  return ACTION_LABELS[module] ?? "Abrir detalle";
}

function IncidentCard({ incident }: { incident: OperationsIncident }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={incident.tone}>{incident.priority === "critical" ? "CRÍTICO" : "ATENCIÓN"}</StatusBadge>
            <StatusBadge variant="info">{getModuleLabel(incident.module)}</StatusBadge>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-white sm:text-base">{incident.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{incident.description}</p>
        </div>
        <Link
          href={incident.route}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          {getActionLabel(incident.module)}
        </Link>
      </div>
    </article>
  );
}

function IncidentGroup({
  title,
  count,
  tone,
  incidents,
}: {
  title: string;
  count: number;
  tone: "danger" | "warning";
  incidents: OperationsIncident[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{title}</p>
        </div>
        <StatusBadge variant={tone}>{count}</StatusBadge>
      </div>
      <ul className="space-y-2" aria-label={title}>
        {incidents.map((incident) => (
          <li key={incident.id}><IncidentCard incident={incident} /></li>
        ))}
      </ul>
    </section>
  );
}

function StableState({ accreditation, eventId }: { accreditation: boolean; eventId: string }) {
  if (accreditation) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-semibold text-white">Operación de acreditación estable</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">No hay incidencias de sectores, checkpoints o movimientos que requieran atención.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/accreditation/events/${eventId}`} className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-white">
            Ver participantes
          </Link>
          <Link href={`/accreditation/events/${eventId}/access`} className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-50">
            Abrir acceso operativo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-sm font-semibold text-white">Operación estable</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">No hay incidencias que requieran atención en este momento.</p>
    </div>
  );
}

export default function OperationsCenter() {
  const { workspacePriority, currentEvent, status } = useCheckInStore();
  const accreditation = isAccreditationPhase2EventType(currentEvent.eventType);

  const incidents = useMemo(() => {
    return buildOperationsIncidents(workspacePriority);
  }, [workspacePriority.attentionNow, workspacePriority.criticalItems]);

  const hasIncidents = incidents.critical.length > 0 || incidents.attention.length > 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="kicker">OPERACIONES</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Incidencias activas</h2>
          </div>
        </div>

        <div className="mt-4 space-y-5">
          {status === "error" ? (
            <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
              No pudimos cargar las incidencias operativas. Reintenta la sincronización.
            </div>
          ) : status === "loading" ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">Sincronizando incidencias…</div>
          ) : hasIncidents ? (
            <>
              {incidents.critical.length ? (
                <IncidentGroup title="Críticos" count={incidents.critical.length} tone="danger" incidents={incidents.critical} />
              ) : null}
              {incidents.attention.length ? (
                <IncidentGroup title="Atención" count={incidents.attention.length} tone="warning" incidents={incidents.attention} />
              ) : null}
            </>
          ) : (
            <StableState accreditation={accreditation} eventId={currentEvent.id} />
          )}
        </div>
      </section>
    </div>
  );
}
