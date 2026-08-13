"use client";

import { useMemo } from "react";

import { GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import { buildLiveDashboardQuickActions } from "@/features/events/domain/live-dashboard";

export default function DashboardQuickActions() {
  const guidedActions = useMemo(
    () =>
      buildLiveDashboardQuickActions().map((item, index) =>
        buildGuidedActionItem(
          {
            id: item.id,
            title: item.label,
            description: item.description,
            module: "Dashboard",
            category: "dashboard",
            priority: index === 0 ? "critical" : index === 1 ? "high" : index === 2 ? "medium" : "low",
            severity: index === 0 ? "critical" : index === 1 ? "high" : index === 2 ? "medium" : "low",
            confidence: index === 0 ? 0.98 : index === 1 ? 0.9 : index === 2 ? 0.8 : 0.72,
            requiresAction: true,
            blocking: index === 0,
            timestamp: "00:00",
            expiresAt: "00:00",
            state: index === 0 ? "blocked" : index === 1 ? "watch" : "stable",
            tone: item.tone,
            route: item.route,
          },
          {
            href: item.route,
            label: item.label,
            reason: item.description,
            impact:
              index === 0
                ? "Abre el scanner y prioriza el ingreso."
                : index === 1
                  ? "Lleva el control de confirmaciones y pendientes."
                  : index === 2
                    ? "Permite revisar recursos sin perder contexto."
                    : "Muestra trazabilidad operativa en vivo.",
            shortcut: item.shortcut,
            tone: item.tone,
          },
        ),
      ),
    [],
  );

  return (
    <GuidedActionPanel
      title="Acciones rápidas"
      description="El escáner y los módulos operativos aparecen primero para que la puerta no pierda ritmo."
      items={guidedActions}
      enableKeyboardShortcuts={false}
    />
  );
}
