import type { Event as PlatformEvent } from "@/features/domain/types";
import { buildOperationsSnapshot, type OperationsSnapshot } from "@/features/operations/domain/operations-domain";
import { buildAccessGrantFromGuest } from "@/features/access/domain/access-ledger";
import { normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import type { ReservationRecord, ReservationSummary } from "@/features/reservations/types";
import type { TableSummary } from "@/features/tables/types";
import { buildTimelineSummary } from "@/features/timeline/domain/timeline-domain";
import type { TimelineEvent } from "@/features/timeline/types";
import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import { buildDashboardSnapshot } from "@/features/check-in/domain/check-in-domain";

type WorkspaceIntensityTone = "success" | "warning" | "danger" | "info";
type WorkspaceInsightPriority = "critical" | "high" | "medium" | "low";
type WorkspaceInsightState = "blocked" | "watch" | "open" | "stable";
type WorkspaceInsightType = "attention" | "risk" | "optimization" | "trend" | "action";
type WorkspaceInsightModule = "Dashboard" | "Operations" | "Timeline" | "Reservations" | "Tables" | "Check-in" | "Statistics";

type WorkspaceRecommendation = {
  id: string;
  priority: WorkspaceInsightPriority;
  type: WorkspaceInsightType;
  title: string;
  description: string;
  suggestedAction: string;
  module: WorkspaceInsightModule;
  timestamp: string;
  state: WorkspaceInsightState;
  tone: WorkspaceIntensityTone;
};

type WorkspaceMetric = {
  label: string;
  value: string;
  detail: string;
  tone: WorkspaceIntensityTone;
};

type WorkspaceStateAlert = {
  id: string;
  title: string;
  description: string;
  tone: WorkspaceIntensityTone;
};

type WorkspaceHealth = {
  score: number;
  state: WorkspaceInsightState;
  title: string;
  description: string;
  modules: Array<{
    module: WorkspaceInsightModule;
    label: string;
    state: string;
    detail: string;
    tone: WorkspaceIntensityTone;
  }>;
  blockers: string[];
};

type WorkspaceActivity = {
  lastActivity: string;
  recentWindow: string;
  recentEvents: number;
  lastCheckInAt: string;
  lastReservationAt: string;
  checkInsPerMinute: number;
  averageCheckInIntervalMinutes: number;
  peakCheckInMinute: string;
  activeOperators: string[];
  state: WorkspaceInsightState;
  summary: string;
};

type WorkspaceCapacity = {
  used: number;
  remaining: number;
  occupancyPercent: number;
  activeTables: number;
  fullTables: number;
  overCapacityTables: number;
  freeTables: number;
  nearbyAvailableTables: number;
  state: WorkspaceInsightState;
  summary: string;
};

type WorkspaceFlow = {
  checkInsPerMinute: number;
  averageCheckInIntervalMinutes: number;
  pendingGuests: number;
  queueDepth: number;
  blockedGuests: number;
  reentryRisk: number;
  operatorStatus: string;
  state: WorkspaceInsightState;
  summary: string;
};

type WorkspaceRecommendations = Record<WorkspaceInsightModule, WorkspaceRecommendation[]> & {
  all: WorkspaceRecommendation[];
};

type WorkspaceCustomersInsight = {
  eventStats: Record<string, { expectedGuests: number; checkedIn: number; pending: number; attention: number }>;
  attentionGuests: Guest[];
  longPendingGuests: Guest[];
  neverCheckedInGuests: Guest[];
  followUpGuests: Guest[];
  blockedGuests: number;
};

type WorkspaceReservationInsight = {
  activeReservations: number;
  cancelledReservations: number;
  confirmedReservations: number;
  pendingReservations: number;
  expectedGuests: number;
  guestsCheckedIn: number;
  guestsPending: number;
  lastReservationAt: string;
  lastCheckInAt: string;
  lastModificationAt: string;
  presentGuests: number;
  remainingGuests: number;
};

type WorkspaceTableInsight = {
  activeTables: number;
  capacityUsed: number;
  capacityRemaining: number;
  freeTables: number;
  occupiedTables: number;
  fullTables: number;
  overCapacityTables: number;
  occupancyPercent: number;
  rotationPercent: number;
  operationalState: "healthy" | "watch" | "critical";
};

type WorkspaceAccessInsight = {
  totalGrants: number;
  activeGrants: number;
  usedGrants: number;
  revokedGrants: number;
  expiredGrants: number;
  blockedGrants: number;
  duplicateAttempts: number;
  rejectedAttempts: number;
  recentAccessEvents: number;
  state: WorkspaceInsightState;
  summary: string;
};

type WorkspaceTimelineInsight = {
  events: TimelineEvent[];
  summary: ReturnType<typeof buildTimelineSummary> & {
    lastActivity: string;
    checkInsPerMinute: number;
    averageCheckInIntervalMinutes: number;
    peakCheckInMinute: string;
  };
};

type WorkspaceStatisticsInsight = {
  metrics: WorkspaceMetric[];
  cards: {
    totalReservations: number;
    activeReservations: number;
    cancelledReservations: number;
    confirmedReservations: number;
    pendingReservations: number;
    expectedGuests: number;
    checkedInGuests: number;
    pendingGuests: number;
    noShows: number;
    capacityUsed: number;
    capacityRemaining: number;
    occupancyPercent: number;
    checkInsPerMinute: number;
    averageCheckInIntervalMinutes: number;
    peakCheckInMinute: string;
    lastCheckInAt: string;
    lastReservationAt: string;
    lastModificationAt: string;
    activeOperators: string[];
    recentActivity: number;
  };
  paidReservations: number;
  pendingPayments: number;
};

type WorkspaceIntelligence = {
  alerts: WorkspaceStateAlert[];
  recommendations: WorkspaceRecommendations;
  health: WorkspaceHealth;
  activity: WorkspaceActivity;
  capacity: WorkspaceCapacity;
  flow: WorkspaceFlow;
  dashboard: ReturnType<typeof buildDashboardSnapshot>;
  reservations: WorkspaceReservationInsight;
  tables: WorkspaceTableInsight;
  access: WorkspaceAccessInsight;
  customers: WorkspaceCustomersInsight;
  statistics: WorkspaceStatisticsInsight;
  timeline: WorkspaceTimelineInsight;
  operations: OperationsSnapshot;
};

function compareTime(a: string, b: string) {
  return timeToMinutes(a) - timeToMinutes(b);
}

function timeToMinutes(value: string) {
  const normalized = value.trim().split(" ").at(-1) ?? value.trim();
  const [hours, minutes] = normalized.split(":").map((part) => Number.parseInt(part, 10));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return -1;
  }

  return hours * 60 + minutes;
}

function latestTimestamp(values: Array<string | undefined | null>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => compareTime(b, a))[0] ?? "--:--";
}

function countActiveOperators(events: TimelineEvent[], guests: Guest[], checkIns: CheckIn[]) {
  const operators = new Set<string>();

  for (const entry of events) {
    const operator = typeof entry.metadata?.operator === "string" ? entry.metadata.operator : "";
    if (operator) operators.add(operator);
  }

  for (const guest of guests) {
    for (const activity of guest.operatorActivity) {
      if (activity.operator) {
        operators.add(activity.operator);
      }
    }
  }

  for (const checkIn of checkIns) {
    if (checkIn.operator) {
      operators.add(checkIn.operator);
    }
  }

  return Array.from(operators.values()).sort((a, b) => a.localeCompare(b));
}

function buildTimelineRates(checkIns: CheckIn[]) {
  const sorted = [...checkIns].sort((a, b) => compareTime(b.checkedInAt, a.checkedInAt));
  const perMinute = new Map<string, number>();

  for (const checkIn of sorted) {
    const minute = checkIn.checkedInAt.slice(-5);
    perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
  }

  const values = Array.from(perMinute.values());
  const checkInsPerMinute = sorted.length > 1
    ? Math.round(sorted.length / Math.max(timeToMinutes(sorted[0].checkedInAt) - timeToMinutes(sorted.at(-1)?.checkedInAt ?? sorted[0].checkedInAt) + 1, 1))
    : sorted.length;

  let totalIntervals = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    totalIntervals += Math.max(timeToMinutes(sorted[index - 1].checkedInAt) - timeToMinutes(sorted[index].checkedInAt), 0);
  }

  return {
    checkInsPerMinute,
    averageCheckInIntervalMinutes: sorted.length > 1 ? Math.round((totalIntervals / (sorted.length - 1)) * 10) / 10 : 0,
    peakCheckInMinute: Array.from(perMinute.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "--:--",
    perMinute,
    peakCount: values.sort((a, b) => b - a)[0] ?? 0,
  };
}

function priorityTone(priority: WorkspaceInsightPriority): WorkspaceIntensityTone {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "success";
}

function buildRecommendation(input: {
  id: string;
  priority: WorkspaceInsightPriority;
  type: WorkspaceInsightType;
  title: string;
  description: string;
  suggestedAction: string;
  module: WorkspaceInsightModule;
  timestamp: string;
  state: WorkspaceInsightState;
}): WorkspaceRecommendation {
  return {
    ...input,
    tone: priorityTone(input.priority),
  };
}

function buildWorkspaceAlerts({
  reservations,
  reservationSummaries,
  guests,
  tables,
  checkIns,
  timelineEvents,
}: {
  reservations: ReservationRecord[];
  reservationSummaries: ReservationSummary[];
  guests: Guest[];
  tables: TableSummary[];
  checkIns: CheckIn[];
  timelineEvents: TimelineEvent[];
}) {
  const alerts: WorkspaceStateAlert[] = [];
  const currentTime = timelineEvents.at(0)?.timestamp ?? checkIns.at(0)?.checkedInAt ?? reservations.at(0)?.updatedAt ?? "00:00";
  const currentMinutes = timeToMinutes(currentTime);

  if (!reservations.length && !guests.length) {
    alerts.push({
      id: "event-empty",
      title: "Evento vacío",
      description: "Todavía no hay reservas ni invitados cargados.",
      tone: "warning",
    });
  }

  const capacityUsed = tables.reduce((sum, table) => sum + table.metrics.assignedGuests, 0);
  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
  const occupancyPercent = Math.round((capacityUsed / Math.max(totalCapacity, 1)) * 100);

  if (occupancyPercent >= 90) {
    alerts.push({
      id: "capacity-critical",
      title: "Capacidad crítica",
      description: `La ocupación actual está en ${occupancyPercent}%.`,
      tone: "danger",
    });
  }

  tables.filter((table) => table.status === "Over Capacity").forEach((table) => {
    alerts.push({
      id: `table-over-${table.id}`,
      title: "Mesa sobreocupada",
      description: `${table.name} supera su capacidad.`,
      tone: "danger",
    });
  });

  reservationSummaries.filter((reservation) => reservation.metrics.guestCount === 0).forEach((reservation) => {
    alerts.push({
      id: `reservation-empty-${reservation.id}`,
      title: "Reserva sin invitados",
      description: `${reservation.name} no tiene invitados asociados.`,
      tone: "warning",
    });
  });

  const duplicateGuests = checkIns.filter((checkIn) => checkIn.status === "Duplicate Attempt");
  if (duplicateGuests.length) {
    alerts.push({
      id: "duplicate-guests",
      title: "Invitados duplicados",
      description: `${duplicateGuests.length} intentos duplicados detectados.`,
      tone: "warning",
    });
  }

  const reentryViolations = checkIns.filter((checkIn) => checkIn.attemptCount > checkIn.maxEntries || checkIn.status === "Duplicate Attempt");
  if (reentryViolations.length) {
    alerts.push({
      id: "reentry-violations",
      title: "Reingresos excesivos",
      description: `${reentryViolations.length} accesos excedieron el límite permitido.`,
      tone: "danger",
    });
  }

  const lastActivity = timelineEvents.at(0)?.timestamp ?? latestTimestamp(checkIns.map((item) => item.checkedInAt));
  if (currentMinutes - timeToMinutes(lastActivity) >= 30) {
    alerts.push({
      id: "activity-stopped",
      title: "Actividad detenida",
      description: "No hay actividad reciente desde hace demasiado tiempo.",
      tone: "warning",
    });
  }

  const lastCheckInAt = latestTimestamp(checkIns.map((item) => item.checkedInAt));
  if (currentMinutes - timeToMinutes(lastCheckInAt) >= 20 && guests.some((guest) => guest.admissionStatus === "Pendiente")) {
    alerts.push({
      id: "no-entry-window",
      title: "Sin ingresos recientes",
      description: "El evento lleva demasiado tiempo sin nuevos ingresos.",
      tone: "warning",
    });
  }

  const cancelledReservations = reservationSummaries.filter((reservation) => reservation.status === "Cancelled").length;
  if (cancelledReservations >= 3) {
    alerts.push({
      id: "many-cancellations",
      title: "Demasiadas cancelaciones",
      description: `${cancelledReservations} reservas canceladas requieren revisión.`,
      tone: "danger",
    });
  }

  const noShows = reservationSummaries.filter((reservation) => reservation.status === "No Show").length;
  if (noShows >= 2) {
    alerts.push({
      id: "high-no-shows",
      title: "No Shows altos",
      description: `${noShows} reservas marcadas como no show.`,
      tone: "warning",
    });
  }

  return alerts;
}

function buildWorkspaceSignals({
  reservationsActive,
  reservationsCancelled,
  reservationsConfirmed,
  reservationsPending,
  noShows,
  reservationSummaries,
  pendingGuests,
  blockedGuests,
  activeTables,
  freeTables,
  fullTables,
  overCapacityTables,
  capacityUsed,
  capacityRemaining,
  occupancyPercent,
  checkInsPerMinute,
  averageCheckInIntervalMinutes,
  peakCheckInMinute,
  activeOperators,
  lastActivity,
  lastCheckInAt,
  lastReservationAt,
  recentActivityCount,
  alertsCount,
  duplicateAttempts,
}: {
  reservationsActive: number;
  reservationsCancelled: number;
  reservationsConfirmed: number;
  reservationsPending: number;
  noShows: number;
  reservationSummaries: ReservationSummary[];
  pendingGuests: number;
  blockedGuests: number;
  activeTables: number;
  freeTables: number;
  fullTables: number;
  overCapacityTables: number;
  capacityUsed: number;
  capacityRemaining: number;
  occupancyPercent: number;
  checkInsPerMinute: number;
  averageCheckInIntervalMinutes: number;
  peakCheckInMinute: string;
  activeOperators: string[];
  lastActivity: string;
  lastCheckInAt: string;
  lastReservationAt: string;
  recentActivityCount: number;
  alertsCount: number;
  duplicateAttempts: number;
}) {
  const currentTimestamp = latestTimestamp([lastActivity, lastCheckInAt, lastReservationAt]);
  const currentMinutes = timeToMinutes(currentTimestamp);
  const minutesSinceLastActivity = currentMinutes >= 0 ? Math.max(currentMinutes - timeToMinutes(lastActivity), 0) : 0;
  const minutesSinceLastCheckIn = currentMinutes >= 0 ? Math.max(currentMinutes - timeToMinutes(lastCheckInAt), 0) : 0;
  const hasCapacityPressure = occupancyPercent >= 85 || overCapacityTables > 0;
  const hasFlowStall = pendingGuests > 0 && checkInsPerMinute === 0;
  const hasOperatorPressure = !activeOperators.length || minutesSinceLastActivity >= 30;

  const recommendationsByModule: WorkspaceRecommendations = {
    Dashboard: [],
    Operations: [],
    Timeline: [],
    Reservations: [],
    Tables: [],
    "Check-in": [],
    Statistics: [],
    all: [],
  };

  const pushRecommendation = (recommendation: Omit<WorkspaceRecommendation, "tone">) => {
    const item = buildRecommendation(recommendation);
    recommendationsByModule[recommendation.module].push(item);
    recommendationsByModule.all.push(item);
  };

  if (reservationsPending > 0) {
    pushRecommendation({
      id: "dashboard-reservations-pending",
      priority: "high",
      type: "attention",
      title: "Reservas sin confirmar",
      description: `${reservationsPending} reservas siguen abiertas y pueden bloquear el flujo.`,
      suggestedAction: "Confirmar o cancelar las reservas pendientes.",
      module: "Dashboard",
      timestamp: lastReservationAt,
      state: "open",
    });
  }

  if (hasCapacityPressure) {
    pushRecommendation({
      id: "dashboard-capacity-pressure",
      priority: occupancyPercent >= 90 || overCapacityTables > 0 ? "critical" : "high",
      type: "risk",
      title: occupancyPercent >= 90 ? "Capacidad crítica" : "Capacidad alta",
      description: `${occupancyPercent}% de ocupación y ${capacityRemaining} cupos disponibles.`,
      suggestedAction: freeTables > 0 ? "Usar mesas libres cercanas." : "Revisar asignaciones y liberar capacidad.",
      module: "Dashboard",
      timestamp: lastActivity,
      state: occupancyPercent >= 90 || overCapacityTables > 0 ? "blocked" : "watch",
    });
  }

  if (hasFlowStall && minutesSinceLastCheckIn >= 20) {
    pushRecommendation({
      id: "checkin-stalled",
      priority: "critical",
      type: "risk",
      title: "Check-in detenido",
      description: `Hay ${pendingGuests} invitados pendientes y no hubo ingresos recientes.`,
      suggestedAction: "Abrir Check-in y priorizar el ingreso de los pendientes.",
      module: "Check-in",
      timestamp: lastCheckInAt,
      state: "blocked",
    });
  }

  if (duplicateAttempts > 0) {
    pushRecommendation({
      id: "checkin-duplicate-attempts",
      priority: "high",
      type: "attention",
      title: "Reingresos excesivos",
      description: `${duplicateAttempts} intentos duplicados o bloqueados quedaron registrados.`,
      suggestedAction: "Revisar invitaciones usadas y bloquear intentos repetidos.",
      module: "Check-in",
      timestamp: lastActivity,
      state: "watch",
    });
  }

  if (blockedGuests > 0) {
    pushRecommendation({
      id: "checkin-blocked-guests",
      priority: "high",
      type: "risk",
      title: "Invitados bloqueados",
      description: `${blockedGuests} invitados siguen sin poder ingresar.`,
      suggestedAction: "Resolver el bloqueo o revalidar la invitación.",
      module: "Check-in",
      timestamp: lastActivity,
      state: "watch",
    });
  }

  if (reservationsActive > 0 && reservationsConfirmed === 0) {
    pushRecommendation({
      id: "reservations-unconfirmed",
      priority: "medium",
      type: "action",
      title: "Reservas aún sin confirmar",
      description: "La operación depende de confirmaciones pendientes.",
      suggestedAction: "Marcar las reservas listas antes de abrir más ingresos.",
      module: "Reservations",
      timestamp: lastReservationAt,
      state: "open",
    });
  }

  if (reservationsConfirmed > 0 && reservationsActive > reservationsConfirmed) {
    pushRecommendation({
      id: "reservations-incomplete",
      priority: "medium",
      type: "attention",
      title: "Reserva incompleta",
      description: "Hay reservas activas sin invitados o sin cierre operativo claro.",
      suggestedAction: "Completar invitados y revisar observaciones.",
      module: "Reservations",
      timestamp: lastReservationAt,
      state: "watch",
    });
  }

  if (reservationsCancelled >= 3) {
    pushRecommendation({
      id: "reservations-cancellations",
      priority: "high",
      type: "risk",
      title: "Demasiadas cancelaciones",
      description: `${reservationsCancelled} reservas canceladas requieren revisión.`,
      suggestedAction: "Revisar causa de cancelación y notificar a Operaciones.",
      module: "Reservations",
      timestamp: lastReservationAt,
      state: "watch",
    });
  }

  if (noShows >= 2) {
    pushRecommendation({
      id: "reservations-no-shows",
      priority: "high",
      type: "risk",
      title: "No shows elevados",
      description: `${noShows} reservas quedaron marcadas como no show.`,
      suggestedAction: "Revisar confirmaciones y mensajes previos.",
      module: "Statistics",
      timestamp: lastReservationAt,
      state: "watch",
    });
  }

  if (overCapacityTables > 0) {
    pushRecommendation({
      id: "tables-over-capacity",
      priority: "critical",
      type: "risk",
      title: "Mesa sobreocupada",
      description: `${overCapacityTables} mesas superan su capacidad.`,
      suggestedAction: "Mover invitados a una mesa cercana disponible.",
      module: "Tables",
      timestamp: lastActivity,
      state: "blocked",
    });
  }

  if (freeTables > 0 && pendingGuests > 0) {
    pushRecommendation({
      id: "tables-nearby-available",
      priority: "medium",
      type: "optimization",
      title: "Mesa disponible cercana",
      description: `Hay ${freeTables} mesas libres para ${pendingGuests} invitados pendientes.`,
      suggestedAction: "Redistribuir invitados pendientes hacia mesas disponibles.",
      module: "Tables",
      timestamp: lastActivity,
      state: "open",
    });
  }

  if (occupancyPercent >= 90) {
    pushRecommendation({
      id: "tables-capacity-critical",
      priority: "critical",
      type: "risk",
      title: "Capacidad crítica",
      description: `La ocupación alcanzó ${occupancyPercent}% sobre ${capacityUsed} invitados activos.`,
      suggestedAction: "Liberar capacidad o reasignar reservas ahora.",
      module: "Operations",
      timestamp: lastActivity,
      state: "blocked",
    });
  }

  if (recentActivityCount > 0) {
    pushRecommendation({
      id: "timeline-active",
      priority: "low",
      type: "trend",
      title: "Actividad en curso",
      description: `${recentActivityCount} eventos recientes alimentan el Timeline.`,
      suggestedAction: "Abrir Timeline para revisar el detalle operativo.",
      module: "Timeline",
      timestamp: lastActivity,
      state: "stable",
    });
  }

  if (minutesSinceLastActivity >= 30) {
    pushRecommendation({
      id: "timeline-stalled",
      priority: "critical",
      type: "risk",
      title: "Actividad detenida",
      description: "No hubo actividad relevante durante demasiado tiempo.",
      suggestedAction: "Verificar puerta, reservas y estado del evento activo.",
      module: "Timeline",
      timestamp: lastActivity,
      state: "blocked",
    });
  }

  if (averageCheckInIntervalMinutes >= 4 && pendingGuests > 0) {
    pushRecommendation({
      id: "checkin-slowing",
      priority: "medium",
      type: "trend",
      title: "Tiempo de ingreso aumentando",
      description: `El intervalo promedio es de ${averageCheckInIntervalMinutes} min.`,
      suggestedAction: "Priorizar el ingreso de grupos pendientes para reducir la fila.",
      module: "Check-in",
      timestamp: peakCheckInMinute,
      state: "watch",
    });
  }

  if (alertsCount > 0) {
    pushRecommendation({
      id: "operations-alerts",
      priority: alertsCount > 4 ? "critical" : "high",
      type: "attention",
      title: "Operación requiere atención",
      description: `${alertsCount} alertas siguen activas en el Workspace.`,
      suggestedAction: "Abrir Operations y resolver las alertas primero.",
      module: "Operations",
      timestamp: lastActivity,
      state: alertsCount > 4 ? "blocked" : "watch",
    });
  }

  if (hasOperatorPressure) {
    pushRecommendation({
      id: "operations-operator-idle",
      priority: "medium",
      type: "optimization",
      title: "Operador inactivo",
      description: "No hay operadores detectados en la actividad reciente.",
      suggestedAction: "Registrar una acción para reactivar el flujo.",
      module: "Operations",
      timestamp: lastActivity,
      state: "watch",
    });
  }

  if (hasFlowStall) {
    pushRecommendation({
      id: "checkin-no-throughput",
      priority: "critical",
      type: "risk",
      title: "Puerta congestionada",
      description: "Hay invitados pendientes pero el throughput de ingreso está en cero.",
      suggestedAction: "Abrir Check-in y registrar el siguiente ingreso ahora.",
      module: "Check-in",
      timestamp: lastCheckInAt,
      state: "blocked",
    });
  }

  if (reservationSummaries.some((reservation) => reservation.metrics.guestCount === 0)) {
    pushRecommendation({
      id: "reservations-empty",
      priority: "high",
      type: "attention",
      title: "Reserva sin invitados",
      description: "Algunas reservas todavía no tienen invitados cargados.",
      suggestedAction: "Agregar invitados antes de seguir operando.",
      module: "Reservations",
      timestamp: lastReservationAt,
      state: "watch",
    });
  }

  if (reservationSummaries.some((reservation) => reservation.status === "Pending" || reservation.status === "Draft")) {
    pushRecommendation({
      id: "reservations-pending",
      priority: "medium",
      type: "action",
      title: "Reservas pendientes de confirmación",
      description: "Hay reservas en estado abierto que pueden frenar el flujo.",
      suggestedAction: "Confirmar o descartar las reservas abiertas.",
      module: "Reservations",
      timestamp: lastReservationAt,
      state: "open",
    });
  }

  const score = Math.max(
    0,
    100
      - (occupancyPercent >= 90 ? 20 : occupancyPercent >= 85 ? 10 : 0)
      - (overCapacityTables > 0 ? 20 : 0)
      - Math.min(alertsCount * 4, 20)
      - (pendingGuests > 0 ? Math.min(15, Math.ceil(pendingGuests / 2)) : 0)
      - (reservationsCancelled >= 3 ? 10 : 0)
      - (noShows >= 2 ? 10 : 0)
      - (checkInsPerMinute === 0 && pendingGuests > 0 ? 15 : 0)
      - (!activeOperators.length ? 10 : 0),
  );

  const healthState: WorkspaceInsightState = score >= 85 ? "stable" : score >= 60 ? "watch" : "blocked";

  const modules = [
    {
      module: "Dashboard" as WorkspaceInsightModule,
      label: "Dashboard",
      state: occupancyPercent >= 90 || alertsCount > 0 ? "Atención" : "Correcto",
      detail: occupancyPercent >= 90 ? "La capacidad está al límite." : "Resumen operativo alineado.",
      tone: occupancyPercent >= 90 ? "warning" as WorkspaceIntensityTone : "success" as WorkspaceIntensityTone,
    },
    {
      module: "Reservations" as WorkspaceInsightModule,
      label: "Reservations",
      state: reservationsCancelled >= 3 || reservationSummaries.some((reservation) => reservation.metrics.guestCount === 0) ? "Atención" : "Correcto",
      detail: reservationsCancelled >= 3 ? "Demasiadas cancelaciones detectadas." : "Reservas listas para operar.",
      tone: reservationsCancelled >= 3 ? "warning" as WorkspaceIntensityTone : "success" as WorkspaceIntensityTone,
    },
    {
      module: "Tables" as WorkspaceInsightModule,
      label: "Tables",
      state: overCapacityTables > 0 || occupancyPercent >= 90 ? "Crítico" : freeTables > 0 ? "Correcto" : "Atención",
      detail: overCapacityTables > 0 ? "Existen mesas sobreocupadas." : freeTables > 0 ? "Hay capacidad disponible." : "La ocupación necesita revisión.",
      tone: overCapacityTables > 0 || occupancyPercent >= 90 ? "danger" as WorkspaceIntensityTone : freeTables > 0 ? "success" as WorkspaceIntensityTone : "warning" as WorkspaceIntensityTone,
    },
    {
      module: "Check-in" as WorkspaceInsightModule,
      label: "Check-in",
      state: pendingGuests > 0 || blockedGuests > 0 ? "Atención" : "Correcto",
      detail: pendingGuests > 0 ? "Hay invitados pendientes de ingreso." : "El acceso está sincronizado.",
      tone: pendingGuests > 0 || blockedGuests > 0 ? "warning" as WorkspaceIntensityTone : "success" as WorkspaceIntensityTone,
    },
    {
      module: "Timeline" as WorkspaceInsightModule,
      label: "Timeline",
      state: minutesSinceLastActivity >= 30 ? "Crítico" : recentActivityCount > 0 ? "Correcto" : "Atención",
      detail: minutesSinceLastActivity >= 30 ? "No hubo actividad reciente." : "La actividad continúa llegando.",
      tone: minutesSinceLastActivity >= 30 ? "danger" as WorkspaceIntensityTone : recentActivityCount > 0 ? "success" as WorkspaceIntensityTone : "warning" as WorkspaceIntensityTone,
    },
    {
      module: "Operations" as WorkspaceInsightModule,
      label: "Operations",
      state: alertsCount > 4 ? "Crítico" : alertsCount > 0 ? "Atención" : "Correcto",
      detail: alertsCount > 4 ? "Hay varias alertas activas." : alertsCount > 0 ? "Existen alertas abiertas." : "Sin incidencias abiertas.",
      tone: alertsCount > 4 ? "danger" as WorkspaceIntensityTone : alertsCount > 0 ? "warning" as WorkspaceIntensityTone : "success" as WorkspaceIntensityTone,
    },
  ];

  const activity: WorkspaceActivity = {
    lastActivity,
    recentWindow: recentActivityCount > 0 ? `Últimos ${Math.min(recentActivityCount, 10)} eventos` : "Sin actividad reciente",
    recentEvents: recentActivityCount,
    lastCheckInAt,
    lastReservationAt,
    checkInsPerMinute,
    averageCheckInIntervalMinutes,
    peakCheckInMinute,
    activeOperators,
    state: minutesSinceLastActivity >= 30 ? "blocked" : recentActivityCount > 0 ? "stable" : "watch",
    summary:
      minutesSinceLastActivity >= 30
        ? "La actividad está detenida."
        : recentActivityCount > 0
          ? `${recentActivityCount} movimientos recientes mantienen vivo el evento.`
          : "Todavía no hay suficiente movimiento para analizar.",
  };

  const capacity: WorkspaceCapacity = {
    used: capacityUsed,
    remaining: capacityRemaining,
    occupancyPercent,
    activeTables,
    fullTables,
    overCapacityTables,
    freeTables,
    nearbyAvailableTables: freeTables,
    state: overCapacityTables > 0 || occupancyPercent >= 90 ? "blocked" : occupancyPercent >= 85 ? "watch" : "stable",
    summary:
      overCapacityTables > 0
        ? "Existen mesas sobreocupadas."
        : occupancyPercent >= 90
          ? "La capacidad está crítica."
          : freeTables > 0
            ? "Hay capacidad cercana disponible."
            : "La ocupación sigue controlada.",
  };

  const flow: WorkspaceFlow = {
    checkInsPerMinute,
    averageCheckInIntervalMinutes,
    pendingGuests,
    queueDepth: pendingGuests + reservationsPending,
    blockedGuests,
    reentryRisk: duplicateAttempts,
    operatorStatus: !activeOperators.length
      ? "Sin operador activo"
      : minutesSinceLastActivity >= 30
        ? "Operador inactivo"
        : "Operación activa",
    state: checkInsPerMinute === 0 && pendingGuests > 0 ? "blocked" : averageCheckInIntervalMinutes >= 4 || pendingGuests > 0 ? "watch" : "stable",
    summary:
      checkInsPerMinute === 0 && pendingGuests > 0
        ? "La puerta está congestionada."
        : averageCheckInIntervalMinutes >= 4
          ? "El ingreso se está desacelerando."
          : "El flujo de admisión sigue estable.",
  };

  return {
    recommendations: recommendationsByModule,
    health: {
      score,
      state: healthState,
      title:
        healthState === "blocked"
          ? "Operación en riesgo"
          : healthState === "watch"
            ? "Operación con atención"
            : "Operación saludable",
      description:
        healthState === "blocked"
          ? "Hay bloqueos que requieren intervención inmediata."
          : healthState === "watch"
            ? "El evento está estable, pero con señales para vigilar."
            : "La operación se mantiene sincronizada.",
      modules,
      blockers: recommendationsByModule.all.filter((item) => item.state === "blocked" || item.priority === "critical").map((item) => item.title),
    },
    activity,
    capacity,
    flow,
  };
}

export function buildWorkspaceIntelligence({
  event,
  events,
  reservations,
  reservationSummaries,
  guests,
  tableSummaries,
  checkIns,
  attempts,
  timelineEvents,
}: {
  event: PlatformEvent;
  events: PlatformEvent[];
  reservations: ReservationRecord[];
  reservationSummaries: ReservationSummary[];
  guests: Guest[];
  tableSummaries: TableSummary[];
  checkIns: CheckIn[];
  attempts: CheckInAttempt[];
  timelineEvents: TimelineEvent[];
}): WorkspaceIntelligence {
  const eventReservations = reservations.filter((reservation) => reservation.eventId === event.id);
  const eventReservationSummaries = reservationSummaries.filter((reservation) => eventReservations.some((item) => item.id === reservation.id));
  const eventGuests = guests.filter((guest) => guest.eventId === event.id);
  const eventTables = tableSummaries.filter((table) => table.reservationIds.some((reservationId) => eventReservations.some((item) => item.id === reservationId)));
  const eventCheckIns = checkIns.filter((checkIn) => checkIn.eventId === event.id);
  const eventAccessGrants = eventGuests.map((guest) => {
    const reservation = eventReservations.find((item) => item.id === guest.reservationId) ?? null;
    return buildAccessGrantFromGuest(guest, reservation);
  });
  const eventTimeline = timelineEvents.filter((entry) => entry.reservationId ? eventReservations.some((reservation) => reservation.id === entry.reservationId) : entry.guestId ? eventGuests.some((guest) => guest.id === entry.guestId) : true);

  const checkedInGuests = eventGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const pendingGuests = eventGuests.filter((guest) => guest.admissionStatus === "Pendiente").length;
  const expectedGuests = eventGuests.length;
  const reservationsActive = eventReservationSummaries.filter((reservation) => normalizeReservationStatus(reservation.status) === "Confirmed" || normalizeReservationStatus(reservation.status) === "Checked In" || normalizeReservationStatus(reservation.status) === "Completed").length;
  const reservationsCancelled = eventReservationSummaries.filter((reservation) => normalizeReservationStatus(reservation.status) === "Cancelled").length;
  const reservationsPending = eventReservationSummaries.filter((reservation) => normalizeReservationStatus(reservation.status) === "Pending" || normalizeReservationStatus(reservation.status) === "Draft").length;
  const reservationsConfirmed = eventReservationSummaries.filter((reservation) => normalizeReservationStatus(reservation.status) === "Confirmed").length;
  const noShows = eventReservationSummaries.filter((reservation) => normalizeReservationStatus(reservation.status) === "No Show").length;
  const capacityUsed = eventTables.reduce((sum, table) => sum + table.metrics.assignedGuests, 0);
  const capacityRemaining = eventTables.reduce((sum, table) => sum + table.metrics.capacityRemaining, 0);
  const totalCapacity = eventTables.reduce((sum, table) => sum + table.capacity, 0);
  const occupancyPercent = Math.round((capacityUsed / Math.max(totalCapacity, 1)) * 100);
  const activeTables = eventTables.filter((table) => table.status !== "Closed").length;
  const freeTables = eventTables.filter((table) => table.status === "Available" && table.metrics.assignedGuests === 0).length;
  const occupiedTables = eventTables.filter((table) => table.status === "Partially Occupied" || table.status === "Reserved").length;
  const fullTables = eventTables.filter((table) => table.status === "Full").length;
  const overCapacityTables = eventTables.filter((table) => table.status === "Over Capacity").length;
  const rotationPercent = Math.round((checkedInGuests / Math.max(expectedGuests, 1)) * 100);
  const activeAccessGrants = eventAccessGrants.filter((grant) => grant.status === "active").length;
  const usedAccessGrants = eventAccessGrants.filter((grant) => grant.status === "used").length;
  const revokedAccessGrants = eventAccessGrants.filter((grant) => grant.status === "cancelled").length;
  const expiredAccessGrants = eventAccessGrants.filter((grant) => grant.status === "expired").length;
  const blockedAccessGrants = eventAccessGrants.filter((grant) => grant.status === "blocked").length;
  const duplicateAccessAttempts = eventCheckIns.filter((checkIn) => checkIn.status === "Duplicate Attempt").length;
  const rejectedAccessAttempts = eventCheckIns.filter((checkIn) => checkIn.status === "Rejected" || checkIn.status === "Blocked" || checkIn.status === "Expired" || checkIn.status === "Cancelled" || checkIn.status === "No Show").length;
  const recentAccessEvents = eventTimeline.filter((entry) => entry.metadata?.entryType === "access.grant" || entry.kind.startsWith("checkin.")).length;

  const rate = buildTimelineRates(eventCheckIns);
  const activeOperators = countActiveOperators(eventTimeline, eventGuests, eventCheckIns);
  const lastCheckInAt = latestTimestamp(eventCheckIns.map((item) => item.checkedInAt));
  const lastReservationAt = latestTimestamp(eventReservations.map((item) => item.updatedAt ?? item.createdAt));
  const lastModificationAt = latestTimestamp([
    lastCheckInAt,
    lastReservationAt,
    eventTimeline.at(0)?.timestamp,
    attempts.at(0)?.timestamp,
  ]);

  const customers: WorkspaceCustomersInsight = {
    eventStats: events.reduce<Record<string, { expectedGuests: number; checkedIn: number; pending: number; attention: number }>>((accumulator, currentEvent) => {
      const currentGuests = guests.filter((guest) => guest.eventId === currentEvent.id);
      const eventCheckedIn = currentGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
      accumulator[currentEvent.id] = {
        expectedGuests: currentGuests.length,
        checkedIn: eventCheckedIn,
        pending: Math.max(currentGuests.length - eventCheckedIn, 0),
        attention: currentGuests.filter((guest) => Boolean(guest.attention)).length,
      };
      accumulator[currentEvent.name] = accumulator[currentEvent.id];
      return accumulator;
    }, {}),
    attentionGuests: eventGuests.filter((guest) => Boolean(guest.attention)),
    longPendingGuests: eventGuests.filter((guest) => guest.admissionStatus === "Pendiente" && !guest.checkInTime),
    neverCheckedInGuests: eventGuests.filter((guest) => !guest.checkInTime && normalizeReservationStatus(guest.reservationStatus) !== "Cancelled"),
    followUpGuests: eventGuests.filter((guest) => guest.attentionTone === "warning" || guest.attentionTone === "danger" || guest.manualAdmission),
    blockedGuests: eventGuests.filter((guest) => guest.admissionStatus === "Bloqueada" || guest.admissionStatus === "Anulada").length,
  };

  const reservationsInsight: WorkspaceReservationInsight = {
    activeReservations: reservationsActive,
    cancelledReservations: reservationsCancelled,
    confirmedReservations: reservationsConfirmed,
    pendingReservations: reservationsPending,
    expectedGuests,
    guestsCheckedIn: checkedInGuests,
    guestsPending: pendingGuests,
    lastReservationAt,
    lastCheckInAt,
    lastModificationAt,
    presentGuests: checkedInGuests,
    remainingGuests: Math.max(expectedGuests - checkedInGuests, 0),
  };

  const tablesInsight: WorkspaceTableInsight = {
    activeTables,
    capacityUsed,
    capacityRemaining,
    freeTables,
    occupiedTables,
    fullTables,
    overCapacityTables,
    occupancyPercent,
    rotationPercent,
    operationalState: overCapacityTables > 0 || occupancyPercent >= 90 ? "critical" : fullTables > 0 || occupancyPercent >= 70 ? "watch" : "healthy",
  };

  const access: WorkspaceAccessInsight = {
    totalGrants: eventAccessGrants.length,
    activeGrants: activeAccessGrants,
    usedGrants: usedAccessGrants,
    revokedGrants: revokedAccessGrants,
    expiredGrants: expiredAccessGrants,
    blockedGrants: blockedAccessGrants,
    duplicateAttempts: duplicateAccessAttempts,
    rejectedAttempts: rejectedAccessAttempts,
    recentAccessEvents,
    state: rejectedAccessAttempts > 0 || duplicateAccessAttempts > 0 || blockedAccessGrants > 0
      ? "watch"
      : activeAccessGrants > 0
        ? "stable"
        : "open",
    summary:
      rejectedAccessAttempts > 0
        ? `${rejectedAccessAttempts} accesos rechazados o bloqueados requieren revisión.`
        : duplicateAccessAttempts > 0
          ? `${duplicateAccessAttempts} intentos duplicados siguen registrados.`
          : activeAccessGrants > 0
            ? `${activeAccessGrants} grants activos sostienen el ingreso.`
            : "No hay access grants activos en este evento.",
  };

  const timeline: WorkspaceTimelineInsight = {
    events: eventTimeline,
    summary: {
      ...buildTimelineSummary(eventTimeline),
      lastActivity: eventTimeline.at(0)?.timestamp ?? lastModificationAt,
      checkInsPerMinute: rate.checkInsPerMinute,
      averageCheckInIntervalMinutes: rate.averageCheckInIntervalMinutes,
      peakCheckInMinute: rate.peakCheckInMinute,
    },
  };

  const dashboard = buildDashboardSnapshot(
    event,
    eventGuests,
    eventReservationSummaries,
    eventTables,
  );

  const operations = buildOperationsSnapshot({
    eventId: event.id,
    reservations,
    reservationSummaries,
    guests,
    tableSummaries,
    attempts,
    checkIns,
    timelineEvents,
  });

  const alerts = buildWorkspaceAlerts({
    reservations: eventReservations,
    reservationSummaries: eventReservationSummaries,
    guests: eventGuests,
    tables: eventTables,
    checkIns: eventCheckIns,
    timelineEvents: eventTimeline,
  });
  const intelligenceSignals = buildWorkspaceSignals({
    reservationsActive,
    reservationsCancelled,
    reservationsConfirmed,
    reservationsPending,
    noShows,
    reservationSummaries: eventReservationSummaries,
    pendingGuests,
    blockedGuests: customers.blockedGuests,
    activeTables,
    freeTables,
    fullTables,
    overCapacityTables,
    capacityUsed,
    capacityRemaining,
    occupancyPercent,
    checkInsPerMinute: rate.checkInsPerMinute,
    averageCheckInIntervalMinutes: rate.averageCheckInIntervalMinutes,
    peakCheckInMinute: rate.peakCheckInMinute,
    activeOperators,
    lastActivity: eventTimeline.at(0)?.timestamp ?? lastModificationAt,
    lastCheckInAt,
    lastReservationAt,
    recentActivityCount: eventTimeline.length,
    alertsCount: alerts.length,
    duplicateAttempts: eventCheckIns.filter((checkIn) => checkIn.status === "Duplicate Attempt").length,
  });

  const statistics: WorkspaceStatisticsInsight = {
    metrics: [
      { label: "Reservas activas", value: `${reservationsActive}`, detail: "Reservas confirmadas o en curso.", tone: "info" },
      { label: "Reservas canceladas", value: `${reservationsCancelled}`, detail: "Reservas fuera del flujo activo.", tone: "danger" },
      { label: "Reservas confirmadas", value: `${reservationsConfirmed}`, detail: "Reservas listas para operar.", tone: "success" },
      { label: "Reservas pendientes", value: `${reservationsPending}`, detail: "Reservas todavía abiertas.", tone: "warning" },
      { label: "Invitados esperados", value: `${expectedGuests}`, detail: "Total de invitados del evento activo.", tone: "info" },
      { label: "Invitados ingresados", value: `${checkedInGuests}`, detail: "Accesos confirmados.", tone: "success" },
      { label: "Invitados pendientes", value: `${pendingGuests}`, detail: "Invitados por ingresar.", tone: "warning" },
      { label: "Capacidad utilizada", value: `${capacityUsed}`, detail: `${occupancyPercent}% de ocupación sobre la capacidad total.`, tone: "info" },
      { label: "Capacidad restante", value: `${capacityRemaining}`, detail: "Espacios libres en mesas activas.", tone: "success" },
      { label: "No Shows", value: `${noShows}`, detail: "Reservas marcadas como no show.", tone: "warning" },
      { label: "Check-ins por minuto", value: `${rate.checkInsPerMinute}`, detail: "Promedio derivado del flujo activo.", tone: "info" },
      { label: "Intervalo promedio", value: `${rate.averageCheckInIntervalMinutes} min`, detail: "Tiempo medio entre ingresos.", tone: "info" },
    ],
    cards: {
      totalReservations: eventReservationSummaries.length,
      activeReservations: reservationsActive,
      cancelledReservations: reservationsCancelled,
      confirmedReservations: reservationsConfirmed,
      pendingReservations: reservationsPending,
      expectedGuests,
      checkedInGuests,
      pendingGuests,
      noShows,
      capacityUsed,
      capacityRemaining,
      occupancyPercent,
      checkInsPerMinute: rate.checkInsPerMinute,
      averageCheckInIntervalMinutes: rate.averageCheckInIntervalMinutes,
      peakCheckInMinute: rate.peakCheckInMinute,
      lastCheckInAt,
      lastReservationAt,
      lastModificationAt,
      activeOperators,
      recentActivity: eventTimeline.length,
    },
    paidReservations: eventReservationSummaries.filter((reservation) => reservation.paymentStatus === "Pagado").length,
    pendingPayments: eventReservationSummaries.filter((reservation) => reservation.paymentStatus === "Pendiente").length,
  };

  return {
    alerts,
    recommendations: intelligenceSignals.recommendations,
    health: intelligenceSignals.health,
    activity: intelligenceSignals.activity,
    capacity: intelligenceSignals.capacity,
    flow: intelligenceSignals.flow,
    dashboard,
    reservations: reservationsInsight,
    tables: tablesInsight,
    access,
    customers,
    statistics,
    timeline,
    operations,
  };
}

export type {
  WorkspaceIntelligence,
  WorkspaceReservationInsight,
  WorkspaceStatisticsInsight,
  WorkspaceTableInsight,
  WorkspaceTimelineInsight,
  WorkspaceCustomersInsight,
  WorkspaceStateAlert,
};
