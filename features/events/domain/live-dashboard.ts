import type { WorkspaceIntelligence } from "@/domain/workspace-intelligence";
import {
  getWorkspaceActionableAlertCount,
  type WorkspacePriorityItem,
  type WorkspacePrioritySnapshot,
} from "@/domain/workspace-priority";
import { getEventTypeLabel } from "@/features/events/domain";
import { resolveEventVenueDisplayName } from "@/features/events/domain/event-venue-boundary";
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
  alerts: LiveDashboardAlert[];
  statisticsCards: WorkspaceIntelligence["statistics"]["cards"];
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
  currentVenueName?: string;
  workspaceStatus: "loading" | "ready" | "empty" | "error";
  workspaceIntelligence: Pick<WorkspaceIntelligence, "activity" | "capacity" | "flow" | "access" | "operations" | "statistics">;
  workspacePriority: Pick<WorkspacePrioritySnapshot, "criticalItems" | "attentionNow" | "summary">;
};

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

function mapPriorityItemToAlert(item: WorkspacePriorityItem): LiveDashboardAlert {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    tone: item.tone,
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
  currentVenueName,
  workspaceStatus,
  workspaceIntelligence,
  workspacePriority,
}: LiveDashboardInput): LiveDashboardModel {
  const totalCapacity = workspaceIntelligence.capacity.used + workspaceIntelligence.capacity.remaining;
  const occupancyPercent = workspaceIntelligence.capacity.occupancyPercent;
  const recentCheckIns = workspaceIntelligence.operations.recentActivity.filter((event) => event.kind.startsWith("checkin.")).length;
  const blockedSignals =
    workspaceIntelligence.access.rejectedAttempts +
    workspaceIntelligence.access.duplicateAttempts +
    workspaceIntelligence.access.blockedGrants;
  const terminalEvent = isTerminalEventStatus(currentEvent.status);
  const alertCount = getWorkspaceActionableAlertCount(workspacePriority);
  const alertItems = [...workspacePriority.criticalItems, ...workspacePriority.attentionNow];
  const alerts = alertItems
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 6)
    .map(mapPriorityItemToAlert);

  const statisticsCards = workspaceIntelligence.statistics.cards;
  const totalReservations = statisticsCards.totalReservations;

  const capacityState: LiveDashboardModel["capacity"]["state"] =
    workspaceIntelligence.capacity.state === "blocked" ? "blocked" : workspaceIntelligence.capacity.state === "watch" ? "watch" : "stable";

  return {
    header: {
      eventName: currentEvent.name,
      organizationName: currentOrganizationName,
      eventType: getEventTypeLabel(currentEvent.eventType),
      statusLabel: getStatusLabel(currentEvent.status),
      liveLabel: getRealtimeLabel(workspaceStatus, currentEvent.status),
      liveTone: toLiveTone(getRealtimeTone(workspaceStatus, currentEvent.status)),
      timestampLabel: formatEventDateTime(currentEvent.startAt),
      venue: resolveEventVenueDisplayName({
        currentVenueName,
        eventVenue: currentEvent.venue,
      }),
      summary: terminalEvent
        ? "Este evento está cerrado. La información permanece disponible en modo lectura."
        : workspacePriority.summary.message,
      nextAction: terminalEvent
        ? "Evento cerrado. Revisa historial, reservas y trazabilidad sin ejecutar mutaciones."
        : workspacePriority.summary.nextBestAction,
    },
    alertCount,
    alerts,
    statisticsCards: workspaceIntelligence.statistics.cards,
    kpis: [
      {
        label: "Reservas activas",
        value: `${statisticsCards.activeReservations}`,
        detail: "Reservas confirmadas o en curso.",
        tone: "info",
      },
      {
        label: "Reservas confirmadas",
        value: `${statisticsCards.confirmedReservations}`,
        detail: "Reservas listas para operar.",
        tone: "success",
      },
      {
        label: "Reservas pendientes",
        value: `${statisticsCards.pendingReservations}`,
        detail: "Reservas todavía abiertas.",
        tone: statisticsCards.pendingReservations > 0 ? "warning" : "success",
      },
      {
        label: "Invitados esperados",
        value: `${statisticsCards.expectedGuests}`,
        detail: "Total de invitados del evento activo.",
        tone: "info",
      },
      {
        label: "Invitados ingresados",
        value: `${statisticsCards.checkedInGuests}`,
        detail: "Accesos confirmados.",
        tone: "success",
      },
      {
        label: "Invitados pendientes",
        value: `${statisticsCards.pendingGuests}`,
        detail: "Invitados por ingresar.",
        tone: statisticsCards.pendingGuests > 0 ? "warning" : "success",
      },
      {
        label: "Ocupación",
        value: `${occupancyPercent}%`,
        detail: `${workspaceIntelligence.capacity.used}/${totalCapacity} ocupados`,
        tone: occupancyPercent >= 90 || workspaceIntelligence.capacity.state === "blocked" ? "danger" : occupancyPercent >= 80 ? "warning" : "info",
      },
      {
        label: "Check-ins/min",
        value: `${workspaceIntelligence.flow.checkInsPerMinute}`,
        detail: totalReservations > 0 ? `${totalReservations} reservas en el evento activo` : "Promedio derivado del flujo activo.",
        tone: workspaceIntelligence.flow.checkInsPerMinute > 0 ? "success" : "info",
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
