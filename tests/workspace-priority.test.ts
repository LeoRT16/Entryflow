import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkspacePrioritySnapshot } from "../domain/workspace-priority";
import type { WorkspaceIntelligence } from "../domain/workspace-intelligence";
import type { TimelineEvent } from "../features/timeline/types";

function buildTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "timeline-1",
    eventId: "event-1",
    kind: "checkin.success",
    title: "Check-in exitoso",
    description: "Ingreso registrado para PRueba 2.",
    timestamp: "19:04",
    tone: "success",
    icon: "checkin",
    actor: "Test Door",
    actorRole: "Puerta",
    context: "prueba E2E Rota Carlota",
    target: "PRueba 2",
    metadata: {},
    ...overrides,
  } as TimelineEvent;
}

function buildBlockedEvent(index: number): TimelineEvent {
  return {
    id: `blocked-${index}`,
    eventId: "event-1",
    kind: "checkin.blocked",
    title: "Segundo intento bloqueado",
    description: "Esta invitación ya fue utilizada.",
    timestamp: `19:${String(5 + index).padStart(2, "0")}`,
    tone: "warning",
    icon: "alert",
    actor: "Test Door",
    actorRole: "Puerta",
    context: "prueba E2E Rota Carlota",
    target: "PRueba 2",
    metadata: { result: "Usado" },
  } as TimelineEvent;
}

function buildWorkspaceIntelligence(timelineEvents: TimelineEvent[]): WorkspaceIntelligence {
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
      score: 90,
      state: "stable",
      title: "Operación saludable",
      description: "Sin incidencias activas.",
      modules: [],
      blockers: [],
    },
    activity: {
      lastActivity: "19:12",
      recentWindow: "Últimos 8 eventos",
      recentEvents: timelineEvents.length,
      lastCheckInAt: "19:04",
      lastReservationAt: "18:58",
      checkInsPerMinute: 1,
      averageCheckInIntervalMinutes: 4,
      peakCheckInMinute: "19:04",
      activeOperators: ["Test Door"],
      state: "stable",
      summary: "Actividad en curso.",
    },
    capacity: {
      used: 0,
      remaining: 0,
      occupancyPercent: 0,
      activeTables: 0,
      fullTables: 0,
      overCapacityTables: 0,
      freeTables: 0,
      nearbyAvailableTables: 0,
      state: "stable",
      summary: "Sin datos de capacidad.",
    },
    flow: {
      checkInsPerMinute: 1,
      averageCheckInIntervalMinutes: 4,
      pendingGuests: 0,
      queueDepth: 0,
      blockedGuests: 0,
      reentryRisk: 0,
      operatorStatus: "Operación activa",
      state: "stable",
      summary: "Flujo activo.",
    },
    operations: {
      metrics: [],
      quickSummary: [],
      upcomingReservations: [],
      alerts: [],
      criticalTables: {
        full: [],
        overCapacity: [],
        empty: [],
      },
      recentActivity: timelineEvents,
    },
    dashboard: {
      activeEvent: {
        id: "event-1",
        name: "prueba E2E Rota Carlota",
        status: "En curso",
        date: "16 de agosto de 2026",
        startsAt: "19:00",
        expectedGuests: 0,
        checkedIn: 0,
        pending: 0,
        reservations: 0,
        attention: 0,
      },
      currentEvent: {
        id: "event-1",
        name: "prueba E2E Rota Carlota",
        status: "En curso",
        date: "16 de agosto de 2026",
        startsAt: "19:00",
        expectedGuests: 0,
        checkedIn: 0,
        pending: 0,
        reservations: 0,
        attention: 0,
      },
      summaryMetrics: [],
      recentReservations: [],
      currentEventSummary: {
        name: "prueba E2E Rota Carlota",
        date: "16 de agosto de 2026",
        startsAt: "19:00",
        reservations: 0,
        expectedGuests: 0,
        checkedIn: 0,
        pending: 0,
      },
      eventStats: {},
    },
    reservations: {
      activeReservations: 0,
      cancelledReservations: 0,
      confirmedReservations: 0,
      pendingReservations: 0,
      expectedGuests: 0,
      guestsCheckedIn: 0,
      guestsPending: 0,
      lastReservationAt: "18:58",
      lastCheckInAt: "19:04",
      lastModificationAt: "19:12",
      presentGuests: 0,
      remainingGuests: 0,
    },
    tables: {
      activeTables: 0,
      capacityUsed: 0,
      capacityRemaining: 0,
      freeTables: 0,
      occupiedTables: 0,
      fullTables: 0,
      overCapacityTables: 0,
      occupancyPercent: 0,
      rotationPercent: 0,
      operationalState: "healthy",
    },
    access: {
      totalGrants: 0,
      activeGrants: 0,
      usedGrants: 0,
      revokedGrants: 0,
      expiredGrants: 0,
      blockedGrants: 0,
      duplicateAttempts: 0,
      rejectedAttempts: 0,
      recentAccessEvents: 0,
      state: "stable",
      summary: "Sin datos de acceso.",
    },
    customers: {
      eventStats: {},
      attentionGuests: [],
      longPendingGuests: [],
      neverCheckedInGuests: [],
      followUpGuests: [],
      blockedGuests: 0,
    },
    statistics: {
      metrics: [],
      cards: {
        totalReservations: 0,
        activeReservations: 0,
        cancelledReservations: 0,
        confirmedReservations: 0,
        pendingReservations: 0,
        expectedGuests: 0,
        checkedInGuests: 0,
        pendingGuests: 0,
        noShows: 0,
        capacityUsed: 0,
        capacityRemaining: 0,
        occupancyPercent: 0,
        checkInsPerMinute: 0,
        averageCheckInIntervalMinutes: 0,
        peakCheckInMinute: "19:04",
        lastCheckInAt: "19:04",
        lastReservationAt: "18:58",
        lastModificationAt: "19:12",
        activeOperators: ["Test Door"],
        recentActivity: timelineEvents.length,
      },
      paidReservations: 0,
      pendingPayments: 0,
    },
    timeline: {
      events: timelineEvents,
      summary: {
        total: timelineEvents.length,
        checkedIn: 1,
        checkedOut: 0,
        alerts: timelineEvents.filter((event) => event.kind === "checkin.blocked").length,
        tableMoves: 0,
        reservationsOpened: 0,
        latest: "19:12",
        lastActivity: "19:12",
        checkInsPerMinute: 1,
        averageCheckInIntervalMinutes: 4,
        peakCheckInMinute: "19:04",
      },
    },
  } as WorkspaceIntelligence;
}

test("recentChanges keeps a successful check-in visible even when blocked attempts are the majority", () => {
  const timelineEvents = [
    buildTimelineEvent(),
    ...Array.from({ length: 8 }, (_, index) => buildBlockedEvent(index)),
  ];

  const snapshot = buildWorkspacePrioritySnapshot(buildWorkspaceIntelligence(timelineEvents));

  assert.equal(snapshot.recentChanges.length, 8);
  assert.equal(snapshot.recentChanges.some((event) => event.kind === "checkin.success"), true);
  assert.equal(snapshot.recentChanges.some((event) => event.kind === "checkin.blocked"), true);
});
