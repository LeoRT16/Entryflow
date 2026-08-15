import type { WorkspaceIntelligence } from "@/domain/workspace-intelligence";
import type { WorkspacePriorityItem, WorkspacePrioritySnapshot } from "@/domain/workspace-priority";
import { getEventTypeLabel } from "@/features/events/domain";
import type { Event as PlatformEvent } from "@/features/domain/types";
import { isTerminalEventStatus } from "@/features/events/domain/event-rules";
import type { TimelineEvent } from "@/features/timeline/types";

export type LiveDashboardTone = "success" | "warning" | "danger" | "info";

export type LiveDashboardKpi = {
  label: string;
  value: string;
  detail: string;
  tone: LiveDashboardTone;
};

export type LiveDashboardAlert = {
  id: string;
  title: string;
  description: string;
  tone: LiveDashboardTone;
  source: string;
  route: string;
  reservationName?: string;
  tableName?: string;
};

export type LiveDashboardQuickAction = {
  id: string;
  label: string;
  description: string;
  route: string;
  tone: LiveDashboardTone;
  shortcut: string;
};

export type LiveDashboardModel = {
  header: {
    eventName: string;
    organizationName: string;
    eventType: string;
    statusLabel: string;
    liveLabel: string;
    liveTone: LiveDashboardTone;
    timestampLabel: string;
    venue: string;
    summary: string;
    nextAction: string;
  };
  alertCount: number;
  kpis: LiveDashboardKpi[];
  admission: {
    checkInsPerMinute: number;
    averageCheckInIntervalMinutes: number;
    pendingQueue: number;
    recentCheckIns: number;
    blockedSignals: number;
    summary: string;
  };
  capacity: {
    used: number;
    total: number;
    remaining: number;
    occupancyPercent: number;
    state: "stable" | "watch" | "blocked";
    summary: string;
  };
  upcomingReservations: Array<{
    id: string;
    name: string;
    code: string;
    time: string;
    tableName: string;
    status: string;
    tone: LiveDashboardTone;
    guestCount: number;
    checkedInGuests: number;
    pendingGuests: number;
  }>;
  recentActivity: TimelineEvent[];
  quickActions: LiveDashboardQuickAction[];
};

type LiveDashboardInput = {
  currentOrganizationName: string;
  currentEvent: Pick<PlatformEvent, "name" | "status" | "startAt" | "venue" | "eventType">;
  workspaceStatus: "loading" | "ready" | "empty" | "error";
  workspaceIntelligence: Pick<WorkspaceIntelligence, "activity" | "capacity" | "flow" | "access" | "operations" | "statistics">;
  workspacePriority: Pick<WorkspacePrioritySnapshot, "criticalItems" | "attentionNow" | "summary">;
};

const ALLOWED_ALERT_MODULES = new Set(["Dashboard", "Operations", "Timeline", "Reservations", "Tables", "Check-in"]);

function formatEventDateTime(startAt: string) {
  const parts = startAt.trim().split(/\s+/);
  if (!parts.length) {
    return startAt;
  }

  if (parts.length === 1) {
    return startAt;
  }

  return `${parts.slice(0, -1).join(" ")} · ${parts.at(-1)}`;
}

function toLiveTone(tone: LiveDashboardTone): LiveDashboardTone {
  return tone;
}

function getStatusLabel(status: PlatformEvent["status"]) {
  if (status === "live") return "En curso";
  if (status === "published") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "finished") return "Finalizado";
  return "Cancelado";
}

function getRealtimeTone(workspaceStatus: LiveDashboardInput["workspaceStatus"], eventStatus: PlatformEvent["status"]): LiveDashboardTone {
  if (isTerminalEventStatus(eventStatus)) {
    return "warning";
  }

  if (workspaceStatus === "ready" && eventStatus === "live") {
    return "success";
  }

  if (workspaceStatus === "loading") {
    return "warning";
  }

  return "info";
}

function getRealtimeLabel(workspaceStatus: LiveDashboardInput["workspaceStatus"], eventStatus: PlatformEvent["status"]) {
  if (isTerminalEventStatus(eventStatus)) {
    return "Cerrado";
  }

  if (workspaceStatus === "ready" && eventStatus === "live") {
    return "En vivo";
  }

  if (workspaceStatus === "loading") {
    return "Sincronizando";
  }

  if (eventStatus === "live") {
    return "Listo";
  }

  return "Local";
}

function priorityToTone(priority: WorkspacePriorityItem["priority"]): LiveDashboardTone {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "success";
}

function mapPriorityItemToAlert(item: WorkspacePriorityItem): LiveDashboardAlert {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    tone: priorityToTone(item.priority),
    source: item.module,
    route: item.route,
  };
}

export function buildLiveDashboardQuickActions({
  terminalEvent = false,
}: {
  terminalEvent?: boolean;
} = {}): LiveDashboardQuickAction[] {
  return [
    {
      id: "quick-action-check-in",
      label: terminalEvent ? "Ingreso · solo lectura" : "Escanear / Ingreso",
      description: terminalEvent
        ? "Abrir el historial y la trazabilidad de accesos del evento cerrado."
        : "Abrir el scanner y registrar accesos.",
      route: "/check-in",
      tone: "danger",
      shortcut: "⌘1",
    },
    {
      id: "quick-action-reservations",
      label: "Reservas",
      description: "Revisar confirmaciones y pendientes.",
      route: "/reservations",
      tone: "info",
      shortcut: "⌘2",
    },
    {
      id: "quick-action-tables",
      label: "Mesas / Recursos",
      description: "Controlar ocupación y conflictos.",
      route: "/tables",
      tone: "warning",
      shortcut: "⌘3",
    },
    {
      id: "quick-action-timeline",
      label: "Trazabilidad",
      description: "Ver actividad y cambios recientes.",
      route: "/timeline",
      tone: "success",
      shortcut: "⌘4",
    },
  ];
}

export function buildLiveDashboardModel({
  currentOrganizationName,
  currentEvent,
  workspaceStatus,
  workspaceIntelligence,
  workspacePriority,
}: LiveDashboardInput): LiveDashboardModel {
  const checkedInGuests = workspaceIntelligence.statistics.cards.checkedInGuests;
  const pendingGuests = workspaceIntelligence.statistics.cards.pendingGuests;
  const totalCapacity = workspaceIntelligence.capacity.used + workspaceIntelligence.capacity.remaining;
  const occupancyPercent = workspaceIntelligence.capacity.occupancyPercent;
  const recentCheckIns = workspaceIntelligence.operations.recentActivity.filter((event) => event.kind.startsWith("checkin.")).length;
  const blockedSignals =
    workspaceIntelligence.access.rejectedAttempts +
    workspaceIntelligence.access.duplicateAttempts +
    workspaceIntelligence.access.blockedGrants;
  const terminalEvent = isTerminalEventStatus(currentEvent.status);

  const capacityState: LiveDashboardModel["capacity"]["state"] =
    workspaceIntelligence.capacity.state === "blocked" ? "blocked" : workspaceIntelligence.capacity.state === "watch" ? "watch" : "stable";

  const coreAlerts: LiveDashboardAlert[] = [];

  if (workspaceIntelligence.capacity.state === "blocked" || workspaceIntelligence.capacity.state === "watch") {
    coreAlerts.push({
      id: "capacity-pressure",
      title: workspaceIntelligence.capacity.state === "blocked" ? "Capacidad crítica" : "Capacidad alta",
      description: workspaceIntelligence.capacity.summary,
      tone: workspaceIntelligence.capacity.state === "blocked" ? "danger" : "warning",
      source: "Tables",
      route: "/tables",
    });
  }

  if (workspaceIntelligence.flow.pendingGuests > 0 || blockedSignals > 0) {
    coreAlerts.push({
      id: "admission-pressure",
      title: blockedSignals > 0 ? "Admission con bloqueos" : "Cola de ingreso",
      description:
        blockedSignals > 0
          ? workspaceIntelligence.access.summary
          : workspaceIntelligence.flow.summary,
      tone: blockedSignals > 0 ? "danger" : "warning",
      source: "Check-in",
      route: "/check-in",
    });
  }

  const priorityAlerts = [...workspacePriority.criticalItems, ...workspacePriority.attentionNow]
    .filter((item) => ALLOWED_ALERT_MODULES.has(item.module))
    .map(mapPriorityItemToAlert);

  const combinedAlerts = [...coreAlerts, ...priorityAlerts].reduce<LiveDashboardAlert[]>((accumulator, item) => {
    if (accumulator.some((existing) => existing.id === item.id)) {
      return accumulator;
    }

    accumulator.push(item);
    return accumulator;
  }, []);

  return {
    header: {
      eventName: currentEvent.name,
      organizationName: currentOrganizationName,
      eventType: getEventTypeLabel(currentEvent.eventType),
      statusLabel: getStatusLabel(currentEvent.status),
      liveLabel: getRealtimeLabel(workspaceStatus, currentEvent.status),
      liveTone: toLiveTone(getRealtimeTone(workspaceStatus, currentEvent.status)),
      timestampLabel: formatEventDateTime(currentEvent.startAt),
      venue: currentEvent.venue,
      summary: terminalEvent
        ? "Este evento está cerrado. La información permanece disponible en modo lectura."
        : workspacePriority.summary.message,
      nextAction: terminalEvent
        ? "Evento cerrado. Revisa historial, reservas y trazabilidad sin ejecutar mutaciones."
        : workspacePriority.summary.nextBestAction,
    },
    alertCount: combinedAlerts.length,
    kpis: [
      {
        label: "Ingresados",
        value: `${checkedInGuests}`,
        detail: `Confirmados en el evento activo · ${workspaceIntelligence.flow.checkInsPerMinute}/min`,
        tone: "success",
      },
      {
        label: "Pendientes",
        value: `${pendingGuests}`,
        detail: "Siguen esperando ingreso",
        tone: pendingGuests > 0 ? "warning" : "success",
      },
      {
        label: "Ocupación",
        value: `${occupancyPercent}%`,
        detail: `${workspaceIntelligence.capacity.used}/${totalCapacity} ocupados`,
        tone: occupancyPercent >= 90 || workspaceIntelligence.capacity.state === "blocked" ? "danger" : occupancyPercent >= 80 ? "warning" : "info",
      },
      {
        label: "Alertas",
        value: `${combinedAlerts.length}`,
        detail: combinedAlerts.length > 0 ? "Requieren atención operativa" : "Sin incidencias abiertas",
        tone: combinedAlerts.length > 0 ? "warning" : "success",
      },
    ],
    admission: {
      checkInsPerMinute: workspaceIntelligence.flow.checkInsPerMinute,
      averageCheckInIntervalMinutes: workspaceIntelligence.activity.averageCheckInIntervalMinutes,
      pendingQueue: workspaceIntelligence.flow.pendingGuests,
      recentCheckIns,
      blockedSignals,
      summary: workspaceIntelligence.flow.summary,
    },
    capacity: {
      used: workspaceIntelligence.capacity.used,
      total: totalCapacity,
      remaining: workspaceIntelligence.capacity.remaining,
      occupancyPercent,
      state: capacityState,
      summary: workspaceIntelligence.capacity.summary,
    },
    upcomingReservations: workspaceIntelligence.operations.upcomingReservations.slice(0, 3).map((reservation) => ({
      id: reservation.id,
      name: reservation.name,
      code: reservation.code,
      time: reservation.time,
      tableName: reservation.tableName,
      status: reservation.status,
      tone: reservation.statusTone,
      guestCount: reservation.metrics.guestCount,
      checkedInGuests: reservation.metrics.checkedInGuests,
      pendingGuests: reservation.metrics.pendingGuests,
    })),
    recentActivity: workspaceIntelligence.operations.recentActivity.slice(0, 3),
    quickActions: buildLiveDashboardQuickActions({ terminalEvent }),
  };
}
