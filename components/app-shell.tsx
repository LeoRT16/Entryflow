"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import CommandPalette from "@/components/command-palette";
import { FeedbackProvider } from "@/components/premium-feedback";
import StatusBadge from "@/components/status-badge";
import KeyboardShortcutsHelp from "@/components/keyboard-shortcuts-help";
import { buildShellContextSummary, formatShellEventStatus, getShellEventStatusTone, getShellRouteContext } from "@/components/shell-context";
import { focusFirstShortcutSearchInput, useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { isPublicRoute } from "@/features/navigation/public-routes";
import { WorkspaceProvider } from "@/adapters/workspace-provider";
import { useWorkspaceData } from "@/services/workspace-service";
import { getWorkspaceAuthStateMessage, type WorkspaceBootstrap } from "@/services/workspace-loader";
import LogoutButton from "@/components/logout-button";

export default function AppShell({
  children,
  initialWorkspace,
}: {
  children: ReactNode;
  initialWorkspace?: WorkspaceBootstrap | null;
}) {
  const pathname = usePathname();
  const authState = initialWorkspace?.authState ?? { status: "signed-out" as const };
  const routeIsPublic = isPublicRoute(pathname);

  if (routeIsPublic) {
    return <>{children}</>;
  }

  if (authState.status !== "ready") {
    return <AuthBlockedState authState={authState} />;
  }

  return <WorkspaceShell initialWorkspace={initialWorkspace}>{children}</WorkspaceShell>;
}

function WorkspaceShell({
  children,
  initialWorkspace,
}: {
  children: ReactNode;
  initialWorkspace: WorkspaceBootstrap | null | undefined;
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
      {
        id: "global-nav-users",
        shortcut: "g u",
        priority: 70,
        handler: () => {
          router.push("/users");
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

function AuthBlockedState({
  authState,
}: {
  authState: NonNullable<WorkspaceBootstrap["authState"]>;
}) {
  const message =
    getWorkspaceAuthStateMessage(authState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
      <section className="surface-panel w-full max-w-xl p-6">
        <p className="kicker">Acceso restringido</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">No podemos abrir el workspace todavía.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">{message}</p>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {authState.status === "unlinked" || authState.status === "inactive-membership" || authState.status === "no-membership"
            ? "Si esto no debería ocurrir, cerrá sesión y volvé a entrar con la cuenta correcta."
            : "Volvé a iniciar sesión para continuar."}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <LogoutButton label="Cerrar sesión" />
        </div>
      </section>
    </div>
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
  const pathname = usePathname();
  const { currentOrganization, currentEvent } = useWorkspaceData();
  const shellRoute = getShellRouteContext(pathname);

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="flex min-h-screen">
        <Sidebar mobileNavOpen={mobileNavOpen} onCloseMobileNav={() => setMobileNavOpen(false)} />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-72">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[color:var(--background)]/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-start gap-3">
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

              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">{shellRoute.label}</p>
                <p className="truncate text-sm font-semibold text-white">{buildShellContextSummary(currentOrganization.name, currentEvent.name)}</p>
                <p className="mt-1 truncate text-xs leading-5 text-slate-500">{shellRoute.description}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <StatusBadge variant={getShellEventStatusTone(currentEvent.status)}>{formatShellEventStatus(currentEvent.status)}</StatusBadge>
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
