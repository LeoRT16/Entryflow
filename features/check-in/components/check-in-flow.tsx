"use client";

import { useDeferredValue, useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import QrCameraScanner from "@/features/check-in/components/qr-camera-scanner";
import { buildGuestSearchIndex } from "@/features/check-in/utils";
import {
  buildGuestQuickReadSummary,
  formatGuestCarnetLabel,
  getCheckInActionLabel,
  getEntryTone,
  resolveCheckInGuestByQuery,
  shouldAutoSubmitDetectedCheckIn,
} from "@/features/check-in/domain/check-in-domain";
import { isTerminalEventStatus } from "@/features/events/domain";
import type { CheckInMethod, Guest } from "@/features/check-in/types";
import { useCheckInStore } from "@/services/workspace-service";

type CheckInAttemptState =
  | {
      kind: "idle";
    }
  | {
      kind: "success" | "warning" | "danger";
      title: string;
      note: string;
      guest?: Guest;
    };

function formatEventContext(startAt: string) {
  return startAt.trim().split(/\s+/).filter(Boolean).join(" · ");
}

function getEventStatusLabel(status: "live" | "published" | "draft" | "finished" | "cancelled") {
  if (status === "live") return "En curso";
  if (status === "published") return "Publicado";
  if (status === "draft") return "Borrador";
  if (status === "finished") return "Finalizado";
  return "Cancelado";
}

function getAttemptTone(result: string) {
  if (result === "Encontrado") return "success" as const;
  if (result === "Usado") return "warning" as const;
  if (result === "Anulado" || result === "Bloqueado") return "danger" as const;
  return "danger" as const;
}

function QuickReadField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[1.1rem] border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function getEligibilityMessage(guest: Guest) {
  if (guest.admissionStatus === "Ingresó") {
    return {
      canEnter: false,
      tone: "warning" as const,
      label: "Ya ingresó",
      detail: "Este acceso ya fue consumido.",
    };
  }

  if (guest.admissionStatus === "Anulada" || guest.admissionStatus === "Bloqueada" || guest.qrStatus === "Anulado" || guest.qrStatus === "Bloqueado") {
    return {
      canEnter: false,
      tone: "danger" as const,
      label: "No puede entrar",
      detail: "El acceso está bloqueado o anulado.",
    };
  }

  if (guest.qrStatus === "Usado") {
    return {
      canEnter: false,
      tone: "warning" as const,
      label: "Ya fue usado",
      detail: "El código ya fue consumido en un ingreso previo.",
    };
  }

  return {
    canEnter: true,
    tone: "success" as const,
    label: "Puede entrar",
    detail: "La validación coincide con un acceso habilitado.",
  };
}

export default function CheckInFlow() {
  const { currentEvent } = useCheckInStore();

  return <CheckInWorkspace key={currentEvent.id} />;
}

function CheckInWorkspace() {
  const {
    currentEvent,
    currentVenue,
    reservations,
    guests,
    registerCheckIn,
    searchGuests: searchGuestList,
  } = useCheckInStore();

  const eventGuests = useMemo(() => guests.filter((guest) => guest.eventId === currentEvent.id), [currentEvent.id, guests]);
  const eventReservations = useMemo(
    () => reservations.filter((reservation) => reservation.eventId === currentEvent.id),
    [currentEvent.id, reservations],
  );
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);
  const [query, setQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [validationMethod, setValidationMethod] = useState<CheckInMethod>("Manual");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptState, setAttemptState] = useState<CheckInAttemptState>({ kind: "idle" });

  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();
  const shouldShowResults = normalizedQuery.length >= 2;

  const searchResults = useMemo(
    () => (shouldShowResults ? searchGuestList(normalizedQuery).filter((guest) => guest.eventId === currentEvent.id).slice(0, 6) : []),
    [currentEvent.id, normalizedQuery, searchGuestList, shouldShowResults],
  );

  const resolvedGuest = useMemo(
    () =>
      resolveCheckInGuestByQuery({
        query,
        guests: eventGuests,
        reservations: eventReservations,
        event: currentEvent,
      }),
    [currentEvent, eventGuests, eventReservations, query],
  );

  const selectedGuest = eventGuests.find((guest) => guest.id === selectedGuestId) ?? resolvedGuest ?? (searchResults.length === 1 ? searchResults[0] : null);
  const selectedGuestQuickRead = selectedGuest ? buildGuestQuickReadSummary(selectedGuest) : null;
  const attemptGuest = attemptState.kind === "idle" ? null : attemptState.guest ?? null;
  const attemptGuestQuickRead = attemptGuest ? buildGuestQuickReadSummary(attemptGuest) : null;

  const eligibility = selectedGuest ? getEligibilityMessage(selectedGuest) : null;
  const canRegister = Boolean(selectedGuest && !isTerminalEvent);
  const primaryActionLabel = getCheckInActionLabel({
    canEnter: Boolean(eligibility?.canEnter),
    isTerminalEvent,
  });

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedGuestId(null);
    setValidationMethod("Manual");
    setAttemptState({ kind: "idle" });
  };

  const handleDetected = (value: string) => {
    setQuery(value);
    setValidationMethod("QR");
    setAttemptState({ kind: "idle" });

    const match = resolveCheckInGuestByQuery({
      query: value,
      guests: eventGuests,
      reservations: eventReservations,
      event: currentEvent,
    });
    setSelectedGuestId(match?.id ?? null);

    if (match && shouldAutoSubmitDetectedCheckIn({ canEnter: getEligibilityMessage(match).canEnter, isTerminalEvent })) {
      void submitCheckIn(match, value, "QR");
    }
  };

  const handleSelectGuest = (guest: Guest) => {
    setSelectedGuestId(guest.id);
    setValidationMethod("Manual");
    setAttemptState({ kind: "idle" });
  };

  const handleRegister = async () => {
    if (!selectedGuest || isSubmitting || isTerminalEvent) {
      return;
    }

    await submitCheckIn(selectedGuest, buildGuestSearchIndex(selectedGuest), validationMethod);
  };

  const submitCheckIn = async (guest: Guest, queryValue: string, method: CheckInMethod) => {
    if (isSubmitting || isTerminalEvent) {
      return;
    }

    setIsSubmitting(true);
    setAttemptState({ kind: "idle" });

    try {
      const result = await registerCheckIn({
        query: queryValue,
        method,
        operator: method === "Manual" ? "Recepción" : "Escáner",
      });

      const tone = getAttemptTone(result.result);

      setAttemptState({
        kind: tone,
        title:
          result.result === "Encontrado"
            ? "Ingreso registrado"
            : result.result === "Usado"
              ? "Ingreso ya consumido"
              : result.result === "Anulado"
                ? "Ingreso anulado"
                : "Ingreso bloqueado",
        note: result.note,
        guest: result.guest ?? guest,
      });

      if (result.result === "Encontrado") {
        setQuery("");
        setSelectedGuestId(null);
      }
    } catch (error) {
      setAttemptState({
        kind: "danger",
        title: "No se pudo registrar el ingreso",
        note: error instanceof Error ? error.message : "No se pudo completar la validación actual.",
        guest,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAttempt = () => {
    setQuery("");
    setSelectedGuestId(null);
    setValidationMethod("Manual");
    setAttemptState({ kind: "idle" });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.08),_transparent_26%),linear-gradient(180deg,#07111f_0%,#08111d_46%,#050b14_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_90px_rgba(2,6,23,0.35)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                INGRESO
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Ingreso
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Valida y registra el acceso de invitados al evento activo.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge variant={currentEvent.status === "live" ? "success" : "info"}>
                {getEventStatusLabel(currentEvent.status)}
              </StatusBadge>
              {isTerminalEvent ? (
                <StatusBadge variant="warning">Evento cerrado</StatusBadge>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Evento
              </p>
              <p className="mt-2 text-sm font-medium text-white">{currentEvent.name}</p>
            </div>
            <div className="rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Fecha y hora
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {formatEventContext(currentEvent.startAt)}
              </p>
            </div>
            <div className="rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Sede
              </p>
              <p className="mt-2 text-sm font-medium text-white">{currentEvent.venue || currentVenue?.name || "Sin sede"}</p>
            </div>
            <div className="rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Estado
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {currentEvent.status === "live" ? "En curso" : "Próximo"}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Búsqueda manual
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    Buscar por nombre, carnet, invitación o reserva
                  </h2>
                </div>
                <StatusBadge variant={validationMethod === "QR" ? "info" : "success"}>
                  {validationMethod === "QR" ? "Validación por QR" : "Validación manual"}
                </StatusBadge>
              </div>

              <label className="mt-4 block">
                <span className="sr-only">Buscar invitado</span>
                <input
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder="Nombre, carnet, código de invitación o reserva"
                  className="mt-1 w-full rounded-[1.25rem] border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
                />
              </label>

              <div className="mt-4 rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-slate-300">
                Escribe un identificador existente o escanea un QR. Si la búsqueda devuelve una sola coincidencia, la validación se abre de inmediato.
              </div>

              {shouldShowResults ? (
                searchResults.length > 1 ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Coincidencias
                      </p>
                      <p className="text-xs text-slate-400">{searchResults.length} resultados</p>
                    </div>

                    <div className="grid gap-3">
                      {searchResults.map((guest) => {
                        const quickRead = buildGuestQuickReadSummary(guest);
                        const tone = getEntryTone(guest.admissionStatus);
                        return (
                          <button
                            key={guest.id}
                            type="button"
                            onClick={() => handleSelectGuest(guest)}
                            className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4 text-left transition hover:border-cyan-400/30 hover:bg-slate-950/90"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-base font-semibold text-white">{quickRead.name}</p>
                                <p className="mt-1 break-words text-sm text-slate-400">
                                  {formatGuestCarnetLabel(quickRead.carnet)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge variant={tone}>{guest.admissionStatus}</StatusBadge>
                                <StatusBadge variant={getEntryTone(guest.qrStatus)}>{guest.qrStatus}</StatusBadge>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <QuickReadField label="Reserva" value={quickRead.reservation} />
                              <QuickReadField label="Mesa / espacio" value={quickRead.space} />
                              <QuickReadField label="Ingreso" value={quickRead.entryStatus} />
                              <QuickReadField label="Acceso" value={quickRead.accessStatus} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-300">
                    Una coincidencia encontrada. La validación se muestra en el panel lateral.
                  </div>
                )
              ) : null}
            </section>

            <QrCameraScanner eventName={currentEvent.name} onDetected={handleDetected} />
          </div>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Validación actual
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    Una sola incidencia operativa visible
                  </h2>
                </div>

                {selectedGuest ? (
                  <StatusBadge variant={eligibility?.tone ?? "info"}>
                    {eligibility?.label ?? "Listo"}
                  </StatusBadge>
                ) : (
                  <StatusBadge variant="info">Esperando lectura</StatusBadge>
                )}
              </div>

              {attemptState.kind !== "idle" ? (
                <div
                  className={[
                    "mt-4 rounded-[1.35rem] border px-4 py-4",
                    attemptState.kind === "success"
                      ? "border-emerald-400/20 bg-emerald-400/10"
                      : attemptState.kind === "warning"
                        ? "border-amber-400/20 bg-amber-400/10"
                        : "border-rose-400/20 bg-rose-400/10",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{attemptState.title}</p>
                      {attemptGuestQuickRead ? (
                        <p className="mt-2 break-words text-base font-medium text-white">
                          {attemptGuestQuickRead.name}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm leading-6 text-slate-200">{attemptState.note}</p>
                    </div>
                    {attemptState.guest ? (
                      <StatusBadge variant={attemptState.kind === "success" ? "success" : attemptState.kind === "warning" ? "warning" : "danger"}>
                        {attemptState.guest.guestName}
                      </StatusBadge>
                    ) : null}
                  </div>

                  {attemptGuestQuickRead ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <QuickReadField label="Carnet" value={attemptGuestQuickRead.carnet} />
                      <QuickReadField label="Reserva" value={attemptGuestQuickRead.reservation} />
                      <QuickReadField label="Mesa / espacio" value={attemptGuestQuickRead.space} />
                      <QuickReadField label="Ingreso" value={attemptGuestQuickRead.entryStatus} />
                      <QuickReadField label="Acceso" value={attemptGuestQuickRead.accessStatus} />
                      <QuickReadField label="Código visible" value={attemptGuestQuickRead.visibleCode} />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={resetAttempt}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                  >
                    Nueva lectura
                  </button>
                </div>
              ) : selectedGuest ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-[1.35rem] border border-white/10 bg-black/15 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-lg font-semibold text-white">{selectedGuestQuickRead?.name}</p>
                        <p className="mt-1 break-words text-sm text-slate-400">
                          {selectedGuestQuickRead ? formatGuestCarnetLabel(selectedGuestQuickRead.carnet) : null}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge variant={eligibility?.tone ?? "info"}>{eligibility?.label ?? "Listo"}</StatusBadge>
                        <StatusBadge variant={getEntryTone(selectedGuest.admissionStatus)}>{selectedGuest.admissionStatus}</StatusBadge>
                        <StatusBadge variant={getEntryTone(selectedGuest.qrStatus)}>{selectedGuest.qrStatus}</StatusBadge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <QuickReadField label="Reserva" value={selectedGuestQuickRead?.reservation ?? "Sin reserva"} />
                      <QuickReadField label="Mesa / espacio" value={selectedGuestQuickRead?.space ?? "Sin mesa"} />
                      <QuickReadField label="Ingreso" value={selectedGuestQuickRead?.entryStatus ?? "Sin estado"} />
                      <QuickReadField label="Acceso" value={selectedGuestQuickRead?.accessStatus ?? "Sin estado"} />
                      <QuickReadField label="Puede entrar" value={eligibility?.canEnter ? "Sí" : "No"} />
                      <QuickReadField label="Qué hacer" value={primaryActionLabel} />
                    </div>

                    <div className="mt-4 rounded-[1.1rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
                      {eligibility?.detail ?? "La validación está lista para confirmar el acceso."}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={canRegister ? () => void handleRegister() : resetAttempt}
                    disabled={canRegister ? isSubmitting : false}
                    className={[
                      "inline-flex h-11 w-full items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition",
                      canRegister
                        ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                        : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                    ].join(" ")}
                  >
                    {canRegister ? (isSubmitting ? "Registrando ingreso..." : "Registrar ingreso") : "Nueva lectura"}
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-[1.35rem] border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm leading-6 text-slate-300">
                  Escaneá un QR o buscá un invitado para abrir la validación.
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Flujo
              </p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <p>1. Escaneá el QR o escribí un identificador conocido.</p>
                <p>2. Confirmá la coincidencia correcta en el panel lateral.</p>
                <p>3. Registrá el ingreso sin abrir listas ni paneles extra.</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
