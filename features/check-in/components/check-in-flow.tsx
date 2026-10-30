"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import StatusBadge from "@/components/status-badge";
import { formatEventWallDateTime } from "@/lib/date-time";
import QrCameraScanner from "@/features/check-in/components/qr-camera-scanner";
import {
  buildGuestQuickReadSummary,
  formatGuestCarnetLabel,
  getOperatorSafeCheckInError,
  mapOperatorAccessPresentation,
  resolveGuestCheckInEligibility,
  resolveCheckInGuestByQuery,
  shouldAutoSubmitDetectedCheckIn,
} from "@/features/check-in/domain/check-in-domain";
import { isTerminalEventStatus } from "@/features/events/domain";
import { resolveEventVenueDisplayName } from "@/features/events/domain/event-venue-boundary";
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
  return formatEventWallDateTime(startAt);
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

function ValidationField({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}

function CompactGuestRow({ guest, active, onSelect }: { guest: Guest; active: boolean; onSelect: (guest: Guest) => void }) {
  const quickRead = buildGuestQuickReadSummary(guest);
  return (
    <button
      type="button"
      onClick={() => onSelect(guest)}
      data-active={active || undefined}
      className={[
        "w-full rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
        active ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/10 bg-slate-950/70 hover:border-cyan-400/30 hover:bg-slate-950/90",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 break-words text-sm font-semibold text-white">{quickRead.name}</p>
        <p className="shrink-0 text-xs font-medium text-slate-300">
          {quickRead.entryStatus} <span className="text-slate-600">·</span> {quickRead.accessStatus}
        </p>
      </div>
      <p className="mt-1 break-words text-xs text-slate-400">
        {formatGuestCarnetLabel(quickRead.carnet)} <span aria-hidden="true" className="text-slate-600">·</span> {quickRead.reservation}
        {quickRead.space && quickRead.space !== "Sin mesa" ? <><span aria-hidden="true" className="text-slate-600"> · </span>{quickRead.space}</> : null}
      </p>
    </button>
  );
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
    checkIns,
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
  const [scannerCycle, setScannerCycle] = useState(0);
  const [operatorMode, setOperatorMode] = useState<"manual" | "qr">(() => {
    if (typeof window === "undefined") return "manual";
    const savedMode = window.localStorage.getItem("entryflow-checkin-mode");
    return savedMode === "qr" || savedMode === "manual" ? savedMode : "manual";
  });
  const [highlightedResultIndex, setHighlightedResultIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const validationRef = useRef<HTMLElement | null>(null);

  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();
  const shouldShowResults = normalizedQuery.length >= 2;

  const allSearchResults = useMemo(
    () => (shouldShowResults ? searchGuestList(normalizedQuery).filter((guest) => guest.eventId === currentEvent.id) : []),
    [currentEvent.id, normalizedQuery, searchGuestList, shouldShowResults],
  );
  const searchResults = useMemo(() => allSearchResults.slice(0, 6), [allSearchResults]);

  const setPreferredMode = (mode: "manual" | "qr") => {
    setOperatorMode(mode);
    window.localStorage.setItem("entryflow-checkin-mode", mode);
  };

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
  const findHistoricalCheckIn = (guest: Guest | null) => guest
    ? checkIns.find((checkIn) => checkIn.guestId === guest.id && checkIn.eventId === guest.eventId && checkIn.status === "Checked In")
    : undefined;
  const selectedGuestQuickRead = selectedGuest ? buildGuestQuickReadSummary(selectedGuest, findHistoricalCheckIn(selectedGuest)) : null;
  const attemptGuest = attemptState.kind === "idle" ? null : attemptState.guest ?? null;
  const attemptGuestQuickRead = attemptGuest ? buildGuestQuickReadSummary(attemptGuest, findHistoricalCheckIn(attemptGuest)) : null;
  const historicalContext = attemptGuestQuickRead && attemptState.kind === "warning"
    ? {
        time: attemptGuestQuickRead.checkInTime,
        gate: attemptGuestQuickRead.gate,
        operator: attemptGuestQuickRead.checkInOperator,
      }
    : null;
  const selectedHistoricalContext = selectedGuestQuickRead && selectedGuestQuickRead.entryStatus === "Ingresó"
    ? {
        time: selectedGuestQuickRead.checkInTime,
        gate: selectedGuestQuickRead.gate,
        operator: selectedGuestQuickRead.checkInOperator,
      }
    : null;

  const selectedGuestReservation = selectedGuest
    ? eventReservations.find((reservation) => reservation.id === selectedGuest.reservationId) ?? null
    : null;

  const eligibility = selectedGuest
    ? resolveGuestCheckInEligibility(selectedGuest, selectedGuestReservation)
    : null;
  const operatorPresentation = mapOperatorAccessPresentation(eligibility);
  const canRegister = Boolean(selectedGuest && !isTerminalEvent && operatorPresentation.canAdmit);
  const primaryStatusLabel = operatorPresentation.state === "ready"
    ? "Puede entrar"
    : operatorPresentation.state === "entered"
      ? "Ya ingresó"
      : operatorPresentation.label;
  useEffect(() => {
    if (validationMethod === "Manual" && attemptState.kind === "idle" && !isSubmitting) {
      searchInputRef.current?.focus();
    }
  }, [attemptState.kind, isSubmitting, validationMethod]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedGuestId(null);
    setValidationMethod("Manual");
    setAttemptState({ kind: "idle" });
    setHighlightedResultIndex(-1);
  };

  const handleDetected = (value: string) => {
    setQuery(value);
    setValidationMethod("QR");

    const match = resolveCheckInGuestByQuery({
      query: value,
      guests: eventGuests,
      reservations: eventReservations,
      event: currentEvent,
    });
    setSelectedGuestId(match?.id ?? null);
    requestAnimationFrame(() => validationRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));

    if (
      match &&
      shouldAutoSubmitDetectedCheckIn({
        canEnter: resolveGuestCheckInEligibility(
          match,
          eventReservations.find((reservation) => reservation.id === match.reservationId) ?? null,
        ).canEnter,
        isTerminalEvent,
      })
    ) {
      void submitCheckIn(match, value, "QR");
    }
  };

  const handleSelectGuest = (guest: Guest) => {
    setSelectedGuestId(guest.id);
    setValidationMethod("Manual");
    setAttemptState({ kind: "idle" });
    setHighlightedResultIndex(searchResults.findIndex((candidate) => candidate.id === guest.id));
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && searchResults.length) {
      event.preventDefault();
      setHighlightedResultIndex((index) => Math.min(index + 1, searchResults.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && searchResults.length) {
      event.preventDefault();
      setHighlightedResultIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setSelectedGuestId(null);
      setHighlightedResultIndex(-1);
      setAttemptState({ kind: "idle" });
      return;
    }
    if (event.key !== "Enter") return;

    if (!selectedGuestId) {
      const candidate = searchResults[highlightedResultIndex] ?? (searchResults.length === 1 ? searchResults[0] : null);
      if (candidate) {
        event.preventDefault();
        handleSelectGuest(candidate);
      }
      return;
    }
    if (canRegister) {
      event.preventDefault();
      void handleRegister();
    }
  };

  const handleRegister = async () => {
    if (!selectedGuest || isSubmitting || isTerminalEvent) {
      return;
    }

    const presentedCredential = query;
    const normalizedCredential = presentedCredential.trim().toLowerCase();
    const isCredentialMatch = normalizedCredential === selectedGuest.qrToken?.trim().toLowerCase()
      || normalizedCredential === selectedGuest.accessCode?.trim().toLowerCase();
    await submitCheckIn(selectedGuest, presentedCredential, isCredentialMatch ? "QR" : validationMethod);
  };

  const resetAdmissionState = () => {
    setQuery("");
    setSelectedGuestId(null);
    setAttemptState({ kind: "idle" });
  };

  const startNextAdmission = () => {
    if (isSubmitting) return;
    const nextMethod = validationMethod;
    resetAdmissionState();
    setValidationMethod(nextMethod);
    setAttemptState({ kind: "idle" });
    setScannerCycle((cycle) => cycle + 1);
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
        selectedGuestId: method === "Manual" ? guest.id : undefined,
      });

      const tone = getAttemptTone(result.result);

      setAttemptState({
        kind: tone,
        title: result.result === "Encontrado" ? "Ingreso registrado" : result.result === "Usado" ? "Ya ingresó" : "Acceso bloqueado",
        note: result.result === "Usado" ? "Este acceso ya fue utilizado." : result.note,
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
        note: getOperatorSafeCheckInError(error),
        guest,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAttempt = () => {
    startNextAdmission();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.08),_transparent_26%),linear-gradient(180deg,#07111f_0%,#08111d_46%,#050b14_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_90px_rgba(2,6,23,0.35)] backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                INGRESO
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Validar acceso
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-300">
                <span className="font-medium text-white">{currentEvent.name}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>{formatEventContext(currentEvent.startAt)}</span>
                {resolveEventVenueDisplayName({ currentVenueName: currentVenue?.name, eventVenue: currentEvent.venue }) ? (
                  <><span aria-hidden="true" className="text-slate-600">·</span><span>{resolveEventVenueDisplayName({ currentVenueName: currentVenue?.name, eventVenue: currentEvent.venue })}</span></>
                ) : null}
              </div>
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

        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2" aria-label="Modo de ingreso">
              <button type="button" onClick={() => setPreferredMode("manual")} aria-pressed={operatorMode === "manual"} className={operatorMode === "manual" ? "h-10 rounded-xl bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-50" : "h-10 rounded-xl px-4 text-sm font-medium text-slate-400 hover:bg-white/[0.05] hover:text-white"}>Búsqueda manual</button>
              <button type="button" onClick={() => setPreferredMode("qr")} aria-pressed={operatorMode === "qr"} className={operatorMode === "qr" ? "h-10 rounded-xl bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-50" : "h-10 rounded-xl px-4 text-sm font-medium text-slate-400 hover:bg-white/[0.05] hover:text-white"}>Escanear QR</button>
            </section>

            {operatorMode === "qr" ? <QrCameraScanner key={scannerCycle} eventName={currentEvent.name} onDetected={handleDetected} onRestart={resetAdmissionState} /> : null}

            <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    Búsqueda manual
                  </h2>
                </div>
                <StatusBadge variant={validationMethod === "QR" ? "info" : "success"}>
                  {validationMethod === "QR" ? "Validación por QR" : "Validación manual"}
                </StatusBadge>
              </div>

              <label className="mt-4 block">
                <span className="sr-only">Buscar invitado</span>
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Nombre, carnet, código de invitación o reserva"
                  className="mt-1 w-full rounded-[1.25rem] border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
                />
              </label>

              {shouldShowResults ? (
                searchResults.length > 1 ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Coincidencias
                      </p>
                      <p className="text-xs text-slate-400">{allSearchResults.length} resultado{allSearchResults.length === 1 ? "" : "s"}</p>
                    </div>

                    <div className="grid gap-3">
                      {searchResults.map((guest, index) => <CompactGuestRow key={guest.id} guest={guest} active={index === highlightedResultIndex} onSelect={handleSelectGuest} />)}
                    </div>
                    {allSearchResults.length > searchResults.length ? <p className="text-xs leading-5 text-slate-400">Mostramos los primeros {searchResults.length}. Refiná la búsqueda por carnet, código o nombre para ubicar más rápido al invitado.</p> : null}
                  </div>
                ) : searchResults.length === 1 ? (
                  <div className="mt-4 rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-300">
                    Una coincidencia encontrada. Presioná Enter para seleccionarla y una segunda vez para registrar el ingreso.
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.3rem] border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-300">
                    No encontramos este acceso. Revisa el dato o continúa con otra búsqueda.
                  </div>
                )
              ) : null}
            </section>
          </div>

          <aside ref={validationRef} aria-live="polite" className="space-y-4">
            <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Resultado
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Validación</h2>
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
                  </div>

                  {attemptGuestQuickRead ? (
                    <div className="mt-3 grid min-w-0 gap-x-5 gap-y-3 sm:grid-cols-2">
                      <ValidationField label="Carnet" value={attemptGuestQuickRead.carnet} />
                      <ValidationField label="Reserva" value={attemptGuestQuickRead.reservationCode} />
                      <ValidationField label="Titular" value={attemptGuestQuickRead.reservationHolder} />
                      {attemptGuestQuickRead.spaceLabel ? <ValidationField label={attemptGuestQuickRead.spaceLabel} value={attemptGuestQuickRead.space} /> : null}
                      {historicalContext?.time ? <ValidationField label="Hora de ingreso" value={historicalContext.time} /> : null}
                      {historicalContext?.operator ? <ValidationField label="Registrado por" value={historicalContext.operator} /> : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={startNextAdmission}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                  >
                    Siguiente ingreso
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
                        <StatusBadge variant={operatorPresentation.tone}>{primaryStatusLabel}</StatusBadge>
                      </div>
                    </div>

                    <div className="mt-3 grid min-w-0 gap-x-5 gap-y-3 sm:grid-cols-2">
                      <ValidationField label="Carnet" value={selectedGuestQuickRead?.carnet} />
                      <ValidationField label="Reserva" value={selectedGuestQuickRead?.reservationCode} />
                      <ValidationField label="Titular" value={selectedGuestQuickRead?.reservationHolder} />
                      {selectedGuestQuickRead?.spaceLabel ? <ValidationField label={selectedGuestQuickRead.spaceLabel} value={selectedGuestQuickRead.space} /> : null}
                      {selectedHistoricalContext?.time ? <ValidationField label="Hora de ingreso" value={selectedHistoricalContext.time} /> : null}
                      {selectedHistoricalContext?.operator ? <ValidationField label="Registrado por" value={selectedHistoricalContext.operator} /> : null}
                    </div>

                    {operatorPresentation.state !== "ready" ? <div className="mt-4 rounded-[1.1rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">{operatorPresentation.description}</div> : null}
                  </div>

                  <button
                    type="button"
                    onClick={canRegister ? () => void handleRegister() : resetAttempt}
                    disabled={canRegister ? isSubmitting : false}
                    className={[
                      "sticky bottom-3 z-10 inline-flex h-11 w-full items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition lg:static",
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

          </aside>
        </section>
      </div>
    </main>
  );
}
