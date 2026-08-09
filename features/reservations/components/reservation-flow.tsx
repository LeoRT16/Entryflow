"use client";

import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import MetricCard from "@/components/metric-card";
import Topbar from "@/components/topbar";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import ReservationWizardModal, {
  wizardSteps,
} from "@/features/reservations/components/reservation-wizard-modal";
import ReservationOperationsBoard from "@/features/reservations/components/reservation-operations-board";
import { buildGuestList, createGuestDraft } from "@/features/reservations/domain/reservation-draft";
import { reservationGuestPresets, reservationTableOptions } from "@/features/reservations/domain/reservation-presets";
import { clampGuestCount } from "@/features/reservations/utils/reservation-utils";
import type {
  GuestDraft,
  PaymentMethod,
  PaymentStatus,
  ReservationCreationInput,
  ReservationSummary,
  ReservationType,
  WizardStep,
} from "@/features/reservations/types";
import { useCheckInStore } from "@/services/workspace-service";
import StatusBadge from "@/components/status-badge";
import { GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";

type CheckInStore = ReturnType<typeof useCheckInStore>;

type ReservationFlowWorkspaceProps = Pick<
  CheckInStore,
  | "currentOrganization"
  | "currentEvent"
  | "events"
  | "workspaceIntelligence"
  | "workspacePriority"
  | "reservationSummaries"
  | "createReservation"
  | "addReservationGuest"
  | "updateReservationGuest"
  | "setReservationStatus"
  | "registerCheckIn"
>;

function reservationPriorityWeight(statusTone: ReservationSummary["statusTone"]) {
  if (statusTone === "danger") return 0;
  if (statusTone === "warning") return 1;
  if (statusTone === "info") return 2;
  return 3;
}

function compareReservationPriority(a: ReservationSummary, b: ReservationSummary) {
  const toneDelta = reservationPriorityWeight(a.statusTone) - reservationPriorityWeight(b.statusTone);

  if (toneDelta !== 0) {
    return toneDelta;
  }

  const pendingDelta = b.metrics.pendingGuests - a.metrics.pendingGuests;

  if (pendingDelta !== 0) {
    return pendingDelta;
  }

  const checkedInDelta = b.metrics.checkedInGuests - a.metrics.checkedInGuests;

  if (checkedInDelta !== 0) {
    return checkedInDelta;
  }

  return a.name.localeCompare(b.name);
}

export default function ReservationFlow() {
  const store = useCheckInStore();

  return (
    <ReservationFlowWorkspace
      key={store.currentEvent.id}
      currentOrganization={store.currentOrganization}
      currentEvent={store.currentEvent}
      events={store.events}
      workspaceIntelligence={store.workspaceIntelligence}
      workspacePriority={store.workspacePriority}
      reservationSummaries={store.reservationSummaries}
      createReservation={store.createReservation}
      addReservationGuest={store.addReservationGuest}
      updateReservationGuest={store.updateReservationGuest}
      setReservationStatus={store.setReservationStatus}
      registerCheckIn={store.registerCheckIn}
    />
  );
}

function ReservationFlowWorkspace({
  currentOrganization,
  currentEvent,
  events,
  workspaceIntelligence,
  workspacePriority,
  reservationSummaries,
  createReservation,
  addReservationGuest,
  updateReservationGuest,
  setReservationStatus,
  registerCheckIn,
}: ReservationFlowWorkspaceProps) {
  const [eventDate, eventTime] = currentEvent.startAt.trim().split(/\s+(?=\d{1,2}:\d{2}$)/);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [eventName, setEventName] = useState(currentEvent.name);
  const [date, setDate] = useState(eventDate ?? currentEvent.startAt);
  const [time, setTime] = useState(eventTime ?? "");
  const [guestCount, setGuestCount] = useState(5);
  const [reservationType, setReservationType] = useState<ReservationType>("Mesa");
  const [observations, setObservations] = useState(
    "Mesa cerca de pista, acceso preferente y confirmación por WhatsApp.",
  );
  const [holderName, setHolderName] = useState("Sofía");
  const [holderLastName, setHolderLastName] = useState("Rivas");
  const [documentValue, setDocumentValue] = useState("1234567");
  const [whatsapp, setWhatsapp] = useState("+591 70000011");
  const [email, setEmail] = useState("sofia.rivas@ejemplo.com");
  const [preferences, setPreferences] = useState("Mesa tranquila, música moderada");
  const [vip, setVip] = useState(true);
  const [frequent, setFrequent] = useState(false);
  const [notes, setNotes] = useState("Celebración de cumpleaños con grupo cerrado.");
  const [guests, setGuests] = useState<GuestDraft[]>(() =>
    buildGuestList(5, reservationGuestPresets),
  );
  const [selectedTableId, setSelectedTableId] = useState(reservationTableOptions[0].id);
  const [amount, setAmount] = useState("850");
  const [advance, setAdvance] = useState("300");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Transferencia");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Parcial");
  const router = useRouter();
  const prioritizedReservations = useMemo(
    () => [...reservationSummaries].sort(compareReservationPriority),
    [reservationSummaries],
  );
  const [activeReservationId, setActiveReservationId] = useState<string>(
    () => prioritizedReservations[0]?.id ?? "",
  );

  const eventOptions = useMemo(
    () =>
      events
        .filter((event) => event.organizationId === currentOrganization.id)
        .map((event) => event.name),
    [currentOrganization.id, events],
  );

  const selectedTable = useMemo(
    () =>
      reservationTableOptions.find((table) => table.id === selectedTableId) ??
      reservationTableOptions[0],
    [selectedTableId],
  );

  const registeredGuests = useMemo(
    () => guests.filter((guest) => guest.name.trim().length > 0).length,
    [guests],
  );

  const pendingGuests = Math.max(guestCount - registeredGuests, 0);

  const amountNumber = Number(amount || 0);
  const advanceNumber = Number(advance || 0);
  const pendingNumber = Math.max(amountNumber - advanceNumber, 0);
  const completion = step / wizardSteps.length;
  const reservationTotals = workspaceIntelligence.statistics.cards;
  const reservationInsights = workspacePriority.byModule.Reservations;
  const prioritySummary = workspacePriority.summary;
  const capacity = workspaceIntelligence.capacity;
  const openWizard = useCallback(() => {
    setIsWizardOpen(true);
    setStep(1);
  }, []);

  const closeWizard = useCallback(() => setIsWizardOpen(false), []);

  const activeReservation =
    prioritizedReservations.find((reservation) => reservation.id === activeReservationId) ??
    prioritizedReservations[0] ??
    null;
  const guidedActions = useMemo(() => {
    const actions = [
      ...(activeReservation && (activeReservation.status === "Draft" || activeReservation.status === "Pending")
        ? [
            {
              id: `${activeReservation.id}-confirm`,
              label: "Confirmar reserva",
              reason: `${activeReservation.name} todavía no está confirmada.`,
              impact: "Desbloquea invitados, mesa y check-in para esta reserva.",
              priority: "critical" as const,
              tone: "danger" as const,
              onSelect: () => setReservationStatus(activeReservation.id, "Confirmed"),
            },
          ]
        : []),
      ...(activeReservation && (!activeReservation.tableName || activeReservation.tableName.toLowerCase().includes("sin mesa"))
        ? [
            {
              id: `${activeReservation.id}-table`,
              label: "Asignar mesa",
              reason: `${activeReservation.name} todavía no tiene mesa asignada.`,
              impact: "Reduce fricción y deja la reserva lista para operar.",
              priority: "blocking" as const,
              tone: "warning" as const,
              href: "/tables",
            },
          ]
        : []),
      ...(activeReservation && activeReservation.metrics.pendingGuests > 0
        ? [
            {
              id: `${activeReservation.id}-checkin`,
              label: "Continuar check-in",
              reason: `${activeReservation.metrics.pendingGuests} invitados siguen pendientes de ingreso.`,
              impact: "Lleva el grupo al flujo de admisión sin perder contexto.",
              priority: "quick" as const,
              tone: "info" as const,
              href: "/check-in",
            },
          ]
        : []),
      ...reservationInsights.slice(0, 2).map((item) =>
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
  }, [activeReservation, reservationInsights, setReservationStatus]);

  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          id: "reservations-new",
          shortcut: "n",
          priority: 50,
          handler: openWizard,
        },
        {
          id: "reservations-assign-table",
          shortcut: "a",
          priority: 45,
          handler: () => router.push("/tables"),
        },
        {
          id: "reservations-confirm",
          shortcut: "c",
          priority: 55,
          handler: () => {
            if (!activeReservation) {
              return;
            }

            if (activeReservation.status === "Draft" || activeReservation.status === "Pending") {
              setReservationStatus(activeReservation.id, "Confirmed");
            }
          },
        },
      ],
      [activeReservation, openWizard, router, setReservationStatus],
    ),
  );

  useEffect(() => {
    if (!isWizardOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsWizardOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isWizardOpen]);

  const updateGuestCount = (nextCount: number) => {
    const sanitizedCount = clampGuestCount(nextCount);
    setGuestCount(sanitizedCount);
    setGuests((currentGuests) => {
      if (sanitizedCount === currentGuests.length) {
        return currentGuests;
      }

      if (sanitizedCount > currentGuests.length) {
      return [
        ...currentGuests,
        ...Array.from({ length: sanitizedCount - currentGuests.length }, (_, index) =>
          createGuestDraft(currentGuests.length + index, reservationGuestPresets),
        ),
      ];
      }

      return currentGuests.slice(0, sanitizedCount);
    });
  };

  const updateGuest = (
    index: number,
    field: keyof GuestDraft,
    value: string | boolean,
  ) => {
    setGuests((currentGuests) =>
      currentGuests.map((guest, guestIndex) =>
        guestIndex === index ? { ...guest, [field]: value } : guest,
      ),
    );
  };

  const addGuest = () => {
    if (guestCount >= 10) {
      return;
    }

    const nextCount = guestCount + 1;
    setGuestCount(nextCount);
    setGuests((currentGuests) => [
      ...currentGuests,
      createGuestDraft(currentGuests.length, reservationGuestPresets),
    ]);
  };

  const removeGuest = (index: number) => {
    if (guests.length <= 1) {
      return;
    }

    setGuests((currentGuests) => currentGuests.filter((_, guestIndex) => guestIndex !== index));
    setGuestCount((currentCount) => clampGuestCount(currentCount - 1));
  };

  const goNext = () =>
    setStep((currentStep) => Math.min(6, currentStep + 1) as WizardStep);
  const goPrevious = () =>
    setStep((currentStep) => Math.max(1, currentStep - 1) as WizardStep);

  const completeReservation = (input: Omit<ReservationCreationInput, "eventId">) => {
    const reservation = createReservation({
      ...input,
      eventId: currentEvent.id,
      eventName: currentEvent.name,
    });
    setActiveReservationId(reservation.id);
    closeWizard();
  };

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Reservas"
        title="Flujo de creación"
        description="Experiencia premium guiada para crear reservas con datos simulados y sin salir del espacio operativo."
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
              Borrador
            </span>
            <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
              Todo el flujo es simulado
            </span>
          </div>

          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Crear una reserva premium en menos de un minuto.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              El operador captura la información general, titular, invitados, mesa
              y pago dentro de un flujo limpio, rápido y elegante.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={openWizard}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Crear reserva
            </button>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
              Contexto activo: <span className="font-medium text-white">{currentEvent.name}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Resumen operativo
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {workspaceIntelligence.dashboard.summaryMetrics.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                detail={metric.detail}
                tone={metric.tone}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.74fr]">
        <div className="space-y-6">
          <GuidedActionPanel
            title="Siguiente paso"
            description="El sistema muestra primero la acción que más desbloquea esta reserva."
            items={guidedActions}
          />

          <ReservationOperationsBoard
            reservations={prioritizedReservations}
            activeReservationId={activeReservation?.id ?? ""}
            onSelectReservation={setActiveReservationId}
            onMarkConfirmed={(reservationId) => {
              setReservationStatus(reservationId, "Confirmed");
            }}
            onAddGuest={(reservationId, guest) => {
              addReservationGuest(reservationId, guest);
            }}
            onGuestAction={(params) => {
              updateReservationGuest(params);
            }}
            onRegisterCheckIn={(reservationId, guestId) => {
              const reservation = reservationSummaries.find((item) => item.id === reservationId);
              const guest = reservation?.guests.find((item) => item.id === guestId);

              if (!reservation || !guest) {
                return;
              }

              registerCheckIn({
                query: guest.invitationCode,
                method: "Manual",
                operator: "Recepción",
              });
            }}
            onCancelReservation={(reservationId) => {
              setReservationStatus(reservationId, "Cancelled");
            }}
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Estado general
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LiveSummaryRow label="Reservas activas" value={`${reservationTotals.activeReservations}`} />
              <LiveSummaryRow label="Invitados" value={`${reservationTotals.expectedGuests}`} />
              <LiveSummaryRow label="Confirmados" value={`${reservationTotals.confirmedReservations}`} />
              <LiveSummaryRow label="Ingresados" value={`${reservationTotals.checkedInGuests}`} />
              <LiveSummaryRow label="Pendientes" value={`${reservationTotals.pendingGuests}`} />
              <LiveSummaryRow label="Capacidad restante" value={`${reservationTotals.capacityRemaining}`} />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Reserva activa
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Reserva
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-white">
                  {activeReservation?.name ?? reservationType} · {activeReservation?.eventName ?? eventName}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <LiveSummaryRow label="Invitados" value={`${activeReservation?.metrics.guestCount ?? guestCount}`} />
                <LiveSummaryRow label="Registrados" value={`${activeReservation?.metrics.checkedInGuests ?? registeredGuests}`} />
                <LiveSummaryRow label="Mesa" value={activeReservation?.tableName ?? selectedTable.name} />
                <LiveSummaryRow label="Pago" value={activeReservation?.paymentStatus ?? paymentStatus} />
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Prioridad operativa</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{prioritySummary.message}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{prioritySummary.nextBestAction}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">{workspaceIntelligence.health.title}</p>
            <div className="mt-4 space-y-3">
              {reservationInsights.length ? (
                reservationInsights.slice(0, 3).map((item) => (
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
            <p className="mt-4 text-xs text-slate-400">{capacity.summary}</p>
          </section>
        </aside>
      </section>

      {isWizardOpen ? (
        <ReservationWizardModal
          step={step}
          setStep={setStep}
          goNext={goNext}
          goPrevious={goPrevious}
          closeWizard={closeWizard}
          eventName={eventName}
          setEventName={setEventName}
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          guestCount={guestCount}
          updateGuestCount={updateGuestCount}
          reservationType={reservationType}
          setReservationType={setReservationType}
          observations={observations}
          setObservations={setObservations}
          holderName={holderName}
          setHolderName={setHolderName}
          holderLastName={holderLastName}
          setHolderLastName={setHolderLastName}
          documentValue={documentValue}
          setDocumentValue={setDocumentValue}
          whatsapp={whatsapp}
          setWhatsapp={setWhatsapp}
          email={email}
          setEmail={setEmail}
          preferences={preferences}
          setPreferences={setPreferences}
          vip={vip}
          setVip={setVip}
          frequent={frequent}
          setFrequent={setFrequent}
          notes={notes}
          setNotes={setNotes}
          guests={guests}
          addGuest={addGuest}
          removeGuest={removeGuest}
          updateGuest={updateGuest}
          selectedTable={selectedTable}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          amount={amount}
          setAmount={setAmount}
          advance={advance}
          setAdvance={setAdvance}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentStatus={paymentStatus}
          setPaymentStatus={setPaymentStatus}
          pendingNumber={pendingNumber}
          completion={completion}
          registeredGuests={registeredGuests}
          pendingGuests={pendingGuests}
          onCreateReservation={completeReservation}
          eventOptions={eventOptions}
        />
      ) : null}
    </div>
  );
}
