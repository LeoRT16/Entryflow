"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import CommandPalette from "@/components/command-palette";
import { FeedbackProvider } from "@/components/premium-feedback";
import StatusBadge from "@/components/status-badge";
import KeyboardShortcutsHelp from "@/components/keyboard-shortcuts-help";
import { focusFirstShortcutSearchInput, useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { WorkspaceProvider } from "@/adapters/workspace-provider";
import { useWorkspaceData } from "@/services/workspace-service";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";

export default function AppShell({
  children,
  initialWorkspace,
}: {
  children: ReactNode;
  initialWorkspace?: WorkspaceBootstrap | null;
}) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);

  const globalShortcuts = useMemo(
    () => [
      {
        id: "global-command-palette",
        shortcut: "mod+k",
        allowInInputs: true,
        priority: 100,
        handler: () => {
          setMobileNavOpen(false);
          setKeyboardHelpOpen(false);
          setCommandPaletteOpen(true);
        },
      },
      {
        id: "global-close-overlay",
        shortcut: "escape",
        allowInInputs: true,
        enabled: commandPaletteOpen || keyboardHelpOpen || mobileNavOpen,
        priority: 1000,
        handler: () => {
          if (commandPaletteOpen) {
            setCommandPaletteOpen(false);
            return;
          }

          if (keyboardHelpOpen) {
            setKeyboardHelpOpen(false);
            return;
          }

          if (mobileNavOpen) {
            setMobileNavOpen(false);
          }
        },
      },
      {
        id: "global-shortcuts-help",
        shortcut: "?",
        priority: 90,
        handler: () => {
          setMobileNavOpen(false);
          setCommandPaletteOpen(false);
          setKeyboardHelpOpen((current) => !current);
        },
      },
      {
        id: "global-search-focus",
        shortcut: "/",
        priority: 80,
        handler: () => {
          focusFirstShortcutSearchInput();
        },
      },
      {
        id: "global-nav-dashboard",
        shortcut: "g d",
        priority: 70,
        handler: () => {
          router.push("/");
        },
      },
      {
        id: "global-nav-reservations",
        shortcut: "g r",
        priority: 70,
        handler: () => {
          router.push("/reservations");
        },
      },
      {
        id: "global-nav-customers",
        shortcut: "g c",
        priority: 70,
        handler: () => {
          router.push("/customers");
        },
      },
      {
        id: "global-nav-checkin",
        shortcut: "g k",
        priority: 70,
        handler: () => {
          router.push("/check-in");
        },
      },
      {
        id: "global-nav-operations",
        shortcut: "g o",
        priority: 70,
        handler: () => {
          router.push("/operations");
        },
      },
      {
        id: "global-nav-tables",
        shortcut: "g t",
        priority: 70,
        handler: () => {
          router.push("/tables");
        },
      },
      {
        id: "global-nav-timeline",
        shortcut: "g l",
        priority: 70,
        handler: () => {
          router.push("/timeline");
        },
      },
      {
        id: "global-nav-statistics",
        shortcut: "g s",
        priority: 70,
        handler: () => {
          router.push("/statistics");
        },
      },
      {
        id: "global-nav-events",
        shortcut: "g e",
        priority: 70,
        handler: () => {
          router.push("/events");
        },
      },
      {
        id: "global-nav-settings",
        shortcut: "g ,",
        priority: 70,
        handler: () => {
          router.push("/settings");
        },
      },
    ],
    [commandPaletteOpen, keyboardHelpOpen, mobileNavOpen, router],
  );

  useKeyboardShortcuts(globalShortcuts);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen || commandPaletteOpen || keyboardHelpOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [commandPaletteOpen, keyboardHelpOpen, mobileNavOpen]);

  return (
    <FeedbackProvider>
      <WorkspaceProvider initialWorkspace={initialWorkspace}>
        <AppShellContent
          mobileNavOpen={mobileNavOpen}
          commandPaletteOpen={commandPaletteOpen}
          setMobileNavOpen={setMobileNavOpen}
          setCommandPaletteOpen={setCommandPaletteOpen}
        >
          {children}
        </AppShellContent>
        {keyboardHelpOpen ? <KeyboardShortcutsHelp onClose={() => setKeyboardHelpOpen(false)} /> : null}
      </WorkspaceProvider>
    </FeedbackProvider>
  );
}

function AppShellContent({
  children,
  mobileNavOpen,
  commandPaletteOpen,
  setMobileNavOpen,
  setCommandPaletteOpen,
}: {
  children: ReactNode;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;
  setCommandPaletteOpen: (value: boolean) => void;
}) {
  const { currentOrganization, currentEvent, workspaceIntelligence } = useWorkspaceData();
  const operator = workspaceIntelligence.statistics.cards.activeOperators[0] ?? "Recepción";

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="flex min-h-screen">
        <Sidebar mobileNavOpen={mobileNavOpen} onCloseMobileNav={() => setMobileNavOpen(false)} />

        <div className="flex min-h-screen flex-1 flex-col md:pl-72">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[color:var(--background)]/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                aria-label="Abrir menú de navegación"
              >
                <span className="flex flex-col gap-1.5">
                  <span className="h-0.5 w-4 rounded-full bg-current" />
                  <span className="h-0.5 w-4 rounded-full bg-current" />
                  <span className="h-0.5 w-4 rounded-full bg-current" />
                </span>
              </button>

              <div className="min-w-0 flex-1 text-right">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                  Evento activo
                </p>
                <p className="truncate text-sm font-medium text-white">{currentEvent.name}</p>
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <StatusBadge variant="info">{currentOrganization.name}</StatusBadge>
                  <StatusBadge variant={currentEvent.status === "live" ? "success" : currentEvent.status === "published" ? "info" : currentEvent.status === "draft" ? "warning" : "danger"}>
                    {currentEvent.status === "live" ? "En curso" : currentEvent.status === "published" ? "Publicado" : currentEvent.status === "draft" ? "Borrador" : currentEvent.status === "finished" ? "Finalizado" : "Archivado"}
                  </StatusBadge>
                  <StatusBadge variant="info">Operador: {operator}</StatusBadge>
                  <StatusBadge variant="info">Hora: {currentEvent.startAt.trim().split(/\s+/).at(-1) ?? "--:--"}</StatusBadge>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
      {commandPaletteOpen ? <CommandPalette onClose={() => setCommandPaletteOpen(false)} /> : null}
    </div>
  );
}
