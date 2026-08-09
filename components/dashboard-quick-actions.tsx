"use client";

import { useMemo } from "react";

import { GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import { useCheckInStore } from "@/services/workspace-service";

export default function DashboardQuickActions() {
  const { workspacePriority } = useCheckInStore();

  const guidedActions = useMemo(() => {
    const candidates = [
      ...workspacePriority.criticalItems.slice(0, 2),
      ...workspacePriority.attentionNow.slice(0, 2),
      ...workspacePriority.nextBestActions.slice(0, 2),
    ];
    const seen = new Set<string>();

    return candidates
      .filter((item) => {
        const signature = `${item.route}:${item.title}`;
        if (seen.has(signature)) {
          return false;
        }

        seen.add(signature);
        return true;
      })
      .slice(0, 4)
      .map((item) =>
        buildGuidedActionItem(item, {
          href: item.route,
          impact:
            item.priority === "critical"
              ? "Abre la pantalla donde se resuelve el bloqueo."
              : item.priority === "high"
                ? "Reduce el ruido operativo y despeja la cola."
                : item.priority === "medium"
                  ? "Mantiene el flujo sin perder contexto."
                  : "Ayuda a sostener la operación estable.",
        }),
      );
  }, [workspacePriority]);

  return (
    <GuidedActionPanel
      title="Acciones guiadas"
      description="El sistema muestra primero lo que desbloquea la operación y oculta lo que todavía no hace falta."
      items={guidedActions}
      enableKeyboardShortcuts={false}
    />
  );
}
