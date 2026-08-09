"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { useRouter } from "next/navigation";

import DashboardQuickActions from "@/components/dashboard-quick-actions";
import StatusBadge from "@/components/status-badge";
import { ContextualCard } from "@/components/quick-actions-menu";
import { useCheckInStore } from "@/services/workspace-service";
import { getEventTypeLabel, isModuleEnabled } from "@/features/events/domain";
import type { Event as PlatformEvent } from "@/features/domain/types";

type Tone = "success" | "warning" | "danger" | "info";

type ModuleHealth = {
  label: string;
  value: string;
  state: string;
  summary: string;
  signal: string;
  tone: Tone;
};

type AttentionItem = {
  id: string;
  title: string;
  description: string;
  tone: Tone;
  source: string;
  reservationName?: string;
  tableName?: string;
  route: string;
};

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function splitEventStart(startAt: string) {
  const parts = startAt.trim().split(/\s+/);
  return {
    date: parts.slice(0, -1).join(" "),
    time: parts.at(-1) ?? "",
  };
}

function parseLocalizedDate(startAt: string) {
  const match = startAt.match(/^(\d{1,2}) de ([\p{L}\s]+) de (\d{4})(?:\s+(\d{1,2}:\d{2}))?$/iu);

  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = MONTHS[normalizeText(match[2])];
  const year = Number.parseInt(match[3], 10);
  const [hours, minutes] = (match[4] ?? "00:00").split(":").map((part) => Number.parseInt(part, 10));

  if (Number.isNaN(day) || month === undefined || Number.isNaN(year) || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return new Date(year, month, day, hours, minutes);
}

function formatRelativeStart(startAt: string, status: PlatformEvent["status"]) {
  const parsed = parseLocalizedDate(startAt);

  if (!parsed) {
    return splitEventStart(startAt).time;
  }

  const now = new Date();
  const deltaMs = parsed.getTime() - now.getTime();
  const deltaMinutes = Math.round(Math.abs(deltaMs) / 60000);

  if (status === "live") {
    if (deltaMs <= 0) {
      if (deltaMinutes < 60) {
        return `Hace ${Math.max(deltaMinutes, 1)} min`;
      }

      const hours = Math.floor(deltaMinutes / 60);
      const minutes = deltaMinutes % 60;
      return minutes ? `Hace ${hours} h ${minutes} min` : `Hace ${hours} h`;
    }

    return deltaMinutes < 60
      ? `En curso · inicia en ${deltaMinutes} min`
      : `En curso · inicia en ${Math.floor(deltaMinutes / 60)} h`;
  }

  if (deltaMs > 0) {
    const days = Math.ceil(deltaMs / (1000 * 60 * 60 * 24));

    if (days > 1) {
      return `Comienza en ${days} días`;
    }

    if (deltaMinutes >= 60) {
      return `Comienza en ${Math.ceil(deltaMinutes / 60)} h`;
    }
  }

  return `Hoy · ${splitEventStart(startAt).time}`;
}

function formatStatusLabel(status: PlatformEvent["status"]) {
  if (status === "draft") return "Borrador";
  if (status === "published") return "Publicado";
  if (status === "live") return "En curso";
  if (status === "finished") return "Finalizado";
  return "Archivado";
}

function statusTone(status: PlatformEvent["status"]): Tone {
  if (status === "live") return "success";
  if (status === "published") return "info";
  if (status === "draft") return "warning";
  if (status === "finished") return "info";
  return "danger";
}

function accentTone(tone: Tone) {
  if (tone === "success") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  }

  if (tone === "warning") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }

  if (tone === "danger") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }

  return "border-sky-400/20 bg-sky-400/10 text-sky-100";
}

function sectionCardTone(tone: Tone) {
  if (tone === "success") {
    return "border-emerald-400/15 bg-emerald-400/8";
  }

  if (tone === "warning") {
    return "border-amber-400/15 bg-amber-400/8";
  }

  if (tone === "danger") {
    return "border-rose-400/15 bg-rose-400/8";
  }

  return "border-sky-400/15 bg-sky-400/8";
}

function toneLabel(tone: Tone) {
  if (tone === "success") return "Correcto";
  if (tone === "warning") return "Atención";
  if (tone === "danger") return "Crítico";
  return "Información";
}

function toneDotClass(tone: Tone) {
  if (tone === "success") return "bg-emerald-300";
  if (tone === "warning") return "bg-amber-300";
  if (tone === "danger") return "bg-rose-300";
  return "bg-sky-300";
}

function getAlertRoute(source: string) {
  if (source === "Tables") return "/tables";
  if (source === "Check-in") return "/check-in";
  if (source === "Reservations") return "/reservations";
  if (source === "Timeline") return "/timeline";
  return "/operations";
}

function priorityForAttention(title: string) {
  if (title === "Mesa sobreocupada") return 0;
  if (title === "Mesa llena") return 1;
  if (title === "Reserva sin mesa") return 2;
  if (title === "Invitado pendiente") return 3;
  if (title === "Check-in rechazado") return 4;
  if (title === "Segundo intento") return 5;
  if (title === "Código inválido") return 6;
  return 10;
}

function buildAttentionItems(
  alerts: Array<{
    id: string;
    title: string;
    description: string;
    tone: Tone;
    source: string;
    reservationName?: string;
    tableName?: string;
  }>,
  occupancyPercent?: number,
): AttentionItem[] {
  const derivedAlerts = [...alerts]
    .sort((a, b) => priorityForAttention(a.title) - priorityForAttention(b.title))
    .slice(0, 5)
    .map((alert) => ({
      ...alert,
      route: getAlertRoute(alert.source),
    }));

  if (typeof occupancyPercent === "number" && occupancyPercent >= 85) {
    derivedAlerts.unshift({
      id: "capacity-high",
      title: "Capacidad alta",
      description: `La ocupación ya está en ${occupancyPercent}%.`,
      tone: occupancyPercent >= 95 ? "danger" : "warning",
      source: "Tables",
      route: "/tables",
    });
  }

  if (!derivedAlerts.length) {
    return [
      {
        id: "operations-stable",
        title: "Operación estable",
        description: "No hay incidencias críticas en este momento.",
        tone: "success",
        source: "Operations",
        route: "/operations",
      },
    ];
  }

  return derivedAlerts.slice(0, 6);
}

function buildModuleHealth(params: {
  event: PlatformEvent;
  reservationsCount: number;
  guestsCount: number;
  checkedInCount: number;
  pendingCount: number;
  alertsCount: number;
  occupancyPercent?: number;
  blockedCount: number;
  resourcesAlertCount: number;
  recentActivityCount: number;
  analyticsEnabled: boolean;
  accessWarnings: number;
  upcomingCount: number;
}): ModuleHealth[] {
  const {
    event,
    reservationsCount,
    guestsCount,
    checkedInCount,
    pendingCount,
    alertsCount,
    occupancyPercent,
    blockedCount,
    resourcesAlertCount,
    recentActivityCount,
    analyticsEnabled,
    accessWarnings,
    upcomingCount,
  } = params;

  const accessTone: Tone =
    !isModuleEnabled(event, "access")
      ? "warning"
      : accessWarnings > 0
        ? "warning"
        : "success";

  const attendeesTone: Tone =
    blockedCount > 0
      ? "danger"
      : pendingCount > 0
        ? "warning"
        : checkedInCount > 0
          ? "success"
          : "warning";

  const resourcesTone: Tone =
    !isModuleEnabled(event, "resources")
      ? "warning"
      : resourcesAlertCount > 0
        ? "danger"
        : occupancyPercent && occupancyPercent >= 80
          ? "warning"
          : "success";

  const admissionTone: Tone =
    blockedCount > 0
      ? "danger"
      : pendingCount > 0
        ? "warning"
        : checkedInCount > 0
          ? "success"
          : "warning";

  const operationsTone: Tone =
    alertsCount > 4 ? "danger" : alertsCount > 0 ? "warning" : "success";

  const analyticsTone: Tone =
    analyticsEnabled && recentActivityCount > 0
      ? "success"
      : analyticsEnabled
        ? "warning"
        : "warning";

  const accessState = !isModuleEnabled(event, "access")
    ? "Información"
    : accessWarnings > 0
      ? "Atención"
      : "Correcto";
  const attendeesState = blockedCount > 0 ? "Crítico" : pendingCount > 0 ? "Atención" : "Correcto";
  const resourcesState = !isModuleEnabled(event, "resources")
    ? "Información"
    : resourcesAlertCount > 0
      ? "Crítico"
      : occupancyPercent && occupancyPercent >= 80
        ? "Atención"
        : "Correcto";
  const admissionState = blockedCount > 0 ? "Crítico" : pendingCount > 0 ? "Atención" : "Correcto";
  const operationsState = alertsCount > 4 ? "Crítico" : alertsCount > 0 ? "Atención" : "Correcto";
  const analyticsState = analyticsEnabled ? "Correcto" : "Información";

  return [
    {
      label: "Access",
      value: !isModuleEnabled(event, "access") ? "No activo" : `${reservationsCount}`,
      state: accessState,
      summary: !isModuleEnabled(event, "access")
        ? "No forma parte de este evento."
        : accessWarnings > 0
          ? "Hay reservas que requieren atención."
          : "Accesos sin incidencias visibles.",
      signal: !isModuleEnabled(event, "access")
        ? "Módulo desactivado"
        : accessWarnings > 0
          ? `${accessWarnings} alertas`
          : "Sin incidencias",
      tone: accessTone,
    },
    {
      label: "Attendees",
      value: `${guestsCount}`,
      state: attendeesState,
      summary: blockedCount > 0
        ? "Existen invitados bloqueados o anulados."
        : pendingCount > 0
          ? `${pendingCount} invitados siguen pendientes.`
          : "La asistencia está sincronizada.",
      signal: blockedCount > 0
        ? `${blockedCount} bloqueados`
        : pendingCount > 0
          ? `${pendingCount} pendientes`
          : "Flujo sincronizado",
      tone: attendeesTone,
    },
    {
      label: "Resources",
      value: !isModuleEnabled(event, "resources") ? "No activo" : occupancyPercent !== undefined ? `${occupancyPercent}%` : "Sin datos",
      state: resourcesState,
      summary: !isModuleEnabled(event, "resources")
        ? "Este evento no usa recursos."
        : resourcesAlertCount > 0
          ? "Hay mesas o recursos en atención."
          : "Recursos estables y disponibles.",
      signal: !isModuleEnabled(event, "resources")
        ? "Sin recursos"
        : occupancyPercent !== undefined
          ? `${occupancyPercent}% ocupación`
          : "Sin datos",
      tone: resourcesTone,
    },
    {
      label: "Admission",
      value: `${checkedInCount}/${guestsCount}`,
      state: admissionState,
      summary: blockedCount > 0
        ? "Hay ingresos bloqueados o inválidos."
        : pendingCount > 0
          ? "Todavía quedan invitados por ingresar."
          : "Ingreso sincronizado con el estado actual.",
      signal: blockedCount > 0
        ? `${blockedCount} bloqueados`
        : pendingCount > 0
          ? `${pendingCount} pendientes`
          : "Puerta alineada",
      tone: admissionTone,
    },
    {
      label: "Operations",
      value: `${alertsCount}`,
      state: operationsState,
      summary: alertsCount > 0 ? "Existen alertas activas." : "No hay alertas abiertas.",
      signal: alertsCount > 0 ? `${alertsCount} incidencias` : "Operación limpia",
      tone: operationsTone,
    },
    {
      label: "Analytics",
      value: analyticsEnabled ? "Activo" : "Próx.",
      state: analyticsState,
      summary: analyticsEnabled
        ? recentActivityCount > 0
          ? `Se registraron ${recentActivityCount} eventos recientes.`
          : "El módulo está listo para reportar."
        : upcomingCount > 0
          ? "El módulo está disponible para este tipo de evento."
          : "No está habilitado en este evento.",
      signal: analyticsEnabled
        ? recentActivityCount > 0
          ? `${recentActivityCount} eventos`
          : "Listo para analizar"
        : "Próximo",
      tone: analyticsTone,
    },
  ];
}

function StatBar({
  label,
  value,
  detail,
  tone,
  id,
}: {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  id: string;
}) {
  return (
    <article id={id} tabIndex={-1} className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-lg font-semibold ${accentTone(tone)}`}>
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
    </article>
  );
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

function ModuleHealthCard({ item }: { item: ModuleHealth }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{item.label}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusBadge variant={item.tone}>{item.state}</StatusBadge>
        <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">
          <span className={`h-2.5 w-2.5 rounded-full ${toneDotClass(item.tone)}`} />
          {item.signal}
        </span>
      </div>
      <p className={`mt-4 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(item.tone)}`}>
        {item.value}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{item.summary}</p>
    </article>
  );
}

function buildDecisionSupport({
  eventType,
  status,
  checkedInCount,
  guestsCount,
  pendingCount,
  blockedCount,
  alertsCount,
  recentActivityCount,
}: {
  eventType: PlatformEvent["eventType"];
  status: PlatformEvent["status"];
  checkedInCount: number;
  guestsCount: number;
  pendingCount: number;
  blockedCount: number;
  alertsCount: number;
  recentActivityCount: number;
}) {
  if (status === "live") {
    if (blockedCount > 0) {
      return {
        tone: "danger" as Tone,
        label: "Bloqueos activos",
        text: `${blockedCount} ingresos siguen bloqueados. Prioriza Check-in antes de seguir moviendo recursos.`,
      };
    }

    if (pendingCount > 0) {
      return {
        tone: "warning" as Tone,
        label: "Puerta en curso",
        text:
          eventType === "concert"
            ? `${pendingCount} asistentes siguen pendientes. Acreditación y acceso siguen siendo la prioridad.`
            : eventType === "corporate"
              ? `${pendingCount} asistentes siguen pendientes. Mantén el ingreso y el registro sincronizados.`
              : `${pendingCount} invitados siguen pendientes. Mantén ingreso y mesas sincronizados.`,
      };
    }

    return {
      tone: "success" as Tone,
      label: "Operación fluida",
      text:
        eventType === "concert"
          ? "Acreditación estable. La puerta y las operaciones se mantienen sincronizadas."
          : eventType === "corporate"
            ? "Registro estable. Asistentes y recursos se mantienen sincronizados."
            : "Puerta estable. Reservas, invitados y recursos se mantienen sincronizados.",
    };
  }

  if (status === "published") {
    return {
      tone: alertsCount > 0 ? ("warning" as Tone) : ("info" as Tone),
      label: "Listo para abrir",
      text:
        eventType === "concert"
          ? "El evento ya está publicado. Revisa confirmaciones y accesos antes de abrir la puerta."
          : eventType === "corporate"
            ? "El evento ya está publicado. Revisa asistentes y recursos antes de iniciar."
            : "El evento ya está publicado. Revisa reservas y recursos antes de iniciar la operación.",
    };
  }

  if (status === "draft") {
    return {
      tone: "warning" as Tone,
      label: "Configuración pendiente",
      text:
        eventType === "concert"
          ? "Aún faltan ajustes para dejar la operación lista."
          : eventType === "corporate"
            ? "Faltan ajustes de configuración antes de activar la operación."
            : "Completa la configuración antes de abrir la operación.",
    };
  }

  return {
    tone: recentActivityCount > 0 ? ("info" as Tone) : ("success" as Tone),
    label: "Cierre disponible",
    text:
      checkedInCount > 0 || guestsCount > 0
        ? "El evento ya terminó. Usa Timeline y Statistics para revisar el cierre."
        : "El evento terminó sin actividad reciente.",
  };
}

export default function EventCommandCenter() {
  const router = useRouter();
  const { currentOrganization, currentEvent, workspaceIntelligence, workspacePriority, setEventStatus } = useCheckInStore();

  const snapshot = workspaceIntelligence.operations;
  const priority = workspacePriority;
  const checkedInCount = workspaceIntelligence.statistics.cards.checkedInGuests;
  const confirmedCount = workspaceIntelligence.reservations.confirmedReservations;
  const pendingCount = workspaceIntelligence.statistics.cards.pendingGuests;
  const blockedCount = workspaceIntelligence.customers.blockedGuests;
  const occupancyPercent = workspaceIntelligence.tables.occupancyPercent;
  const capacityRemaining = workspaceIntelligence.tables.capacityRemaining;
  const accessWarnings = snapshot.alerts.filter((alert) => alert.title === "Reserva sin mesa").length;
  const resourcesAlertCount = snapshot.alerts.filter((alert) => alert.source === "Tables").length;
  const recentActivity = priority.recentChanges.slice(0, 6);
  const actionCount = priority.summary.critical + priority.summary.attention;
  const reservationsCount = workspaceIntelligence.statistics.cards.activeReservations;
  const guestsCount = workspaceIntelligence.reservations.expectedGuests;
  const smartRecommendations = priority.nextBestActions.slice(0, 4);
  const health = workspaceIntelligence.health;
  const activity = workspaceIntelligence.activity;
  const capacity = workspaceIntelligence.capacity;
  const flow = workspaceIntelligence.flow;
  const focusSection = useCallback((id: string) => {
    const target = document.getElementById(id);

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, []);

  useKeyboardShortcuts(
    useMemo(
      () => [
        { id: "dashboard-section-critical", shortcut: "1", priority: 60, handler: () => focusSection("dashboard-critical") },
        { id: "dashboard-section-attention", shortcut: "2", priority: 60, handler: () => focusSection("dashboard-attention") },
        { id: "dashboard-section-recent", shortcut: "3", priority: 60, handler: () => focusSection("dashboard-recent") },
        { id: "dashboard-section-healthy", shortcut: "4", priority: 60, handler: () => focusSection("dashboard-healthy") },
      ],
      [focusSection],
    ),
  );
  const moduleHealth = useMemo(
    () =>
      buildModuleHealth({
        event: currentEvent,
        reservationsCount,
        guestsCount,
        checkedInCount,
        pendingCount,
        alertsCount: actionCount,
        occupancyPercent,
        blockedCount,
        resourcesAlertCount,
        recentActivityCount: recentActivity.length,
        analyticsEnabled: isModuleEnabled(currentEvent, "analytics"),
        accessWarnings,
        upcomingCount: workspaceIntelligence.statistics.cards.pendingReservations,
      }),
    [
      accessWarnings,
      actionCount,
      blockedCount,
      checkedInCount,
      currentEvent,
      guestsCount,
      occupancyPercent,
      pendingCount,
      recentActivity.length,
      resourcesAlertCount,
      reservationsCount,
      workspaceIntelligence.statistics.cards.pendingReservations,
    ],
  );

  const attentionItems = useMemo(() => buildAttentionItems(snapshot.alerts, occupancyPercent), [occupancyPercent, snapshot.alerts]);
  const decisionSupport = useMemo(
    () =>
      buildDecisionSupport({
        eventType: currentEvent.eventType,
        status: currentEvent.status,
        checkedInCount,
        guestsCount,
        pendingCount,
        blockedCount,
        alertsCount: actionCount,
        recentActivityCount: recentActivity.length,
      }),
    [actionCount, blockedCount, checkedInCount, currentEvent.eventType, currentEvent.status, guestsCount, pendingCount, recentActivity.length],
  );
  const start = splitEventStart(currentEvent.startAt);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(15,23,42,0.96)_54%,rgba(11,15,20,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-100/70">
              Event Command Center
            </p>
            <h1 className="mt-3 truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {currentEvent.name}
            </h1>
            <p className="mt-3 text-sm font-medium text-slate-300 sm:text-base">
              {getEventTypeLabel(currentEvent.eventType)} · {currentOrganization.name} · {currentEvent.venue}
            </p>
            <p className="mt-2 text-sm text-slate-400 sm:text-[0.95rem]">
              {start.date} · {start.time} · {currentEvent.capacity > 0 ? `${currentEvent.capacity} cupos` : "Sin límite"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge variant={statusTone(currentEvent.status)}>{formatStatusLabel(currentEvent.status)}</StatusBadge>
              {isModuleEnabled(currentEvent, "resources") ? <StatusBadge variant="warning">Recursos activos</StatusBadge> : null}
              {isModuleEnabled(currentEvent, "analytics") ? <StatusBadge variant="info">Analytics listo</StatusBadge> : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex items-center gap-3">
              {currentEvent.status !== "finished" ? (
                <button
                  type="button"
                  onClick={() => setEventStatus(currentEvent.id, "finished")}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                >
                  Cerrar evento
                </button>
              ) : null}
            </div>
            <StatusBadge variant={statusTone(currentEvent.status)}>{formatStatusLabel(currentEvent.status)}</StatusBadge>
            <p className="max-w-sm text-sm leading-6 text-slate-300 text-left lg:text-right">
              {currentEvent.status === "live"
                ? `Operación en curso · ${formatRelativeStart(currentEvent.startAt, currentEvent.status)}`
                : currentEvent.status === "draft"
                  ? "Aún faltan ajustes para abrir la operación."
                  : currentEvent.status === "published"
                    ? "Listo para abrir con el estado sincronizado."
                    : "Evento cerrado · referencia operativa disponible."}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatBar
            label="Critical"
            value={`${priority.summary.critical}`}
            detail={priority.summary.message}
            tone={priority.summary.critical > 0 ? "danger" : "success"}
            id="dashboard-critical"
          />
          <StatBar
            label="Attention"
            value={`${priority.summary.attention}`}
            detail={priority.summary.nextBestAction}
            tone={priority.summary.attention > 0 ? "warning" : "success"}
            id="dashboard-attention"
          />
          <StatBar
            label="Recent"
            value={recentActivity[0]?.timestamp ?? "--:--"}
            detail={recentActivity[0]?.title ?? "Sin actividad reciente"}
            tone="info"
            id="dashboard-recent"
          />
          <StatBar
            label="Healthy"
            value={`${priority.summary.healthy}`}
            detail={priority.summary.canIgnore}
            tone="success"
            id="dashboard-healthy"
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className={`rounded-2xl border p-4 ${sectionCardTone(health.state === "blocked" ? "danger" : health.state === "watch" ? "warning" : "success")}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Smart Operations</p>
                <p className="mt-2 text-sm font-semibold text-white">{health.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{health.description}</p>
              </div>
              <StatusBadge variant={health.state === "blocked" ? "danger" : health.state === "watch" ? "warning" : "success"}>
                {health.score}
              </StatusBadge>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Actividad</p>
                <p className="mt-2 text-sm font-medium text-white">{activity.summary}</p>
                <p className="mt-1 text-xs text-slate-400">{activity.recentWindow}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Capacidad</p>
                <p className="mt-2 text-sm font-medium text-white">{capacity.summary}</p>
                <p className="mt-1 text-xs text-slate-400">{capacity.occupancyPercent}% ocupación · {capacity.remaining} restantes</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Flujo</p>
                <p className="mt-2 text-sm font-medium text-white">{flow.summary}</p>
                <p className="mt-1 text-xs text-slate-400">{flow.pendingGuests} pendientes · {flow.checkInsPerMinute}/min</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Recomendación</p>
                <p className="mt-2 text-sm font-medium text-white">{smartRecommendations[0]?.title ?? "Sin recomendaciones"}</p>
                <p className="mt-1 text-xs text-slate-400">{smartRecommendations[0]?.description ?? "La operación está estable."}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">{priority.summary.canIgnore}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Insights operativos</p>
            <div className="mt-3 space-y-2">
              {smartRecommendations.length ? (
                smartRecommendations.map((recommendation) => (
                  <div key={recommendation.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{recommendation.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{recommendation.description}</p>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          {recommendation.module} · {recommendation.route}
                        </p>
                      </div>
                      <StatusBadge variant={recommendation.tone}>{recommendation.priority}</StatusBadge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-400">
                  No hay recomendaciones activas.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`mt-5 rounded-2xl border p-4 ${sectionCardTone(decisionSupport.tone)}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Soporte de decisión</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{decisionSupport.text}</p>
            </div>
            <StatusBadge variant={decisionSupport.tone}>{decisionSupport.label}</StatusBadge>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <SectionHeader
            eyebrow="Acciones rápidas"
            title="Bloque principal de operación"
            description="La acción principal cambia según el tipo y estado del evento."
          />
        <div className="mt-5">
          <DashboardQuickActions />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <SectionHeader
            eyebrow="Attention Center"
            title="Prioridades operativas"
            description="Reservas pendientes, recursos bloqueados, operaciones abiertas y capacidad alta."
          />

          <div className="mt-5 space-y-3">
            {attentionItems.length ? (
              attentionItems.map((item) => (
                <ContextualCard
                  key={item.id}
                  className={`rounded-2xl border p-4 ${sectionCardTone(item.tone)}`}
                  items={[
                    {
                      id: `${item.id}-open`,
                      label: "Abrir módulo",
                      description: "Ir a la pantalla donde se resuelve.",
                      tone: "info",
                      onSelect: () => router.push(item.route),
                    },
                    {
                      id: `${item.id}-resolve`,
                      label: "Resolver ahora",
                      description: "Ir directamente al módulo relacionado.",
                      tone: "success",
                      onSelect: () => router.push(item.route),
                    },
                  ]}
                >
                  <article>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge variant={item.tone}>{toneLabel(item.tone)}</StatusBadge>
                          <StatusBadge variant="info">{item.source}</StatusBadge>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                      </div>
                      <Link
                        href={item.route}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                      >
                        Abrir
                      </Link>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.reservationName ? <StatusBadge variant="info">{item.reservationName}</StatusBadge> : null}
                      {item.tableName ? <StatusBadge variant="success">{item.tableName}</StatusBadge> : null}
                    </div>
                  </article>
                </ContextualCard>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
                Operación estable.
              </div>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Operations"
              title="Estado operativo"
              description="Alertas activas y foco inmediato."
            />

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Alertas abiertas</p>
                  <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(actionCount > 0 ? "warning" : "success")}`}>
                    {actionCount}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {actionCount > 0 ? "Hay incidencias que requieren atención directa." : "No hay alertas abiertas."}
                  </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Capacidad</p>
                  <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(occupancyPercent && occupancyPercent >= 85 ? "warning" : "success")}`}>
                    {occupancyPercent !== undefined ? `${occupancyPercent}%` : "Sin datos"}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {capacityRemaining !== undefined ? `${capacityRemaining} cupos libres en mesas abiertas.` : "Capacidad derivada del estado compartido."}
                  </p>
                </article>
              </div>

              <div className="space-y-2">
                {snapshot.alerts.length ? (
                  snapshot.alerts.slice(0, 3).map((alert) => (
                    <Link
                      key={alert.id}
                      href={getAlertRoute(alert.source)}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-[#0f151d] px-4 py-3 transition hover:bg-white/[0.06]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge variant={alert.tone}>{toneLabel(alert.tone)}</StatusBadge>
                          <StatusBadge variant="info">{alert.source}</StatusBadge>
                        </div>
                        <p className="mt-2 text-sm font-medium text-white">{alert.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{alert.description}</p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
                    No hay alertas abiertas.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Attendees"
              title="Asistentes"
              description="Confirmados, pendientes y bloqueados."
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Confirmados</p>
                <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(confirmedCount > 0 ? "success" : "info")}`}>
                  {confirmedCount}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Pendientes</p>
                <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(pendingCount > 0 ? "warning" : "success")}`}>
                  {pendingCount}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Bloqueados</p>
                <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(blockedCount > 0 ? "danger" : "success")}`}>
                  {blockedCount}
                </p>
              </article>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-400">
              {blockedCount > 0
                ? "Hay invitados que no pueden ingresar todavía."
                : pendingCount > 0
                  ? "Todavía quedan invitados por sincronizar."
                  : "La asistencia ya está sincronizada con el estado compartido."}
            </p>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Resources"
              title="Recursos"
              description="Ocupación y mesas críticas."
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Ocupación</p>
                <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(resourcesAlertCount > 0 ? "warning" : "success")}`}>
                  {occupancyPercent !== undefined ? `${occupancyPercent}%` : "Sin datos"}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {capacityRemaining !== undefined ? `${capacityRemaining} cupos restantes.` : "Capacidad derivada del estado compartido."}
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-[#0f151d] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Mesas críticas</p>
                <p className={`mt-3 inline-flex rounded-2xl border px-3 py-2 text-base font-semibold ${accentTone(snapshot.criticalTables.overCapacity.length > 0 ? "danger" : snapshot.criticalTables.full.length > 0 ? "warning" : "success")}`}>
                  {snapshot.criticalTables.overCapacity.length + snapshot.criticalTables.full.length}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {snapshot.criticalTables.overCapacity.length > 0
                    ? `${snapshot.criticalTables.overCapacity.length} sobrecupos activos.`
                    : snapshot.criticalTables.full.length > 0
                      ? `${snapshot.criticalTables.full.length} mesas llenas.`
                      : "No hay mesas críticas en este momento."}
                </p>
              </article>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge variant="info">{snapshot.criticalTables.empty.length} vacías</StatusBadge>
              <StatusBadge variant="warning">{snapshot.criticalTables.full.length} llenas</StatusBadge>
              <StatusBadge variant={snapshot.criticalTables.overCapacity.length > 0 ? "danger" : "success"}>
                {snapshot.criticalTables.overCapacity.length} sobrecupo
              </StatusBadge>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Live Activity"
              title="Actividad reciente"
              description="Últimos eventos del timeline compartido."
              action={
                <Link
                  href="/timeline"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                >
                  Ver timeline completo
                </Link>
              }
            />

            <div className="mt-5 space-y-2">
              {recentActivity.length ? (
                recentActivity.map((event) => (
                  <article
                    key={event.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-[#0f151d] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge variant={event.tone}>{toneLabel(event.tone)}</StatusBadge>
                        <StatusBadge variant="info">{event.timestamp}</StatusBadge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-white">{event.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{event.description}</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#0f151d] p-4 text-sm text-slate-400">
                  Sin actividad reciente.
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Module Health"
          title="Salud de módulos"
          description="Estado visual de las capacidades críticas del evento."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {moduleHealth.map((item) => (
            <ModuleHealthCard key={item.label} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
