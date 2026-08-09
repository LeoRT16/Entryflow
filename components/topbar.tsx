"use client";

import Link from "next/link";

import StatusBadge from "@/components/status-badge";
import { useCheckInStore } from "@/services/workspace-service";

function formatStatus(status: string) {
  if (status === "draft") return "Borrador";
  if (status === "published") return "Publicado";
  if (status === "live") return "En curso";
  if (status === "finished") return "Finalizado";
  return "Archivado";
}

function getEventTime(startAt: string) {
  const parts = startAt.trim().split(/\s+/);
  return parts.at(-1) ?? "--:--";
}

export default function Topbar({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
}) {
  const { currentOrganization, currentEvent, workspaceIntelligence } = useCheckInStore();
  const operator = workspaceIntelligence.statistics.cards.activeOperators[0] ?? "Recepción";

  return (
    <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="min-w-0 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.6rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
            {description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant="info">Evento: {currentEvent.name}</StatusBadge>
          <StatusBadge variant="warning">Organización: {currentOrganization.name}</StatusBadge>
          <StatusBadge
            variant={
              currentEvent.status === "live"
                ? "success"
                : currentEvent.status === "published"
                  ? "info"
                  : currentEvent.status === "draft"
                    ? "warning"
                    : "danger"
            }
          >
            Estado: {formatStatus(currentEvent.status)}
          </StatusBadge>
          <StatusBadge variant="info">Operador: {operator}</StatusBadge>
          <StatusBadge variant="info">Hora: {getEventTime(currentEvent.startAt)}</StatusBadge>
        </div>
      </div>

      {primaryAction || secondaryAction ? (
        <div className="flex flex-wrap items-center gap-3">
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              {secondaryAction.label}
            </Link>
          ) : null}

          {primaryAction ? (
            <Link
              href={primaryAction.href}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              {primaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
