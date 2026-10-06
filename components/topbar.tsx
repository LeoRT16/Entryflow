"use client";

import Link from "next/link";

import TerminalEventBanner from "@/components/terminal-event-banner";
import { isTerminalEventStatus } from "@/features/events/domain";
import { useCheckInStore } from "@/services/workspace-service";

export default function Topbar({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  bare = false,
}: {
  eyebrow?: string;
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
  compact?: boolean;
  bare?: boolean;
}) {
  const { currentEvent } = useCheckInStore();
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);

  return (
    <header className={bare ? "flex flex-col gap-2" : `surface-panel flex flex-col ${compact ? "gap-3 p-4 sm:p-4" : "gap-4 p-5 sm:p-6"}`}>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className={`min-w-0 ${bare ? "space-y-1" : compact ? "space-y-2" : "space-y-3"}`}>
          {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
          <h1 className={`font-semibold tracking-tight text-white ${bare || compact ? "text-2xl sm:text-[2.2rem]" : "text-3xl sm:text-[2.6rem]"}`}>{title}</h1>
          {description ? <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-[0.95rem]">{description}</p> : null}
        </div>

        {isTerminalEvent ? (
          <TerminalEventBanner
            description="Este evento ya está cerrado. La vista permanece disponible para revisar información histórica y trazabilidad sin ejecutar mutaciones."
          />
        ) : null}
      </div>

      {primaryAction || secondaryAction ? (
        <div className="flex flex-wrap items-center gap-3">
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="surface-interactive inline-flex h-11 items-center justify-center px-4 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
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
