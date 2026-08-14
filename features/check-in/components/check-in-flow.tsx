"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useFeedback } from "@/components/premium-feedback";
import { ContextualCard, GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import StatusBadge from "@/components/status-badge";
import TerminalEventBanner from "@/components/terminal-event-banner";
import Topbar from "@/components/topbar";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { buildGuestSearchIndex } from "@/features/check-in/utils";
import { getEntryTone } from "@/features/check-in/domain/check-in-domain";
import { useCheckInStore } from "@/services/workspace-service";
import type { Guest, CheckInMethod } from "@/features/check-in/types";
import QrCameraScanner from "@/features/check-in/components/qr-camera-scanner";
import { isTerminalEventStatus } from "@/features/events/domain";

export default function CheckInFlow() {
  const { confirm, showToast } = useFeedback();
  const pathname = usePathname();
  const {
    activeEvent,
    events,
    guests,
    attempts,
    workspaceIntelligence,
    workspacePriority,
    registerCheckIn,
    searchGuests,
    setActiveEventId,
  } = useCheckInStore();
  const currentEventSummary = workspaceIntelligence.dashboard.currentEventSummary;
  const attentionCount = workspaceIntelligence.customers.attentionGuests.length;
  const checkInInsights = workspacePriority.byModule["Check-in"];
  const prioritySummary = workspacePriority.summary;
  const health = workspaceIntelligence.health;
  const flow = workspaceIntelligence.flow;
  const currentEventStatus = events.find((event) => event.id === activeEvent.id)?.status ?? "live";
  const isTerminalEvent = isTerminalEventStatus(currentEventStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPendingIndex, setSelectedPendingIndex] = useState(0);
  const deferredQuery = useDeferredValue(searchQuery);
  const activeGuests = useMemo(
    () => guests.filter((guest) => guest.eventId === activeEvent.id),
    [activeEvent.id, guests],
  );
  const searchResults = useMemo(
    () =>
      searchGuests(deferredQuery)
        .filter((guest) => guest.eventId === activeEvent.id)
        .sort((a, b) => {
          const aPriority = a.admissionStatus === "Pendiente" ? 0 : a.attention ? 1 : 2;
          const bPriority = b.admissionStatus === "Pendiente" ? 0 : b.attention ? 1 : 2;
          return aPriority - bPriority;
        })
        .slice(0, 6),
    [activeEvent.id, deferredQuery, searchGuests],
  );
  const pendingGuests = activeGuests.filter((guest) => guest.admissionStatus === "Pendiente");
  const recentAttempts = attempts
    .filter((attempt) => attempt.eventId === activeEvent.id)
    .filter((attempt) => attempt.guestId || attempt.result === "No encontrado")
    .slice(0, 5);
  const percent = Math.round((currentEventSummary.checkedIn / Math.max(currentEventSummary.expectedGuests, 1)) * 100);

  const selectedPendingIndexClamped = pendingGuests.length
    ? Math.min(selectedPendingIndex, pendingGuests.length - 1)
    : 0;

  const openGuest = useCallback(
    (guest: Guest, method: CheckInMethod = "QR") => {
      if (isTerminalEvent) {
        return;
      }

      registerCheckIn({
        query: buildGuestSearchIndex(guest),
        method,
        operator: method === "Manual" ? "Recepción" : "Escáner",
      });
    },
    [isTerminalEvent, registerCheckIn],
  );

  const executeManualCheckIn = useCallback(() => {
    if (isTerminalEvent) {
      return;
    }

    if (!searchQuery.trim()) {
      showToast({
        title: "Ingresa un criterio de búsqueda",
        description: "Podés buscar por nombre, apellido, carnet, WhatsApp, reserva o código.",
        tone: "warning",
      });
      return;
    }

    const candidate = searchResults[0] ?? null;

    confirm({
      title: "Registrar ingreso manual",
      description: candidate
        ? `${candidate.guestName} será marcado como ingresado manualmente.`
        : "Se intentará registrar manualmente la coincidencia actual.",
      tone: "info",
      confirmLabel: "Registrar ingreso",
      onConfirm: () => {
        registerCheckIn({
          query: candidate ? buildGuestSearchIndex(candidate) : searchQuery,
          method: "Manual",
          operator: "Recepción",
        });
      },
    });
  }, [confirm, isTerminalEvent, registerCheckIn, searchQuery, searchResults, showToast]);

  const continueCheckIn = useCallback(() => {
    if (isTerminalEvent) {
      return;
    }

    const candidate = searchQuery.trim()
      ? searchResults[0] ?? null
      : pendingGuests[selectedPendingIndexClamped] ?? pendingGuests[0] ?? null;

    if (!candidate) {
      showToast({
        title: "No hay invitados listos",
        description: "Todavía no existe un invitado pendiente para continuar el flujo.",
        tone: "warning",
      });
      return;
    }

    openGuest(candidate, "QR");
  }, [isTerminalEvent, openGuest, pendingGuests, searchQuery, searchResults, selectedPendingIndexClamped, showToast]);

  const goToNextPendingGuest = useCallback(() => {
    if (!pendingGuests.length) {
      return;
    }

    setSelectedPendingIndex((current) => (current + 1) % pendingGuests.length);
  }, [pendingGuests.length]);

  useKeyboardShortcuts(
    useMemo(
      () => [
        ...(isTerminalEvent
          ? []
          : [
              {
                id: "check-in-continue",
                shortcut: "enter",
                priority: 50,
                handler: continueCheckIn,
              },
              {
                id: "check-in-next",
                shortcut: "n",
                priority: 40,
                handler: goToNextPendingGuest,
              },
            ]),
      ],
      [continueCheckIn, goToNextPendingGuest, isTerminalEvent],
    ),
  );

  const guidedActions = useMemo(() => {
    if (isTerminalEvent) {
      return [];
    }

    const actions = [
      ...(pendingGuests[0]
        ? [
            {
              id: `${pendingGuests[0].id}-continue`,
              label: "Continuar check-in",
              reason: `${pendingGuests[0].guestName} todavía espera ingreso.`,
              impact: "Abre el flujo para registrar ese acceso sin perder contexto.",
              priority: "critical" as const,
              tone: "danger" as const,
              onSelect: () => openGuest(pendingGuests[0], "QR"),
            },
          ]
        : []),
      ...(searchQuery.trim() && searchResults[0]
        ? [
            {
              id: `${searchResults[0].id}-manual`,
              label: "Ingreso manual",
              reason: `${searchResults[0].guestName} coincide con la búsqueda actual.`,
              impact: "Registra el mismo estado compartido sin volver al inicio.",
              priority: "blocking" as const,
              tone: "warning" as const,
              onSelect: executeManualCheckIn,
            },
          ]
        : []),
      ...checkInInsights.slice(0, 2).map((item) =>
        buildGuidedActionItem(item, {
          href: item.route,
          impact: item.description,
        }),
      ),
    ];

    const seen = new Set<string>();

    return actions
      .filter((item) => {
        if (seen.has(item.id)) {
          return false;
        }

        seen.add(item.id);
        return true;
      })
      .slice(0, 3);
  }, [checkInInsights, executeManualCheckIn, isTerminalEvent, openGuest, pendingGuests, searchQuery, searchResults]);

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Ingresos"
        title="Check-in operativo"
        description="Escanea, revisa y confirma entradas desde un solo panel conectado al resto de la app."
        primaryAction={{ label: "Ir a reservas", href: "/reservations" }}
        secondaryAction={{ label: "Abrir invitados", href: "/customers" }}
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge variant="info">Operativo</StatusBadge>
            <StatusBadge variant="success">{activeEvent.name}</StatusBadge>
            <StatusBadge variant="warning">{currentEventSummary.pending} pendientes</StatusBadge>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Confirma ingresos con pocos clics.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              El flujo prioriza velocidad, estados claros y retroalimentación inmediata para QR válido, usado, anulado, bloqueado o inexistente.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Ingresados" value={currentEventSummary.checkedIn} tone="success" />
            <StatCard label="Pendientes" value={currentEventSummary.pending} tone="warning" />
            <StatCard label="Reservas" value={currentEventSummary.reservations} tone="info" />
            <StatCard label="Atención" value={attentionCount} tone="danger" />
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Evento activo
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Cambia el contexto operativo sin salir del flujo.
              </p>
            </div>
            <StatusBadge variant="info">Live</StatusBadge>
          </div>

          <label className="block">
            <span className="sr-only">Seleccionar evento</span>
            <select
              value={activeEvent.id}
              onChange={(event) => setActiveEventId(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]"
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} — {event.status === "live" ? "En curso" : event.status === "published" ? "Publicado" : event.status === "draft" ? "Borrador" : event.status === "finished" ? "Finalizado" : "Cancelado"}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/reservations"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Abrir reservas
            </Link>
            <Link
              href="/customers"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Ver invitados
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {isTerminalEvent ? (
            <TerminalEventBanner description="El evento está cerrado. El ingreso queda en modo histórico y no admite nuevos check-ins." />
          ) : (
            <GuidedActionPanel
              title="Siguiente paso"
              description="El panel prioriza el ingreso que más reduce la cola de atención."
              items={guidedActions}
            />
          )}

          {isTerminalEvent ? (
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Scanner deshabilitado
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Evento cerrado · solo lectura
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Podés revisar trazabilidad, pendientes e historial, pero no registrar nuevos ingresos.
              </p>
            </section>
          ) : (
            <QrCameraScanner
              key={`${pathname}-${activeEvent.id}`}
              eventName={activeEvent.name}
              onDetected={(value) => {
                setSearchQuery(value);
                registerCheckIn({ query: value, method: "QR", operator: "Escáner" });
              }}
            />
          )}

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Búsqueda rápida
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Buscar por nombre, apellido, carnet, WhatsApp, reserva o código.
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400">
                {percent}% de avance
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={isTerminalEvent}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    continueCheckIn();
                  }

                  if (event.key === "Escape" && searchQuery) {
                    event.preventDefault();
                    setSearchQuery("");
                  }
                }}
                data-shortcut-search="true"
                placeholder="Escanear QR o buscar invitado"
                className="h-13 w-full flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <button
                type="button"
                onClick={() => registerCheckIn({ query: searchQuery || "QR inexistente", method: "QR", operator: "Escáner" })}
                disabled={isTerminalEvent}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-cyan-400/10"
              >
                Validar QR
              </button>

              <button
                type="button"
                onClick={executeManualCheckIn}
                disabled={isTerminalEvent}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/[0.04]"
              >
                Ingreso manual
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Resultados
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Coincidencias operativas
                </h2>
              </div>
              <StatusBadge variant="info">{searchResults.length}</StatusBadge>
            </div>

            <div className="mt-5 space-y-3">
              {searchResults.length ? (
                searchResults.map((guest) => (
                  <GuestResultCard
                    key={guest.id}
                    guest={guest}
                    readOnly={isTerminalEvent}
                    onCheckIn={() => openGuest(guest, "QR")}
                    onManual={() => openGuest(guest, "Manual")}
                  />
                ))
              ) : (
                <EmptyStateCard
                  title="No encontramos coincidencias en este evento."
                  description="Probá con nombre, apellido, carnet, WhatsApp, reserva o código."
                />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Estado actual
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Resumen en vivo
                </h2>
              </div>
              <StatusBadge variant="success">{percent}%</StatusBadge>
            </div>

            <div className="mt-4 grid gap-3">
                {[
                  { label: "Ingresados", value: `${currentEventSummary.checkedIn}`, tone: "success" as const },
                  { label: "Pendientes", value: `${currentEventSummary.pending}`, tone: "warning" as const },
                  { label: "Reservas activas", value: `${currentEventSummary.reservations}`, tone: "info" as const },
                  { label: "Atención", value: `${attentionCount}`, tone: "danger" as const },
                ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{item.label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${item.tone === "danger" ? "text-red-100" : item.tone === "warning" ? "text-amber-100" : item.tone === "success" ? "text-emerald-100" : "text-cyan-100"}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Lectura inteligente</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{prioritySummary.message}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{flow.summary}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">{health.title}</p>
            <div className="mt-4 space-y-3">
              {checkInInsights.length ? (
                checkInInsights.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{item.description}</p>
                      </div>
                      <StatusBadge variant={item.tone}>{item.priority}</StatusBadge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
                  Sin recomendaciones activas.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Últimos intentos
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Trazabilidad de acceso
                </h2>
              </div>
              <StatusBadge variant="info">{recentAttempts.length}</StatusBadge>
            </div>

            <div className="mt-4 space-y-3">
              {recentAttempts.length ? (
                recentAttempts.map((attempt) => <AttemptRow key={attempt.id} attempt={attempt} />)
              ) : (
                <EmptyStateCard
                  title="Todavía no hay intentos registrados."
                  description="Escaneá un QR o probá un ingreso manual para ver la auditoría."
                />
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Pendientes
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Invitados por ingresar
                </h2>
              </div>
              <StatusBadge variant="warning">{currentEventSummary.pending}</StatusBadge>
            </div>

            <div className="mt-4 space-y-3">
              {pendingGuests.slice(0, 4).map((guest, index) => (
                isTerminalEvent ? (
                  <div
                    key={guest.id}
                    className={[
                      "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left",
                      selectedPendingIndexClamped === index
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-slate-950/40",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{guest.guestName}</p>
                      <p className="mt-1 text-xs text-slate-400">{guest.reservationName}</p>
                    </div>
                    <StatusBadge variant="warning">Pendiente</StatusBadge>
                  </div>
                ) : (
                  <button
                    key={guest.id}
                    type="button"
                    onClick={() => {
                      setSelectedPendingIndex(index);
                      openGuest(guest, "QR");
                    }}
                    className={[
                      "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                      selectedPendingIndexClamped === index
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-slate-950/40 hover:bg-slate-950/55",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{guest.guestName}</p>
                      <p className="mt-1 text-xs text-slate-400">{guest.reservationName}</p>
                    </div>
                    <StatusBadge variant="warning">Pendiente</StatusBadge>
                  </button>
                )
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function GuestResultCard({
  guest,
  readOnly,
  onCheckIn,
  onManual,
}: {
  guest: Guest;
  readOnly: boolean;
  onCheckIn: () => void;
  onManual: () => void;
}) {
  if (readOnly) {
    return (
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight text-white">{guest.guestName}</h3>
            <p className="mt-1 text-sm text-slate-400">
              {guest.reservationName} · {guest.eventName}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge variant={getEntryTone(guest.deliveryStatus)}>{guest.deliveryStatus}</StatusBadge>
              <StatusBadge variant={getEntryTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
              <StatusBadge variant="info">{guest.invitationCode}</StatusBadge>
            </div>
          </div>

          <StatusBadge variant="warning">Solo lectura</StatusBadge>
        </div>
      </article>
    );
  }

  return (
    <ContextualCard
      items={[
        {
          id: `${guest.id}-qr`,
          label: "Registrar ingreso",
          description: "Validar con QR usando el flujo real.",
          tone: "success" as const,
          onSelect: onCheckIn,
        },
        {
          id: `${guest.id}-manual`,
          label: "Ingreso manual",
          description: "Registrar el mismo estado compartido.",
          tone: "info" as const,
          onSelect: onManual,
        },
        {
          id: `${guest.id}-copy`,
          label: "Copiar código",
          description: "Copiar el código de invitación al portapapeles.",
          tone: "warning" as const,
          onSelect: async () => {
            await navigator.clipboard.writeText(guest.invitationCode);
          },
        },
      ]}
      className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-white">{guest.guestName}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {guest.reservationName} · {guest.eventName}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge variant={getEntryTone(guest.deliveryStatus)}>{guest.deliveryStatus}</StatusBadge>
            <StatusBadge variant={getEntryTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
            <StatusBadge variant="info">{guest.invitationCode}</StatusBadge>
            {guest.gate ? <StatusBadge variant="info">{guest.gate}</StatusBadge> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCheckIn}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
          >
            Registrar QR
          </button>
          <button
            type="button"
            onClick={onManual}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Manual
          </button>
        </div>
      </div>
    </ContextualCard>
  );
}

function AttemptRow({ attempt }: { attempt: { timestamp: string; guestName?: string; result: string; note: string } }) {
  return (
    <ContextualCard
      items={[
        {
          id: `${attempt.timestamp}-copy-note`,
          label: "Copiar nota",
          description: "Copiar el mensaje del intento.",
          tone: "info" as const,
          onSelect: async () => {
            await navigator.clipboard.writeText(attempt.note);
          },
        },
      ]}
      className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{attempt.guestName ?? attempt.result}</p>
          <p className="mt-1 text-sm text-slate-400">{attempt.note}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          {attempt.timestamp}
        </span>
      </div>
    </ContextualCard>
  );
}

function EmptyStateCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}
