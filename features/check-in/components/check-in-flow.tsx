"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";

import { useFeedback } from "@/components/premium-feedback";
import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { buildGuestSearchIndex } from "@/features/check-in/utils";
import { getEntryTone } from "@/features/check-in/domain/check-in-domain";
import { useCheckInStore } from "@/features/check-in/state/check-in-store";
import type { Guest, CheckInMethod } from "@/features/check-in/types";

export default function CheckInFlow() {
  const { showToast, confirm } = useFeedback();
  const {
    activeEvent,
    dashboard,
    events,
    guests,
    attempts,
    reservations,
    registerCheckIn,
    searchGuests,
    setActiveEventId,
  } = useCheckInStore();
  const [searchQuery, setSearchQuery] = useState("");
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
  const recentAttempts = attempts.filter((attempt) => attempt.guestId || attempt.result === "No encontrado").slice(0, 5);
  const percent = Math.round((dashboard.todayEvent.checkedIn / Math.max(dashboard.todayEvent.expectedGuests, 1)) * 100);

  const openGuest = (guest: Guest, method: CheckInMethod = "QR") => {
    const response = registerCheckIn({
      query: buildGuestSearchIndex(guest),
      method,
      operator: method === "Manual" ? "Recepción" : "Escáner",
    });

    if (response.result === "Encontrado") {
      showToast({
        title: "Ingreso registrado",
        description: `${guest.guestName} quedó marcado como ingresado.`,
        tone: "success",
      });
      return;
    }

    if (response.result === "Usado") {
      showToast({
        title: "QR ya usado",
        description: `${guest.guestName} ya ingresó anteriormente.`,
        tone: "warning",
      });
      return;
    }

    showToast({
      title: "Ingreso bloqueado",
      description: response.note,
      tone: response.result === "Bloqueado" || response.result === "Anulado" ? "error" : "warning",
    });
  };

  const runScenario = (query: string, method: CheckInMethod) => {
    const response = registerCheckIn({ query, method, operator: method === "Manual" ? "Recepción" : "Escáner" });

    showToast({
      title:
        response.result === "Encontrado"
          ? "Ingreso registrado"
          : response.result === "No encontrado"
            ? "QR inexistente"
            : response.result === "Usado"
              ? "QR usado"
              : response.result === "Anulado"
                ? "QR anulado"
                : "QR bloqueado",
      description: response.note,
      tone:
        response.result === "Encontrado"
          ? "success"
          : response.result === "No encontrado"
            ? "warning"
            : "error",
    });
  };

  const executeManualCheckIn = () => {
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
        const response = registerCheckIn({
          query: candidate ? buildGuestSearchIndex(candidate) : searchQuery,
          method: "Manual",
          operator: "Recepción",
        });

        showToast({
          title: response.result === "Encontrado" ? "Ingreso manual registrado" : "Ingreso manual revisado",
          description: response.note,
          tone: response.result === "Encontrado" ? "success" : "warning",
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Ingresos"
        title="Check-in operativo"
        description="Escanea, revisa y confirma entradas desde un solo panel mock conectado al resto de la app."
        primaryAction={{ label: "Ir a reservas", href: "/reservations" }}
        secondaryAction={{ label: "Abrir invitados", href: "/customers" }}
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge variant="info">Operativo</StatusBadge>
            <StatusBadge variant="success">{activeEvent.name}</StatusBadge>
            <StatusBadge variant="warning">{pendingGuests.length} pendientes</StatusBadge>
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
            <StatCard label="Ingresados" value={dashboard.todayEvent.checkedIn} tone="success" />
            <StatCard label="Pendientes" value={dashboard.todayEvent.pending} tone="warning" />
            <StatCard label="Reservas" value={dashboard.todayEvent.reservations} tone="info" />
            <StatCard label="Atención" value={dashboard.activeEvent.attention} tone="danger" />
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
            <StatusBadge variant="info">Live mock</StatusBadge>
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
                  {event.name} — {event.status}
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
                {Math.round((dashboard.todayEvent.checkedIn / Math.max(dashboard.todayEvent.expectedGuests, 1)) * 100)}% de avance
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Escanear QR o buscar invitado"
                className="h-13 w-full flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-cyan-500/10"
              />

              <button
                type="button"
                onClick={() => runScenario(searchQuery || "QR inexistente", "QR")}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
              >
                Validar QR
              </button>

              <button
                type="button"
                onClick={executeManualCheckIn}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Ingreso manual
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ScenarioButton label="QR válido" tone="success" onClick={() => runScenario(searchQuery || searchResults[0]?.invitationCode || "INV-0084-01", "QR")} />
              <ScenarioButton label="QR usado" tone="warning" onClick={() => runScenario(searchResults.find((guest) => guest.admissionStatus === "Ingresó")?.invitationCode || searchResults[0]?.invitationCode || "INV-0084-01", "QR")} />
              <ScenarioButton label="QR anulado" tone="danger" onClick={() => runScenario(searchResults.find((guest) => guest.admissionStatus === "Anulada")?.invitationCode || "INV-0208-01", "QR")} />
              <ScenarioButton label="QR bloqueado" tone="danger" onClick={() => runScenario(searchResults.find((guest) => guest.admissionStatus === "Bloqueada")?.invitationCode || "INV-0142-02", "QR")} />
              <ScenarioButton label="QR inexistente" tone="info" onClick={() => runScenario("QR-INEXISTENTE", "QR")} />
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
                { label: "Ingresados", value: `${dashboard.todayEvent.checkedIn}`, tone: "success" as const },
                { label: "Pendientes", value: `${dashboard.todayEvent.pending}`, tone: "warning" as const },
                { label: "Reservas activas", value: `${reservations.length}`, tone: "info" as const },
                { label: "Atención", value: `${dashboard.activeEvent.attention}`, tone: "danger" as const },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{item.label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${item.tone === "danger" ? "text-red-100" : item.tone === "warning" ? "text-amber-100" : item.tone === "success" ? "text-emerald-100" : "text-cyan-100"}`}>{item.value}</p>
                </div>
              ))}
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
              <StatusBadge variant="warning">{pendingGuests.length}</StatusBadge>
            </div>

            <div className="mt-4 space-y-3">
              {pendingGuests.slice(0, 4).map((guest) => (
                <button
                  key={guest.id}
                  type="button"
                  onClick={() => openGuest(guest, "QR")}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left transition hover:bg-slate-950/55"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{guest.guestName}</p>
                    <p className="mt-1 text-xs text-slate-400">{guest.reservationName}</p>
                  </div>
                  <StatusBadge variant="warning">Pendiente</StatusBadge>
                </button>
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
  onCheckIn,
  onManual,
}: {
  guest: Guest;
  onCheckIn: () => void;
  onManual: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4">
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
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: { timestamp: string; guestName?: string; result: string; note: string } }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{attempt.guestName ?? attempt.result}</p>
          <p className="mt-1 text-sm text-slate-400">{attempt.note}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          {attempt.timestamp}
        </span>
      </div>
    </div>
  );
}

function ScenarioButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
  onClick: () => void;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
      : tone === "warning"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-50 hover:bg-amber-400/15"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100 hover:bg-red-400/15"
          : "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-10 items-center justify-center rounded-full border px-3 text-xs font-medium transition hover:-translate-y-0.5 active:scale-[0.98]",
        toneClass,
      ].join(" ")}
    >
      {label}
    </button>
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
