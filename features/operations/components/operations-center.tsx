"use client";

import Link from "next/link";
import { useMemo } from "react";

import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import type { WorkspacePriorityItem } from "@/domain/workspace-priority";
import { isAccreditationPhase2EventType } from "@/features/accreditation/events";
import { useCheckInStore } from "@/services/workspace-service";

type OperationsIncident = {
  id: string;
  title: string;
  description: string;
  route: string;
  module: WorkspacePriorityItem["module"];
  priority: "critical" | "attention";
  tone: "danger" | "warning";
};

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

function priorityRank(priority: WorkspacePriorityItem["priority"]) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function incidentKey(item: WorkspacePriorityItem) {
  if (item.module === "Check-in" && (item.title === "Check-in detenido" || item.title === "Puerta congestionada")) {
    return "Check-in::Ingreso detenido";
  }

  return `${item.module}::${item.title}::${item.description}`;
}

function toIncident(item: WorkspacePriorityItem): OperationsIncident {
  if (item.module === "Check-in" && (item.title === "Check-in detenido" || item.title === "Puerta congestionada")) {
    return {
      id: "checkin-stalled-visible",
      title: "Ingreso detenido",
      description: item.description,
      route: "/check-in",
      module: item.module,
      priority: "critical",
      tone: "danger",
    };
  }

  const priority = item.priority === "critical" ? "critical" : "attention";
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    route: item.route,
    module: item.module,
    priority,
    tone: priority === "critical" ? "danger" : "warning",
  };
}

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
      <div className="space-y-3">
        {incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>
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
  const { workspacePriority, currentEvent } = useCheckInStore();
  const accreditation = isAccreditationPhase2EventType(currentEvent.eventType);

  const incidents = useMemo(() => {
    const seen = new Map<string, OperationsIncident>();
    const orderedItems = [...workspacePriority.criticalItems, ...workspacePriority.attentionNow].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

    for (const item of orderedItems) {
      const key = incidentKey(item);
      const nextIncident = toIncident(item);
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, nextIncident);
        continue;
      }

      if (existing.id === "checkin-stalled-visible" || nextIncident.id === "checkin-stalled-visible") {
        seen.set(key, nextIncident.id === "checkin-stalled-visible" ? nextIncident : existing);
        continue;
      }

      if (existing.priority === "attention" && nextIncident.priority === "critical") {
        seen.set(key, nextIncident);
      }
    }

    const deduped = Array.from(seen.values());
    return {
      critical: deduped.filter((incident) => incident.priority === "critical"),
      attention: deduped.filter((incident) => incident.priority === "attention"),
    };
  }, [workspacePriority.attentionNow, workspacePriority.criticalItems]);

  const hasIncidents = incidents.critical.length > 0 || incidents.attention.length > 0;

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Operaciones"
        title="Operaciones"
        description="Control operativo en tiempo real del evento activo."
      />

      <section className="surface-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="kicker">ATENCIÓN OPERATIVA</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Incidencias activas</h2>
          </div>
        </div>

        <div className="mt-5 space-y-6">
          {hasIncidents ? (
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
