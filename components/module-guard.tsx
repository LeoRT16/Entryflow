"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useCheckInStore } from "@/services/workspace-service";
import { getEventModuleLabel, isModuleEnabled } from "@/features/events/domain";
import type { EventModule } from "@/features/domain/types";

export default function ModuleGuard({
  module,
  children,
  fallbackHref = "/",
}: {
  module: EventModule;
  children: ReactNode;
  fallbackHref?: string;
}) {
  const { currentEvent } = useCheckInStore();

  if (isModuleEnabled(currentEvent, module)) {
    return children;
  }

  return (
    <section className="flex min-h-[55vh] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
      <div className="max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
          Módulo no disponible
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Este módulo no está habilitado para este evento.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          {getEventModuleLabel(module)} no forma parte de la configuración actual de {currentEvent.name}.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={fallbackHref}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Volver al resumen
          </Link>
          <Link
            href="/events"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Ver todos los eventos
          </Link>
        </div>
      </div>
    </section>
  );
}
