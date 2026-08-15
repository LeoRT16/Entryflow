"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import StatusBadge from "@/components/status-badge";
import type { WorkspacePriorityItem } from "@/domain/workspace-priority";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";

export type QuickActionTone = "success" | "warning" | "danger" | "info";

export type QuickActionItem = {
  id: string;
  label: string;
  description?: string;
  tone?: QuickActionTone;
  shortcut?: string;
  onSelect: () => void;
};

function toneClasses(tone: QuickActionTone) {
  return tone === "success"
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
    : tone === "warning"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-50 hover:bg-amber-400/15"
      : tone === "danger"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-50 hover:bg-rose-400/15"
        : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]";
}

export function ContextualCard({
  children,
  items,
  className = "",
  menuLabel = "Más acciones",
}: {
  children: ReactNode;
  items: QuickActionItem[];
  className?: string;
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (rootRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [open]);

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!items.length) {
      return;
    }

    event.preventDefault();
    setOpen(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) {
      return;
    }

    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`} onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
      {children}

      {items.length ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/80 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label={menuLabel}
            aria-controls={menuId}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span className="text-xl leading-none">...</span>
          </button>

          {open ? (
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={menuLabel}
              className="absolute right-3 top-13 z-20 w-[min(20rem,calc(100vw-2rem))] overflow-hidden surface-panel bg-[#0b0f14]"
            >
              <div className="border-b border-white/10 px-4 py-2.5">
                <p className="kicker">
                  Acciones rápidas
                </p>
              </div>

              <div className="p-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      item.onSelect();
                      setOpen(false);
                    }}
                    className={[
                      "flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                      toneClasses(item.tone ?? "info"),
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.description ? (
                        <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                      ) : null}
                    </div>
                    {item.shortcut ? <StatusBadge variant="info">{item.shortcut}</StatusBadge> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export type GuidedActionPriority = "critical" | "blocking" | "quick" | "preventive";

export type GuidedActionItem = {
  id: string;
  label: string;
  reason: string;
  impact: string;
  priority: GuidedActionPriority;
  tone?: QuickActionTone;
  shortcut?: string;
  href?: string;
  onSelect?: () => void;
};

function guidedPriorityOrder(priority: GuidedActionPriority) {
  if (priority === "critical") return 0;
  if (priority === "blocking") return 1;
  if (priority === "quick") return 2;
  return 3;
}

function guidedPriorityTone(priority: GuidedActionPriority): QuickActionTone {
  if (priority === "critical") return "danger";
  if (priority === "blocking") return "warning";
  if (priority === "quick") return "info";
  return "success";
}

function fallbackActionLabel(item: WorkspacePriorityItem) {
  if (item.module === "Check-in") {
    return "Continuar check-in";
  }

  if (item.module === "Tables") {
    return item.priority === "critical" ? "Liberar mesa" : "Asignar mesa sugerida";
  }

  if (item.module === "Reservations") {
    return item.priority === "critical" ? "Confirmar reserva" : "Revisar reserva";
  }

  if (item.module === "Operations") {
    return item.priority === "critical" ? "Resolver alerta" : "Completar operación pendiente";
  }

  if (item.module === "Timeline") {
    return "Revisar actividad";
  }

  if (item.module === "Statistics") {
    return "Revisar métricas";
  }

  return "Continuar flujo";
}

function formatRouteLabel(href?: string) {
  if (!href || href === "/") {
    return "Resumen";
  }

  if (href === "/operations") return "Operaciones";
  if (href === "/reservations") return "Reservas";
  if (href === "/customers") return "Invitados";
  if (href === "/check-in") return "Ingreso";
  if (href === "/tables") return "Espacios";
  if (href === "/timeline") return "Actividad";
  if (href === "/statistics") return "Estadísticas";
  if (href === "/events") return "Eventos";
  if (href === "/settings") return "Ajustes";

  return href.replace("/", "") || "Resumen";
}

export function buildGuidedActionItem(item: WorkspacePriorityItem, overrides?: Partial<GuidedActionItem>): GuidedActionItem {
  const priority: GuidedActionPriority =
    item.priority === "critical"
      ? "critical"
      : item.blocking
        ? "blocking"
        : item.priority === "high"
          ? "quick"
          : "preventive";

  return {
    id: overrides?.id ?? item.id,
    label: overrides?.label ?? fallbackActionLabel(item),
    reason: overrides?.reason ?? item.title,
    impact: overrides?.impact ?? item.description,
    priority,
    tone: overrides?.tone ?? guidedPriorityTone(priority),
    href: overrides?.href,
    onSelect: overrides?.onSelect,
  };
}

export function GuidedActionPanel({
  title = "Acciones guiadas",
  description = "El siguiente paso aparece solo cuando hay algo útil que resolver.",
  items,
  className = "",
  enableKeyboardShortcuts = true,
}: {
  title?: string;
  description?: string;
  items: GuidedActionItem[];
  className?: string;
  enableKeyboardShortcuts?: boolean;
}) {
  const orderedItems = useMemo(
    () => [...items].sort((a, b) => guidedPriorityOrder(a.priority) - guidedPriorityOrder(b.priority)).slice(0, 4),
    [items],
  );
  const router = useRouter();

  const keyboardBindings = useMemo(
    () =>
      enableKeyboardShortcuts
        ? orderedItems.slice(0, 4).map((item, index) => ({
            id: `${item.id}-shortcut-${index + 1}`,
            shortcut: String(index + 1),
            priority: 50 + index,
            handler: () => {
              if (item.href) {
                router.push(item.href);
                return;
              }

              item.onSelect?.();
            },
          }))
        : [],
    [enableKeyboardShortcuts, orderedItems, router],
  );

  useKeyboardShortcuts(keyboardBindings);

  if (!orderedItems.length) {
    return null;
  }

  return (
    <section className={`surface-panel p-5 sm:p-6 ${className}`.trim()}>
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker">
            Acciones guiadas
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
        </div>
        <StatusBadge variant="info">{orderedItems.length}</StatusBadge>
      </div>

      <div className="mt-5 space-y-3">
        {orderedItems.map((item, index) => {
          const tone = item.tone ?? guidedPriorityTone(item.priority);
          const shortcut = enableKeyboardShortcuts ? item.shortcut ?? String(index + 1) : item.shortcut;
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge variant={tone}>
                      {item.priority === "critical"
                        ? "Crítica"
                        : item.priority === "blocking"
                          ? "Bloqueante"
                          : item.priority === "quick"
                            ? "Rápida"
                            : "Preventiva"}
                    </StatusBadge>
                    {item.href ? <StatusBadge variant="info">{formatRouteLabel(item.href)}</StatusBadge> : null}
                    {shortcut ? <StatusBadge variant="info">{shortcut}</StatusBadge> : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {item.reason}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{item.impact}</p>
                </div>
                <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition group-hover:bg-white/[0.08]">
                  Acción
                </span>
              </div>
            </>
          );

          const sharedClassName =
            "group w-full rounded-[1.35rem] border border-white/10 bg-[#0f151d] p-4 text-left transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60";

          if (item.href) {
            return (
              <Link key={item.id} href={item.href} className={sharedClassName}>
                {content}
              </Link>
            );
          }

          return (
            <button key={item.id} type="button" onClick={item.onSelect} className={sharedClassName}>
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}
