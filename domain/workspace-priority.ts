import type { WorkspaceIntelligence } from "@/domain/workspace-intelligence";
import type { TimelineEvent } from "@/features/timeline/types";

export type WorkspacePriorityLevel = "critical" | "high" | "medium" | "low";
export type WorkspacePriorityModule =
  | "Dashboard"
  | "Operations"
  | "Timeline"
  | "Reservations"
  | "Tables"
  | "Check-in"
  | "Statistics";
export type WorkspacePriorityCategory =
  | "dashboard"
  | "operations"
  | "timeline"
  | "reservations"
  | "tables"
  | "check-in"
  | "statistics"
  | "capacity"
  | "flow"
  | "health";

export type WorkspacePriorityItem = {
  id: string;
  title: string;
  description: string;
  module: WorkspacePriorityModule;
  category: WorkspacePriorityCategory;
  priority: WorkspacePriorityLevel;
  severity: WorkspacePriorityLevel;
  confidence: number;
  requiresAction: boolean;
  blocking: boolean;
  timestamp: string;
  expiresAt: string;
  state: string;
  tone: "success" | "warning" | "danger" | "info";
  route: string;
};

export type WorkspacePrioritySummary = {
  critical: number;
  attention: number;
  healthy: number;
  message: string;
  nextBestAction: string;
  canIgnore: string;
};

export type WorkspacePrioritySnapshot = {
  criticalItems: WorkspacePriorityItem[];
  attentionNow: WorkspacePriorityItem[];
  recentChanges: TimelineEvent[];
  healthySystems: WorkspacePriorityItem[];
  summary: WorkspacePrioritySummary;
  nextBestActions: WorkspacePriorityItem[];
  byModule: Record<WorkspacePriorityModule, WorkspacePriorityItem[]>;
  allItems: WorkspacePriorityItem[];
};

const MODULE_ROUTE: Record<WorkspacePriorityModule, string> = {
  Dashboard: "/",
  Operations: "/operations",
  Timeline: "/timeline",
  Reservations: "/reservations",
  Tables: "/tables",
  "Check-in": "/check-in",
  Statistics: "/statistics",
};

const MODULE_CATEGORY: Record<WorkspacePriorityModule, WorkspacePriorityCategory> = {
  Dashboard: "dashboard",
  Operations: "operations",
  Timeline: "timeline",
  Reservations: "reservations",
  Tables: "tables",
  "Check-in": "check-in",
  Statistics: "statistics",
};

function timeToMinutes(value: string) {
  const normalized = value.trim().split(" ").at(-1) ?? value.trim();
  const [hours, minutes] = normalized.split(":").map((part) => Number.parseInt(part, 10));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return -1;
  }

  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const mins = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function addMinutes(timestamp: string, minutes: number) {
  const parsed = timeToMinutes(timestamp);
  if (parsed < 0) {
    return timestamp;
  }

  return minutesToTime(parsed + minutes);
}

function toneToPriority(tone: "success" | "warning" | "danger" | "info") {
  if (tone === "danger") return "critical";
  if (tone === "warning") return "high";
  if (tone === "info") return "medium";
  return "low";
}

function toneToConfidence(tone: "success" | "warning" | "danger" | "info") {
  if (tone === "danger") return 0.96;
  if (tone === "warning") return 0.9;
  if (tone === "info") return 0.78;
  return 0.64;
}

function priorityWeight(priority: WorkspacePriorityLevel) {
  if (priority === "critical") return 3;
  if (priority === "high") return 2;
  if (priority === "medium") return 1;
  return 0;
}

function resolveModule(text: string, fallback: WorkspacePriorityModule = "Operations"): WorkspacePriorityModule {
  const normalized = text.toLowerCase();

  if (normalized.includes("check-in") || normalized.includes("ingreso") || normalized.includes("qr") || normalized.includes("puerta")) {
    return "Check-in";
  }

  if (normalized.includes("mesa") || normalized.includes("capacidad") || normalized.includes("asiento") || normalized.includes("ocupación")) {
    return "Tables";
  }

  if (normalized.includes("reserva") || normalized.includes("invitado") || normalized.includes("cancel")) {
    return "Reservations";
  }

  if (normalized.includes("timeline") || normalized.includes("actividad") || normalized.includes("historial")) {
    return "Timeline";
  }

  if (normalized.includes("estad") || normalized.includes("metric") || normalized.includes("analytics") || normalized.includes("ocupación")) {
    return "Statistics";
  }

  if (normalized.includes("dashboard") || normalized.includes("capacidad crítica") || normalized.includes("operación")) {
    return "Dashboard";
  }

  return fallback;
}

function buildItem(input: {
  id: string;
  title: string;
  description: string;
  module: WorkspacePriorityModule;
  priority: WorkspacePriorityLevel;
  timestamp: string;
  requiresAction?: boolean;
  blocking?: boolean;
  confidence?: number;
  source?: "alert" | "recommendation" | "health";
  tone?: "success" | "warning" | "danger" | "info";
  state?: string;
}): WorkspacePriorityItem {
  const priority = input.priority;
  const tone = input.tone ?? (priority === "critical" ? "danger" : priority === "high" ? "warning" : priority === "medium" ? "info" : "success");

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    module: input.module,
    category: MODULE_CATEGORY[input.module],
    priority,
    severity: priority,
    confidence: input.confidence ?? toneToConfidence(tone),
    requiresAction: input.requiresAction ?? priority !== "low",
    blocking: input.blocking ?? priority === "critical",
    timestamp: input.timestamp,
    expiresAt: addMinutes(input.timestamp, priority === "critical" ? 5 : priority === "high" ? 10 : priority === "medium" ? 20 : 30),
    state: input.state ?? (priority === "critical" ? "blocked" : priority === "high" ? "watch" : "stable"),
    tone,
    route: MODULE_ROUTE[input.module],
  };
}

function comparePriority(a: WorkspacePriorityItem, b: WorkspacePriorityItem) {
  const priorityDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
  if (priorityDiff !== 0) return priorityDiff;

  const timeDiff = timeToMinutes(b.timestamp) - timeToMinutes(a.timestamp);
  if (timeDiff !== 0) return timeDiff;

  return b.confidence - a.confidence;
}

function compareTimeline(a: TimelineEvent, b: TimelineEvent) {
  const timeDiff = timeToMinutes(b.timestamp) - timeToMinutes(a.timestamp);
  if (timeDiff !== 0) return timeDiff;

  const toneWeight = (tone: TimelineEvent["tone"]) => (tone === "danger" ? 3 : tone === "warning" ? 2 : tone === "success" ? 1 : 0);
  const toneDiff = toneWeight(b.tone) - toneWeight(a.tone);
  if (toneDiff !== 0) return toneDiff;

  return b.id.localeCompare(a.id);
}

function isOperationalCheckIn(event: TimelineEvent) {
  return event.kind === "checkin.success" || event.kind === "checkin.manual";
}

function buildRecentTimelineWindow(events: TimelineEvent[], limit: number) {
  const window = events.slice(0, limit);
  const hasOperationalCheckIn = window.some(isOperationalCheckIn);

  if (hasOperationalCheckIn) {
    return window;
  }

  const fallbackOperationalCheckIn = events.find(isOperationalCheckIn);

  if (!fallbackOperationalCheckIn) {
    return window;
  }

  if (window.length < limit) {
    return [...window, fallbackOperationalCheckIn].sort(compareTimeline);
  }

  const nextWindow = [...window];
  nextWindow[nextWindow.length - 1] = fallbackOperationalCheckIn;

  return nextWindow.sort(compareTimeline);
}

function mapAlertToItem(alert: WorkspaceIntelligence["alerts"][number]) {
  const moduleName = resolveModule(`${alert.title} ${alert.description}`);
  const priority = toneToPriority(alert.tone);

  return buildItem({
    id: `alert-${alert.id}`,
    title: alert.title,
    description: alert.description,
    module: moduleName,
    priority,
    timestamp: "00:00",
    requiresAction: priority !== "low",
    blocking: priority === "critical",
    confidence: toneToConfidence(alert.tone),
    tone: alert.tone,
    source: "alert",
    state: priority === "critical" ? "blocked" : priority === "high" ? "watch" : "stable",
  });
}

function mapRecommendationToItem(recommendation: WorkspaceIntelligence["recommendations"]["all"][number]) {
  const priority = recommendation.priority;

  return buildItem({
    id: recommendation.id,
    title: recommendation.title,
    description: `${recommendation.description} · ${recommendation.suggestedAction}`,
    module: recommendation.module,
    priority,
    timestamp: recommendation.timestamp,
    requiresAction: recommendation.state !== "stable",
    blocking: recommendation.state === "blocked" || recommendation.priority === "critical",
    confidence: priority === "critical" ? 0.95 : priority === "high" ? 0.9 : priority === "medium" ? 0.82 : 0.7,
    tone: recommendation.tone,
    source: "recommendation",
    state: recommendation.state,
  });
}

function mapHealthyModule(moduleItem: WorkspaceIntelligence["health"]["modules"][number]) {
  return buildItem({
    id: `health-${moduleItem.module}`,
    title: moduleItem.label,
    description: moduleItem.detail,
    module: moduleItem.module,
    priority: moduleItem.tone === "success" ? "low" : "medium",
    timestamp: "00:00",
    requiresAction: false,
    blocking: false,
    confidence: moduleItem.tone === "success" ? 0.72 : 0.6,
    tone: moduleItem.tone,
    source: "health",
    state: moduleItem.tone === "success" ? "stable" : "watch",
  });
}

export function buildWorkspacePrioritySnapshot(workspaceIntelligence: WorkspaceIntelligence): WorkspacePrioritySnapshot {
  const alertItems = workspaceIntelligence.alerts.map(mapAlertToItem);
  const recommendationItems = workspaceIntelligence.recommendations.all.map(mapRecommendationToItem);
  const healthItems = workspaceIntelligence.health.modules.map(mapHealthyModule);

  const allItems = [...alertItems, ...recommendationItems].sort(comparePriority);

  const byModule = allItems.reduce<Record<WorkspacePriorityModule, WorkspacePriorityItem[]>>(
    (accumulator, item) => {
      accumulator[item.module].push(item);
      return accumulator;
    },
    {
      Dashboard: [],
      Operations: [],
      Timeline: [],
      Reservations: [],
      Tables: [],
      "Check-in": [],
      Statistics: [],
    },
  );

  const criticalItems = allItems.filter((item) => item.priority === "critical" || item.blocking).slice(0, 8);
  const attentionNow = allItems.filter((item) => item.requiresAction && item.priority !== "low").slice(0, 8);
  const nextBestActions = [...allItems]
    .filter((item) => item.requiresAction)
    .sort(comparePriority)
    .slice(0, 6);
  const recentChanges = buildRecentTimelineWindow([...workspaceIntelligence.timeline.events].sort(compareTimeline), 8);
  const healthySystems = healthItems.sort(comparePriority);

  const criticalCount = criticalItems.length;
  const attentionCount = attentionNow.length;
  const healthyCount = healthySystems.length;

  return {
    criticalItems,
    attentionNow,
    recentChanges,
    healthySystems,
    nextBestActions,
    byModule,
    allItems,
    summary: {
      critical: criticalCount,
      attention: attentionCount,
      healthy: healthyCount,
      message:
        criticalCount > 0
          ? `${criticalCount} bloqueos requieren intervención inmediata.`
          : attentionCount > 0
            ? `${attentionCount} señales requieren atención ahora.`
            : "La operación está estable y priorizada.",
      nextBestAction: nextBestActions[0]?.title ?? "Sin acciones pendientes",
      canIgnore:
        healthyCount > 0
          ? `${healthyCount} sistemas están saludables y pueden ignorarse por ahora.`
          : "No hay sistemas saludables para priorizar.",
    },
  };
}
