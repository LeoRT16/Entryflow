import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildLiveDashboardModel, buildLiveDashboardQuickActions } from "../features/events/domain/live-dashboard";
import type { WorkspaceIntelligence } from "../domain/workspace-intelligence";
import type { WorkspacePrioritySnapshot } from "../domain/workspace-priority";
import type { ReservationSummary } from "../features/reservations/types";
import type { TimelineEvent } from "../features/timeline/types";

function buildReservationSummary(overrides: Partial<ReservationSummary> = {}): ReservationSummary {
  return {
    id: "reservation-1",
    code: "RES-001",
    name: "Mesa 1 · Entrada principal",
    eventId: "event-1",
    eventName: "Live Event",
    date: "13 de agosto de 2026",
    time: "21:00",
    tableName: "Mesa 1",
    status: "Confirmed",
    statusTone: "info",
    metrics: {
      guestCount: 8,
      confirmedGuests: 8,
      pendingGuests: 4,
      checkedInGuests: 4,
      cancelledGuests: 0,
      attendancePercent: 50,
      occupancyPercent: 50,
      capacityRemaining: 4,
      lastCheckInAt: "19:04",
    },
    paymentStatus: "Pagado",
    notes: "",
    holderName: "Sofía Rivas",
    holderDocument: "1234567",
    holderWhatsapp: "77777777",
    guests: [],
    timeline: [],
    ...overrides,
  } as unknown as ReservationSummary;
}

function buildTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "timeline-1",
    eventId: "event-1",
    kind: "checkin.success",
    title: "Ingreso validado",
    description: "Un invitado completó el check-in.",
    timestamp: "19:04",
    tone: "success",
    icon: "checkin",
    metadata: {},
    ...overrides,
  } as TimelineEvent;
}

function buildWorkspacePriority(overrides: Partial<WorkspacePrioritySnapshot> = {}): WorkspacePrioritySnapshot {
  return {
    criticalItems: [],
    attentionNow: [],
    recentChanges: [],
    healthySystems: [],
    summary: {
      critical: 0,
      attention: 0,
      healthy: 6,
      message: "La operación está estable y priorizada.",
      nextBestAction: "Revisar la puerta y mantener el ingreso sincronizado.",
      canIgnore: "Los sistemas saludables no requieren atención ahora.",
    },
    nextBestActions: [],
    byModule: {
      Dashboard: [],
      Operations: [],
      Timeline: [],
      Reservations: [],
      Tables: [],
      "Check-in": [],
      Statistics: [],
    },
    allItems: [],
    ...overrides,
  } as WorkspacePrioritySnapshot;
}

function buildWorkspaceIntelligence(overrides: Partial<WorkspaceIntelligence> = {}): WorkspaceIntelligence {
  return {
    alerts: [],
    recommendations: {
      all: [],
      Dashboard: [],
      Operations: [],
      Timeline: [],
      Reservations: [],
      Tables: [],
      "Check-in": [],
      Statistics: [],
    },
    health: {
      score: 92,
      state: "stable",
      title: "Operación saludable",
      description: "La superficie viva está sincronizada.",
      modules: [],
      blockers: [],
    },
    activity: {
      lastActivity: "19:04",
      recentWindow: "15 min",
      recentEvents: 1,
      lastCheckInAt: "19:04",
      lastReservationAt: "18:58",
      checkInsPerMinute: 2,
      averageCheckInIntervalMinutes: 4,
      peakCheckInMinute: "19:00",
      activeOperators: ["Ana"],
      state: "stable",
      summary: "Ingreso fluido.",
    },
    capacity: {
      used: 40,
      remaining: 10,
      occupancyPercent: 80,
      activeTables: 8,
      fullTables: 2,
      overCapacityTables: 0,
      freeTables: 3,
      nearbyAvailableTables: 1,
      state: "watch",
      summary: "Ocupación al 80%.",
    },
    flow: {
      checkInsPerMinute: 2,
      averageCheckInIntervalMinutes: 4,
      pendingGuests: 5,
      queueDepth: 5,
      blockedGuests: 1,
      reentryRisk: 0,
      operatorStatus: "Puerta activa",
      state: "watch",
      summary: "5 invitados aún esperan ingresar.",
    },
    dashboard: {
      activeEvent: {
        id: "event-1",
        name: "Live Event",
        status: "En curso",
        date: "13 de agosto de 2026",
        startsAt: "21:00",
        expectedGuests: 50,
        checkedIn: 30,
        pending: 20,
        reservations: 6,
        attention: 2,
      },
      currentEvent: {
        id: "event-1",
        name: "Live Event",
        status: "En curso",
        date: "13 de agosto de 2026",
        startsAt: "21:00",
        expectedGuests: 50,
        checkedIn: 30,
        pending: 20,
        reservations: 6,
        attention: 2,
      },
      summaryMetrics: [],
      recentReservations: [],
      currentEventSummary: {
        name: "Live Event",
        date: "13 de agosto de 2026",
        startsAt: "21:00",
        reservations: 6,
        expectedGuests: 50,
        checkedIn: 30,
        pending: 20,
      },
      eventStats: {},
    },
    reservations: {
      activeReservations: 6,
      cancelledReservations: 0,
      confirmedReservations: 5,
      pendingReservations: 1,
      expectedGuests: 50,
      guestsCheckedIn: 30,
      guestsPending: 20,
      lastReservationAt: "18:58",
      lastCheckInAt: "19:04",
      lastModificationAt: "19:05",
      presentGuests: 30,
      remainingGuests: 20,
    },
    tables: {
      activeTables: 8,
      capacityUsed: 40,
      capacityRemaining: 10,
      freeTables: 3,
      occupiedTables: 5,
      fullTables: 2,
      overCapacityTables: 0,
      occupancyPercent: 80,
      rotationPercent: 30,
      operationalState: "healthy",
    },
    access: {
      totalGrants: 50,
      activeGrants: 42,
      usedGrants: 8,
      revokedGrants: 0,
      expiredGrants: 0,
      blockedGrants: 1,
      duplicateAttempts: 1,
      rejectedAttempts: 0,
      recentAccessEvents: 2,
      state: "watch",
      summary: "1 acceso bloqueado y 1 intento duplicado.",
    },
    customers: {
      eventStats: {},
      attentionGuests: [],
      longPendingGuests: [],
      neverCheckedInGuests: [],
      followUpGuests: [],
      blockedGuests: 1,
    },
    statistics: {
      metrics: [],
      cards: {
        totalReservations: 6,
        activeReservations: 6,
        cancelledReservations: 0,
        confirmedReservations: 5,
        pendingReservations: 1,
        expectedGuests: 50,
        checkedInGuests: 30,
        pendingGuests: 20,
        noShows: 0,
        capacityUsed: 40,
        capacityRemaining: 10,
        occupancyPercent: 80,
        checkInsPerMinute: 2,
        averageCheckInIntervalMinutes: 4,
        peakCheckInMinute: "19:00",
        lastCheckInAt: "19:04",
        lastReservationAt: "18:58",
        lastModificationAt: "19:05",
        activeOperators: ["Ana"],
        recentActivity: 1,
      },
      paidReservations: 5,
      pendingPayments: 1,
    },
    timeline: {
      events: [buildTimelineEvent()],
      summary: {
        lastActivity: "19:04",
        recentWindow: "15 min",
        recentEvents: 1,
        checkInsPerMinute: 2,
        averageCheckInIntervalMinutes: 4,
        peakCheckInMinute: "19:00",
      },
    },
    operations: {
      metrics: [],
      quickSummary: [],
      upcomingReservations: [buildReservationSummary()],
      alerts: [],
      criticalTables: {
        full: [],
        overCapacity: [],
        empty: [],
      },
      recentActivity: [buildTimelineEvent()],
    },
    ...overrides,
  } as WorkspaceIntelligence;
}

function buildInput(overrides: {
  workspaceStatus?: "loading" | "ready" | "empty" | "error";
  capacityState?: "stable" | "watch" | "blocked";
  pendingGuests?: number;
  blockedGrants?: number;
  duplicateAttempts?: number;
  rejectedAttempts?: number;
  checkedInGuests?: number;
  expectedGuests?: number;
  occupancyPercent?: number;
  used?: number;
  remaining?: number;
  recentCheckIns?: number;
  alerts?: WorkspacePrioritySnapshot["criticalItems"];
  attention?: WorkspacePrioritySnapshot["attentionNow"];
} = {}) {
  const workspaceIntelligence = buildWorkspaceIntelligence({
    capacity: {
      used: overrides.used ?? 40,
      remaining: overrides.remaining ?? 10,
      occupancyPercent: overrides.occupancyPercent ?? 80,
      activeTables: 8,
      fullTables: 2,
      overCapacityTables: overrides.capacityState === "blocked" ? 1 : 0,
      freeTables: 3,
      nearbyAvailableTables: 1,
      state: overrides.capacityState ?? "watch",
      summary:
        overrides.capacityState === "blocked"
          ? "Capacidad crítica. Ya no quedan cupos operativos."
          : overrides.capacityState === "watch"
            ? "Capacidad alta. Vigila el ingreso."
            : "Operación estable.",
    },
    flow: {
      checkInsPerMinute: 2,
      averageCheckInIntervalMinutes: 4,
      pendingGuests: overrides.pendingGuests ?? 5,
      queueDepth: overrides.pendingGuests ?? 5,
      blockedGuests: 1,
      reentryRisk: 0,
      operatorStatus: "Puerta activa",
      state: overrides.capacityState ?? "watch",
      summary: overrides.pendingGuests === 0 ? "No hay cola de ingreso." : `${overrides.pendingGuests ?? 5} invitados siguen pendientes.`,
    },
    access: {
      totalGrants: 50,
      activeGrants: 42,
      usedGrants: 8,
      revokedGrants: 0,
      expiredGrants: 0,
      blockedGrants: overrides.blockedGrants ?? 1,
      duplicateAttempts: overrides.duplicateAttempts ?? 1,
      rejectedAttempts: overrides.rejectedAttempts ?? 0,
      recentAccessEvents: 2,
      state: overrides.blockedGrants || overrides.duplicateAttempts || overrides.rejectedAttempts ? "watch" : "stable",
      summary:
        overrides.blockedGrants || overrides.duplicateAttempts || overrides.rejectedAttempts
          ? "Existen bloqueos o intentos duplicados."
          : "Sin señales de acceso problemático.",
    },
    statistics: {
      metrics: [],
      cards: {
        totalReservations: 6,
        activeReservations: 6,
        cancelledReservations: 0,
        confirmedReservations: 5,
        pendingReservations: overrides.pendingGuests ?? 5,
        expectedGuests: overrides.expectedGuests ?? 50,
        checkedInGuests: overrides.checkedInGuests ?? 30,
        pendingGuests: overrides.expectedGuests !== undefined && overrides.checkedInGuests !== undefined
          ? Math.max((overrides.expectedGuests ?? 50) - (overrides.checkedInGuests ?? 30), 0)
          : 20,
        noShows: 0,
        capacityUsed: overrides.used ?? 40,
        capacityRemaining: overrides.remaining ?? 10,
        occupancyPercent: overrides.occupancyPercent ?? 80,
        checkInsPerMinute: 2,
        averageCheckInIntervalMinutes: 4,
        peakCheckInMinute: "19:00",
        lastCheckInAt: "19:04",
        lastReservationAt: "18:58",
        lastModificationAt: "19:05",
        activeOperators: ["Ana"],
        recentActivity: overrides.recentCheckIns ?? 1,
      },
      paidReservations: 5,
      pendingPayments: 1,
    },
    operations: {
      metrics: [],
      quickSummary: [],
      upcomingReservations: [buildReservationSummary()],
      alerts: [],
      criticalTables: {
        full: [],
        overCapacity: [],
        empty: [],
      },
      recentActivity: Array.from({ length: overrides.recentCheckIns ?? 1 }, (_, index) =>
        buildTimelineEvent({
          id: `timeline-${index + 1}`,
          timestamp: `19:0${index + 4}`,
        }),
      ),
    },
  });

  const workspacePriority = buildWorkspacePriority({
    criticalItems: overrides.alerts ?? [
      {
        id: "priority-table",
        title: "Mesa sobreocupada",
        description: "Mesa 3 excedió su capacidad.",
        module: "Tables",
        category: "tables",
        priority: "critical",
        severity: "critical",
        confidence: 0.98,
        requiresAction: true,
        blocking: true,
        timestamp: "19:02",
        expiresAt: "19:07",
        state: "blocked",
        tone: "danger",
        route: "/tables",
      },
    ],
    attentionNow: overrides.attention ?? [
      {
        id: "priority-checkin",
        title: "Segundo intento",
        description: "Un acceso bloqueado requiere revisión.",
        module: "Check-in",
        category: "check-in",
        priority: "high",
        severity: "high",
        confidence: 0.92,
        requiresAction: true,
        blocking: false,
        timestamp: "19:03",
        expiresAt: "19:13",
        state: "watch",
        tone: "warning",
        route: "/check-in",
      },
    ],
    summary: {
      critical: (overrides.alerts ?? []).length,
      attention: (overrides.attention ?? []).length,
      healthy: 4,
      message: "Hay señales que requieren atención.",
      nextBestAction: "Revisar el ingreso y mantener la puerta sincronizada.",
      canIgnore: "El resto del espacio está estable.",
    },
  });

  return {
    workspaceStatus: overrides.workspaceStatus ?? "ready",
    workspaceIntelligence,
    workspacePriority,
  };
}

test("buildLiveDashboardModel derives the main KPIs and keeps scanner first", () => {
  const criticalItems = Array.from({ length: 3 }, (_, index) => ({
    id: `priority-table-${index + 1}`,
    title: `Mesa sobreocupada ${index + 1}`,
    description: "Mesa 3 excedió su capacidad.",
    module: "Tables",
    category: "tables",
    priority: "critical",
    severity: "critical",
    confidence: 0.98,
    requiresAction: true,
    blocking: true,
    timestamp: `19:0${index + 2}`,
    expiresAt: `19:1${index + 2}`,
    state: "blocked",
    tone: "danger",
    route: "/tables",
  })) as WorkspacePrioritySnapshot["criticalItems"];
  const attentionItems = Array.from({ length: 7 }, (_, index) => ({
    id: `priority-checkin-${index + 1}`,
    title: `Segundo intento ${index + 1}`,
    description: "Un acceso bloqueado requiere revisión.",
    module: "Check-in",
    category: "check-in",
    priority: "high",
    severity: "high",
    confidence: 0.92,
    requiresAction: true,
    blocking: false,
    timestamp: `19:1${index}`,
    expiresAt: `19:2${index}`,
    state: "watch",
    tone: "warning",
    route: "/check-in",
  })) as WorkspacePrioritySnapshot["attentionNow"];

  const model = buildLiveDashboardModel({
    currentOrganizationName: "EntryFlow",
    currentEvent: {
      name: "Live Event",
      status: "live",
      startAt: "13 de agosto de 2026 21:00",
      venue: "Sala Principal",
      eventType: "nightlife",
    },
    ...buildInput({
      alerts: criticalItems,
      attention: attentionItems,
    }),
  });

  assert.equal(model.header.liveLabel, "En vivo");
  assert.equal(model.kpis.length, 8);
  assert.deepEqual(model.kpis.map((item) => item.label), [
    "Reservas activas",
    "Reservas confirmadas",
    "Reservas pendientes",
    "Invitados esperados",
    "Invitados ingresados",
    "Invitados pendientes",
    "Ocupación",
    "Check-ins/min",
  ]);
  assert.equal(model.kpis.find((item) => item.label === "Invitados ingresados")?.value, "30");
  assert.equal(model.kpis.find((item) => item.label === "Invitados pendientes")?.value, "20");
  assert.equal(model.kpis.find((item) => item.label === "Ocupación")?.value, "80%");
  assert.equal(model.kpis.find((item) => item.label === "Check-ins/min")?.value, "2");
  assert.equal(model.capacity.occupancyPercent, 80);
  assert.equal(model.alertCount, 10);
  assert.equal(model.alerts.length, 6);
  assert.equal(model.alerts[0]?.route, "/tables");
  assert.equal(model.quickActions[0]?.route, "/check-in");
  assert.equal(model.quickActions[0]?.label, "Escanear / Ingreso");
});

test("buildLiveDashboardModel returns an empty alert state when the workspace is clean", () => {
  const model = buildLiveDashboardModel({
    currentOrganizationName: "EntryFlow",
    currentEvent: {
      name: "Live Event",
      status: "published",
      startAt: "13 de agosto de 2026 21:00",
      venue: "Sala Principal",
      eventType: "nightlife",
    },
    ...buildInput({
      workspaceStatus: "loading",
      capacityState: "stable",
      pendingGuests: 0,
      blockedGrants: 0,
      duplicateAttempts: 0,
      rejectedAttempts: 0,
      alerts: [],
      attention: [],
      occupancyPercent: 42,
      used: 21,
      remaining: 29,
      expectedGuests: 21,
      checkedInGuests: 21,
      recentCheckIns: 0,
    }),
  });

  assert.equal(model.header.liveLabel, "Sincronizando");
  assert.equal(model.capacity.state, "stable");
  assert.equal(model.admission.blockedSignals, 0);
  assert.equal(model.alertCount, 0);
  assert.equal(model.alerts.length, 0);
});

test("buildLiveDashboardModel prefers the canonical venue name over the denormalized event label", () => {
  const model = buildLiveDashboardModel({
    currentOrganizationName: "EntryFlow",
    currentVenueName: "La Rota Carlota",
    currentEvent: {
      name: "Live Event",
      status: "published",
      startAt: "13 de agosto de 2026 21:00",
      venue: "La Rota Carlota - 6 de Agosto",
      eventType: "nightlife",
    },
    ...buildInput({
      alerts: [],
      attention: [],
    }),
  });

  assert.equal(model.header.venue, "La Rota Carlota");
});

test("buildLiveDashboardModel updates the live state when a new check-in arrives", () => {
  const before = buildLiveDashboardModel({
    currentOrganizationName: "EntryFlow",
    currentEvent: {
      name: "Live Event",
      status: "live",
      startAt: "13 de agosto de 2026 21:00",
      venue: "Sala Principal",
      eventType: "nightlife",
    },
    ...buildInput({
      expectedGuests: 50,
      checkedInGuests: 30,
      pendingGuests: 20,
      occupancyPercent: 80,
      used: 40,
      remaining: 10,
      recentCheckIns: 1,
      alerts: [],
      attention: [],
    }),
  });

  const after = buildLiveDashboardModel({
    currentOrganizationName: "EntryFlow",
    currentEvent: {
      name: "Live Event",
      status: "live",
      startAt: "13 de agosto de 2026 21:00",
      venue: "Sala Principal",
      eventType: "nightlife",
    },
    ...buildInput({
      expectedGuests: 50,
      checkedInGuests: 31,
      pendingGuests: 19,
      occupancyPercent: 82,
      used: 41,
      remaining: 9,
      recentCheckIns: 2,
      alerts: [],
      attention: [],
    }),
  });

  assert.equal(before.kpis.find((item) => item.label === "Invitados ingresados")?.value, "30");
  assert.equal(after.kpis.find((item) => item.label === "Invitados ingresados")?.value, "31");
  assert.equal(before.admission.recentCheckIns, 1);
  assert.equal(after.admission.recentCheckIns, 2);
  assert.equal(after.capacity.occupancyPercent, 82);
});

test("buildLiveDashboardModel keeps alert priority aligned with operations", () => {
  const model = buildLiveDashboardModel({
    currentOrganizationName: "EntryFlow",
    currentEvent: {
      name: "Live Event",
      status: "live",
      startAt: "13 de agosto de 2026 21:00",
      venue: "Sala Principal",
      eventType: "nightlife",
    },
    ...buildInput({
      capacityState: "blocked",
      pendingGuests: 12,
      blockedGrants: 2,
      duplicateAttempts: 1,
      rejectedAttempts: 1,
      alerts: [
        {
          id: "priority-table",
          title: "Mesa sobreocupada",
          description: "Mesa 3 excedió su capacidad.",
          module: "Tables",
          category: "tables",
          priority: "critical",
          severity: "critical",
          confidence: 0.98,
          requiresAction: true,
          blocking: true,
          timestamp: "19:02",
          expiresAt: "19:07",
          state: "blocked",
          tone: "danger",
          route: "/tables",
        },
      ],
      attention: [],
    }),
  });

  assert.equal(model.alertCount, 1);
});

test("buildLiveDashboardQuickActions keeps the scanner as the first mobile-critical action", () => {
  const actions = buildLiveDashboardQuickActions();

  assert.equal(actions[0]?.route, "/check-in");
  assert.equal(actions[0]?.label, "Escanear / Ingreso");
  assert.equal(actions[0]?.shortcut, "⌘1");
});

test("buildLiveDashboardModel marks terminal events as read-only while preserving navigation", () => {
  const model = buildLiveDashboardModel({
    currentOrganizationName: "EntryFlow",
    currentEvent: {
      name: "Live Event",
      status: "finished",
      startAt: "13 de agosto de 2026 21:00",
      venue: "Sala Principal",
      eventType: "nightlife",
    },
    ...buildInput({
      workspaceStatus: "ready",
      capacityState: "stable",
      pendingGuests: 0,
      blockedGrants: 0,
      duplicateAttempts: 0,
      rejectedAttempts: 0,
      alerts: [],
      attention: [],
      recentCheckIns: 0,
    }),
  });

  const quickActions = buildLiveDashboardQuickActions({ terminalEvent: true });

  assert.equal(model.header.liveLabel, "Cerrado");
  assert.equal(model.header.summary, "Este evento está cerrado. La información permanece disponible en modo lectura.");
  assert.equal(model.header.nextAction, "Evento cerrado. Revisa historial, reservas y trazabilidad sin ejecutar mutaciones.");
  assert.equal(quickActions[0]?.label, "Ingreso · solo lectura");
  assert.equal(quickActions[0]?.route, "/check-in");
});

test("event command center keeps quick actions out of the overview shell", () => {
  const source = readFileSync(new URL("../features/events/components/event-command-center.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /dashboard-quick-actions/i);
  assert.doesNotMatch(source, /Acciones rápidas/);
});

test("event command center renders the alert popover in a portal with fixed viewport positioning", () => {
  const source = readFileSync(new URL("../features/events/components/event-command-center.tsx", import.meta.url), "utf8");

  assert.match(source, /createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /className="fixed z-\[70\] overflow-hidden rounded-\[1\.5rem\]/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /buttonRef\.current\?\.contains\(target\) \|\| panelRef\.current\?\.contains\(target\)/);
  assert.doesNotMatch(source, /className="absolute right-0 top-\[calc\(100%\+0\.75rem\)\] z-20/);
});
