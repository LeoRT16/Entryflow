"use client";

import type * as React from "react";
import { useEffect, useMemo, useState } from "react";

import MetricCard from "@/components/metric-card";
import RecentReservationsTable from "@/components/recent-reservations-table";
import { useFeedback } from "@/components/premium-feedback";
import Topbar from "@/components/topbar";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import ReservationWizardModal, {
  wizardSteps,
} from "@/features/reservations/components/reservation-wizard-modal";
import { buildGuestList, createGuestDraft } from "@/features/reservations/domain/reservation-draft";
import { reservationGuestPresets, reservationTableOptions } from "@/features/reservations/mock/reservations";
import { clampGuestCount } from "@/features/reservations/utils/reservation-utils";
import { recentReservations, summaryMetrics, todayEvent } from "@/lib/mock-data";
import type {
  GuestDraft,
  PaymentMethod,
  PaymentStatus,
  ReservationType,
  WizardStep,
} from "@/features/reservations/types";

export default function ReservationFlow() {
  const { showToast } = useFeedback();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [eventName, setEventName] = useState(todayEvent.name);
  const [date, setDate] = useState(todayEvent.date);
  const [time, setTime] = useState(todayEvent.startsAt);
  const [guestCount, setGuestCount] = useState(5);
  const [reservationType, setReservationType] = useState<ReservationType>("Mesa");
  const [observations, setObservations] = useState(
    "Mesa cerca de pista, acceso preferente y confirmación por WhatsApp.",
  );
  const [holderName, setHolderName] = useState("Sofía");
  const [holderLastName, setHolderLastName] = useState("Rivas");
  const [documentValue, setDocumentValue] = useState("1234567");
  const [whatsapp, setWhatsapp] = useState("+591 70000011");
  const [email, setEmail] = useState("sofia.rivas@mock.com");
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

  const openWizard = () => {
    setIsWizardOpen(true);
    setStep(1);
  };

  const closeWizard = () => setIsWizardOpen(false);

  const completeReservation = () => {
    showToast({
      title: "Reserva creada (modo demo)",
      description: "La reserva quedó registrada visualmente sin persistencia real.",
      tone: "success",
    });
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
              Contexto activo: <span className="font-medium text-white">{todayEvent.name}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Resumen operativo
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {summaryMetrics.map((metric) => (
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
        <RecentReservationsTable reservations={recentReservations} />

        <aside className="space-y-4">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Evento de hoy
            </p>
            <div className="mt-4 space-y-4">
              <LiveSummaryRow label="Evento" value={todayEvent.name} />
              <LiveSummaryRow label="Fecha" value={todayEvent.date} />
              <LiveSummaryRow label="Hora" value={todayEvent.startsAt} />
              <LiveSummaryRow label="Reservas" value={`${todayEvent.reservations}`} />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Borrador activo
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Reserva
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-white">
                  {reservationType} · {eventName}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <LiveSummaryRow label="Invitados" value={`${guestCount}`} />
                <LiveSummaryRow label="Registrados" value={`${registeredGuests}`} />
                <LiveSummaryRow label="Mesa" value={selectedTable.name} />
                <LiveSummaryRow label="Pago" value={paymentStatus} />
              </div>
            </div>
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
        />
      ) : null}
    </div>
  );
}
