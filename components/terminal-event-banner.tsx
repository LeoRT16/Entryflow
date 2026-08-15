"use client";

import StatusBadge from "@/components/status-badge";

export default function TerminalEventBanner({
  description,
  title = "Evento cerrado",
}: {
  title?: string;
  description: string;
}) {
  return (
    <div className="surface-alert px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant="warning">{title}</StatusBadge>
        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-50/70">
          Solo lectura
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-amber-50/90">{description}</p>
    </div>
  );
}
