"use client";

import type * as React from "react";
import { useEffect, useMemo, useState } from "react";

import MetricCard from "@/components/metric-card";
import RecentReservationsTable from "@/components/recent-reservations-table";
import { useFeedback } from "@/components/premium-feedback";
import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { recentReservations, summaryMetrics, todayEvent } from "@/lib/mock-data";

type ReservationType = "Mesa" | "Cumpleaños" | "VIP" | "Corporativo";
type PaymentMethod = "Efectivo" | "Transferencia" | "Tarjeta" | "Cortesía";
type PaymentStatus = "Pendiente" | "Parcial" | "Pagado";
type GuestInvitationState = "Pendiente" | "Lista" | "Enviada" | "Transferida";
type TableStatus = "Reservada" | "Disponible";
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type GuestDraft = {
  id: string;
  name: string;
  whatsapp: string;
  document: string;
  invitationState: GuestInvitationState;
  vip: boolean;
  transferBadge: string;
};

type TableOption = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  status: TableStatus;
  recommended?: boolean;
  tone: "success" | "warning" | "info";
};

type PaymentHistoryEntry = {
  time: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "info";
};

const wizardSteps: Array<{ step: WizardStep; title: string; subtitle: string }> = [
  {
    step: 1,
    title: "Información general",
    subtitle: "Contexto del evento y configuración básica de la reserva.",
  },
  {
    step: 2,
    title: "Titular",
    subtitle: "Datos del responsable y preferencias operativas.",
  },
  {
    step: 3,
    title: "Invitados",
    subtitle: "Lista editable de invitados con estado de invitación.",
  },
  {
    step: 4,
    title: "Mesa",
    subtitle: "Selección visual de mesa o área recomendada.",
  },
  {
    step: 5,
    title: "Pago",
    subtitle: "Monto, adelanto y estado de cobro simulado.",
  },
  {
    step: 6,
    title: "Resumen",
    subtitle: "Vista final antes de crear la reserva.",
  },
];

const reservationTypes: ReservationType[] = ["Mesa", "Cumpleaños", "VIP", "Corporativo"];
const paymentMethods: PaymentMethod[] = ["Efectivo", "Transferencia", "Tarjeta", "Cortesía"];
const paymentStatuses: PaymentStatus[] = ["Pendiente", "Parcial", "Pagado"];

const tableOptions: TableOption[] = [
  {
    id: "mesa-12",
    name: "Mesa 12",
    capacity: 5,
    location: "Sala principal",
    status: "Reservada",
    recommended: true,
    tone: "success",
  },
  {
    id: "vip-lounge",
    name: "VIP Lounge",
    capacity: 8,
    location: "Nivel superior",
    status: "Reservada",
    tone: "info",
  },
  {
    id: "terraza",
    name: "Terraza",
    capacity: 4,
    location: "Patio lateral",
    status: "Disponible",
    tone: "warning",
  },
  {
    id: "bar",
    name: "Bar",
    capacity: 3,
    location: "Frente a pista",
    status: "Disponible",
    tone: "warning",
  },
];

const paymentHistory: PaymentHistoryEntry[] = [
  {
    time: "18:42",
    title: "Transferencia confirmada",
    detail: "Se registró un adelanto parcial desde recepción.",
    tone: "success",
  },
  {
    time: "18:49",
    title: "Saldo actualizado",
    detail: "El sistema simulado recalculó el pendiente de la reserva.",
    tone: "info",
  },
  {
    time: "18:56",
    title: "Estado revisado",
    detail: "El operador dejó la reserva en estado parcial.",
    tone: "warning",
  },
];

const eventOptions = [todayEvent.name, "Viernes Retro", "Fiesta Blanca"];

const guestPresets: Array<Partial<GuestDraft>> = [
  {
    name: "Leonardo Rodríguez",
    whatsapp: "+591 70000001",
    document: "1234567",
    invitationState: "Enviada",
    vip: true,
    transferBadge: "VIP",
  },
  {
    name: "Andrea Pérez",
    whatsapp: "+591 70000002",
    document: "7654321",
    invitationState: "Transferida",
    vip: false,
    transferBadge: "Transferible",
  },
  {
    name: "Carlos Méndez",
    whatsapp: "+591 70000003",
    document: "9988776",
    invitationState: "Lista",
    vip: false,
    transferBadge: "Transferible",
  },
];

function createGuestDraft(index: number): GuestDraft {
  const preset = guestPresets[index] ?? {};

  return {
    id: `guest-${index + 1}`,
    name: preset.name ?? "",
    whatsapp: preset.whatsapp ?? "",
    document: preset.document ?? "",
    invitationState: preset.invitationState ?? "Pendiente",
    vip: preset.vip ?? false,
    transferBadge: preset.transferBadge ?? "Transferible",
  };
}

function buildGuestList(count: number) {
  return Array.from({ length: count }, (_, index) => createGuestDraft(index));
}

function formatCurrency(value: string) {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));

  if (!value || Number.isNaN(numeric)) {
    return "Bs 0";
  }

  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function clampGuestCount(value: number) {
  return Math.max(1, Math.min(10, value));
}

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
  const [guests, setGuests] = useState<GuestDraft[]>(() => buildGuestList(5));
  const [selectedTableId, setSelectedTableId] = useState(tableOptions[0].id);
  const [amount, setAmount] = useState("850");
  const [advance, setAdvance] = useState("300");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Transferencia");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Parcial");

  const selectedTable = useMemo(
    () => tableOptions.find((table) => table.id === selectedTableId) ?? tableOptions[0],
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
            createGuestDraft(currentGuests.length + index),
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
      createGuestDraft(currentGuests.length),
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

function ReservationWizardModal({
  step,
  setStep,
  goNext,
  goPrevious,
  closeWizard,
  eventName,
  setEventName,
  date,
  setDate,
  time,
  setTime,
  guestCount,
  updateGuestCount,
  reservationType,
  setReservationType,
  observations,
  setObservations,
  holderName,
  setHolderName,
  holderLastName,
  setHolderLastName,
  documentValue,
  setDocumentValue,
  whatsapp,
  setWhatsapp,
  email,
  setEmail,
  preferences,
  setPreferences,
  vip,
  setVip,
  frequent,
  setFrequent,
  notes,
  setNotes,
  guests,
  addGuest,
  removeGuest,
  updateGuest,
  selectedTable,
  selectedTableId,
  setSelectedTableId,
  amount,
  setAmount,
  advance,
  setAdvance,
  paymentMethod,
  setPaymentMethod,
  paymentStatus,
  setPaymentStatus,
  pendingNumber,
  completion,
  registeredGuests,
  pendingGuests,
  onCreateReservation,
}: {
  step: WizardStep;
  setStep: React.Dispatch<React.SetStateAction<WizardStep>>;
  goNext: () => void;
  goPrevious: () => void;
  closeWizard: () => void;
  eventName: string;
  setEventName: React.Dispatch<React.SetStateAction<string>>;
  date: string;
  setDate: React.Dispatch<React.SetStateAction<string>>;
  time: string;
  setTime: React.Dispatch<React.SetStateAction<string>>;
  guestCount: number;
  updateGuestCount: (nextCount: number) => void;
  reservationType: ReservationType;
  setReservationType: React.Dispatch<React.SetStateAction<ReservationType>>;
  observations: string;
  setObservations: React.Dispatch<React.SetStateAction<string>>;
  holderName: string;
  setHolderName: React.Dispatch<React.SetStateAction<string>>;
  holderLastName: string;
  setHolderLastName: React.Dispatch<React.SetStateAction<string>>;
  documentValue: string;
  setDocumentValue: React.Dispatch<React.SetStateAction<string>>;
  whatsapp: string;
  setWhatsapp: React.Dispatch<React.SetStateAction<string>>;
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  preferences: string;
  setPreferences: React.Dispatch<React.SetStateAction<string>>;
  vip: boolean;
  setVip: React.Dispatch<React.SetStateAction<boolean>>;
  frequent: boolean;
  setFrequent: React.Dispatch<React.SetStateAction<boolean>>;
  notes: string;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  guests: GuestDraft[];
  addGuest: () => void;
  removeGuest: (index: number) => void;
  updateGuest: (
    index: number,
    field: keyof GuestDraft,
    value: string | boolean,
  ) => void;
  selectedTable: TableOption;
  selectedTableId: string;
  setSelectedTableId: React.Dispatch<React.SetStateAction<string>>;
  amount: string;
  setAmount: React.Dispatch<React.SetStateAction<string>>;
  advance: string;
  setAdvance: React.Dispatch<React.SetStateAction<string>>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: React.Dispatch<React.SetStateAction<PaymentMethod>>;
  paymentStatus: PaymentStatus;
  setPaymentStatus: React.Dispatch<React.SetStateAction<PaymentStatus>>;
  pendingNumber: number;
  completion: number;
  registeredGuests: number;
  pendingGuests: number;
  onCreateReservation: () => void;
}) {
  const currentStep = wizardSteps.find((item) => item.step === step) ?? wizardSteps[0];

  const liveSummary = [
    { label: "Código", value: "RES-0108-DB" },
    { label: "Invitados", value: `${guestCount}` },
    { label: "Mesa", value: selectedTable.name },
    { label: "Monto", value: formatCurrency(amount) },
    { label: "Pago", value: paymentStatus },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={closeWizard}
        className="absolute inset-0"
      />

      <div className="relative mx-auto flex h-full w-full max-w-[1700px] items-stretch p-0 lg:p-4">
        <div
          className="relative flex h-full w-full flex-col overflow-hidden border border-white/10 bg-[#0b0f14] shadow-[0_32px_120px_rgba(0,0,0,0.45)] lg:rounded-[2rem]"
          style={{ animation: "wizardShellIn 220ms ease" }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Crear reserva
                </p>
                <StatusBadge variant="info">Borrador</StatusBadge>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                {currentStep.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                {currentStep.subtitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeWizard}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
              <main className="min-w-0 border-b border-white/10 px-5 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:border-white/10 lg:px-8 lg:py-6">
                <div className="space-y-5">
                  <WizardProgress step={step} completion={completion} />

                  <div
                    key={step}
                    className="space-y-5"
                    style={{ animation: "wizardStepIn 220ms ease" }}
                  >
                    {step === 1 ? (
                      <GeneralStep
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
                      />
                    ) : null}

                    {step === 2 ? (
                      <HolderStep
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
                      />
                    ) : null}

                    {step === 3 ? (
                      <GuestsStep
                        guests={guests}
                        guestCount={guestCount}
                        registeredGuests={registeredGuests}
                        pendingGuests={pendingGuests}
                        addGuest={addGuest}
                        removeGuest={removeGuest}
                        updateGuest={updateGuest}
                      />
                    ) : null}

                    {step === 4 ? (
                      <TableStep
                        selectedTableId={selectedTableId}
                        setSelectedTableId={setSelectedTableId}
                      />
                    ) : null}

                    {step === 5 ? (
                      <PaymentStep
                        amount={amount}
                        setAmount={setAmount}
                        advance={advance}
                        setAdvance={setAdvance}
                        paymentMethod={paymentMethod}
                        setPaymentMethod={setPaymentMethod}
                        paymentStatus={paymentStatus}
                        setPaymentStatus={setPaymentStatus}
                        pendingNumber={pendingNumber}
                      />
                    ) : null}

                    {step === 6 ? (
                      <SummaryStep
                        eventName={eventName}
                        date={date}
                        time={time}
                        guestCount={guestCount}
                        reservationType={reservationType}
                        observations={observations}
                        holderName={holderName}
                        holderLastName={holderLastName}
                        documentValue={documentValue}
                        whatsapp={whatsapp}
                        email={email}
                        preferences={preferences}
                        vip={vip}
                        frequent={frequent}
                        notes={notes}
                        guests={guests}
                        selectedTable={selectedTable}
                        amount={amount}
                        advance={advance}
                        pendingNumber={pendingNumber}
                        paymentMethod={paymentMethod}
                        paymentStatus={paymentStatus}
                      />
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={goPrevious}
                        disabled={step === 1}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Anterior
                      </button>

                      {step < 6 ? (
                        <button
                          type="button"
                          onClick={goNext}
                          className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                        >
                          Siguiente
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onCreateReservation}
                          className="inline-flex h-12 items-center justify-center rounded-[1.25rem] bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                        >
                          Crear reserva
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </main>

              <aside className="border-t border-white/10 bg-slate-950/40 px-5 py-5 sm:px-6 lg:sticky lg:top-0 lg:h-full lg:border-l lg:border-t-0 lg:px-5 lg:py-6">
                <div className="space-y-4">
                  <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                          Resumen en vivo
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-tight text-white">
                          Reserva en construcción
                        </p>
                      </div>
                      <StatusBadge variant="info">Borrador</StatusBadge>
                    </div>

                    <div className="mt-5 space-y-3">
                      {liveSummary.map((item) => (
                        <LiveSummaryRow key={item.label} label={item.label} value={item.value} />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Progreso
                    </p>
                    <div className="mt-4 space-y-4">
                      <div className="rounded-full border border-white/10 bg-white/[0.04] p-1">
                        <div
                          className="h-2 rounded-full bg-white transition-all duration-300"
                          style={{ width: `${Math.max(12, Math.min(100, completion * 100))}%` }}
                        />
                      </div>
                      <div className="grid gap-3">
                        {wizardSteps.map((item) => (
                          <WizardStepChip
                            key={item.step}
                            step={item.step}
                            title={item.title}
                            active={step === item.step}
                            completed={step > item.step}
                            onClick={() => setStep(item.step)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Estado
                    </p>
                    <div className="mt-4 grid gap-3">
                      <LiveSummaryRow label="Estado de pago" value={paymentStatus} />
                      <LiveSummaryRow label="Mesa" value={selectedTable.name} />
                      <LiveSummaryRow
                        label="Invitados"
                        value={`${registeredGuests} / ${guestCount}`}
                      />
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes wizardStepIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes wizardShellIn {
          from {
            opacity: 0;
            transform: scale(0.99);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

function WizardProgress({
  step,
  completion,
}: {
  step: WizardStep;
  completion: number;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Progreso
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Flujo visual con seis etapas de captura.
          </p>
        </div>
        <StatusBadge variant="info">{Math.round(completion * 100)}%</StatusBadge>
      </div>

      <div className="mt-4 rounded-full border border-white/10 bg-white/[0.04] p-1">
        <div
          className="h-2 rounded-full bg-white transition-all duration-300"
          style={{ width: `${Math.max(12, Math.min(100, completion * 100))}%` }}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {wizardSteps.map((item) => (
          <WizardStepChip
            key={item.step}
            step={item.step}
            title={item.title}
            active={step === item.step}
            completed={step > item.step}
            onClick={() => {}}
          />
        ))}
      </div>
    </section>
  );
}

function WizardStepChip({
  step,
  title,
  active,
  completed,
  onClick,
}: {
  step: WizardStep;
  title: string;
  active: boolean;
  completed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
        active
          ? "border-cyan-400/35 bg-cyan-400/10"
          : completed
            ? "border-emerald-400/25 bg-emerald-400/10"
            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
          active
            ? "bg-cyan-400 text-slate-950"
            : completed
              ? "bg-emerald-400 text-slate-950"
              : "bg-white/10 text-slate-300",
        ].join(" ")}
      >
        {step}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Paso
        </p>
        <p className="truncate text-sm font-medium text-white">{title}</p>
      </div>
    </button>
  );
}

function GeneralStep({
  eventName,
  setEventName,
  date,
  setDate,
  time,
  setTime,
  guestCount,
  updateGuestCount,
  reservationType,
  setReservationType,
  observations,
  setObservations,
}: {
  eventName: string;
  setEventName: React.Dispatch<React.SetStateAction<string>>;
  date: string;
  setDate: React.Dispatch<React.SetStateAction<string>>;
  time: string;
  setTime: React.Dispatch<React.SetStateAction<string>>;
  guestCount: number;
  updateGuestCount: (nextCount: number) => void;
  reservationType: ReservationType;
  setReservationType: React.Dispatch<React.SetStateAction<ReservationType>>;
  observations: string;
  setObservations: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Field label="Evento">
          <select
            value={eventName}
            onChange={(event) => setEventName(event.target.value)}
            className={selectClassName}
          >
            {eventOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de reserva">
          <select
            value={reservationType}
            onChange={(event) => setReservationType(event.target.value as ReservationType)}
            className={selectClassName}
          >
            {reservationTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fecha">
          <input value={date} onChange={(event) => setDate(event.target.value)} className={inputClassName} />
        </Field>

        <Field label="Hora">
          <input value={time} onChange={(event) => setTime(event.target.value)} className={inputClassName} />
        </Field>

        <Field label="Cantidad de invitados">
          <input
            type="number"
            min={1}
            max={10}
            value={guestCount}
            onChange={(event) => updateGuestCount(Number(event.target.value))}
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <InfoCard label="Evento" value={eventName} />
        <InfoCard label="Fecha" value={date} />
        <InfoCard label="Hora" value={time} />
      </div>

      <Field label="Observaciones" className="mt-5">
        <textarea
          value={observations}
          onChange={(event) => setObservations(event.target.value)}
          className={textareaClassName}
          rows={6}
          placeholder="Notas de sala, preferencia musical o indicaciones operativas."
        />
      </Field>
    </section>
  );
}

function HolderStep({
  holderName,
  setHolderName,
  holderLastName,
  setHolderLastName,
  documentValue,
  setDocumentValue,
  whatsapp,
  setWhatsapp,
  email,
  setEmail,
  preferences,
  setPreferences,
  vip,
  setVip,
  frequent,
  setFrequent,
  notes,
  setNotes,
}: {
  holderName: string;
  setHolderName: React.Dispatch<React.SetStateAction<string>>;
  holderLastName: string;
  setHolderLastName: React.Dispatch<React.SetStateAction<string>>;
  documentValue: string;
  setDocumentValue: React.Dispatch<React.SetStateAction<string>>;
  whatsapp: string;
  setWhatsapp: React.Dispatch<React.SetStateAction<string>>;
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  preferences: string;
  setPreferences: React.Dispatch<React.SetStateAction<string>>;
  vip: boolean;
  setVip: React.Dispatch<React.SetStateAction<boolean>>;
  frequent: boolean;
  setFrequent: React.Dispatch<React.SetStateAction<boolean>>;
  notes: string;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Field label="Nombre">
          <input
            value={holderName}
            onChange={(event) => setHolderName(event.target.value)}
            className={inputClassName}
            placeholder="Sofía"
          />
        </Field>

        <Field label="Apellido">
          <input
            value={holderLastName}
            onChange={(event) => setHolderLastName(event.target.value)}
            className={inputClassName}
            placeholder="Rivas"
          />
        </Field>

        <Field label="Documento">
          <input
            value={documentValue}
            onChange={(event) => setDocumentValue(event.target.value)}
            className={inputClassName}
            placeholder="1234567"
          />
        </Field>

        <Field label="WhatsApp">
          <input
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            className={inputClassName}
            placeholder="+591 70000011"
          />
        </Field>

        <Field label="Email">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
            placeholder="correo@ejemplo.com"
          />
        </Field>

        <Field label="Preferencias">
          <input
            value={preferences}
            onChange={(event) => setPreferences(event.target.value)}
            className={inputClassName}
            placeholder="Mesa tranquila, sin acceso directo a pista"
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ToggleField
          label="Activar VIP"
          active={vip}
          onToggle={() => setVip((current) => !current)}
        />
        <ToggleField
          label="Cliente frecuente"
          active={frequent}
          onToggle={() => setFrequent((current) => !current)}
        />
      </div>

      <Field label="Notas" className="mt-5">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={textareaClassName}
          rows={6}
          placeholder="Indicaciones internas, contacto alternativo o contexto operativo."
        />
      </Field>
    </section>
  );
}

function GuestsStep({
  guests,
  guestCount,
  registeredGuests,
  pendingGuests,
  addGuest,
  removeGuest,
  updateGuest,
}: {
  guests: GuestDraft[];
  guestCount: number;
  registeredGuests: number;
  pendingGuests: number;
  addGuest: () => void;
  removeGuest: (index: number) => void;
  updateGuest: (
    index: number,
    field: keyof GuestDraft,
    value: string | boolean,
  ) => void;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Invitados
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Lista interactiva simulada con edición individual y estado visual por invitado.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge variant="info">
            {registeredGuests} de {guestCount} invitados registrados
          </StatusBadge>
          <button
            type="button"
            onClick={addGuest}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Agregar invitado
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {guests.map((guest, index) => (
          <article
            key={guest.id}
            className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">
                  Invitado {index + 1}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {index < registeredGuests ? "Registro completado" : "Aún pendiente"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={guest.vip ? "success" : "info"}>
                  {guest.vip ? "VIP" : "General"}
                </StatusBadge>
                <StatusBadge variant="info">{guest.transferBadge}</StatusBadge>
                <button
                  type="button"
                  onClick={() => removeGuest(index)}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white transition hover:bg-white/[0.08]"
                >
                  Eliminar
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-4">
              <Field label="Nombre">
                <input
                  value={guest.name}
                  onChange={(event) => updateGuest(index, "name", event.target.value)}
                  className={inputClassName}
                  placeholder="Nombre y apellido"
                />
              </Field>

              <Field label="WhatsApp">
                <input
                  value={guest.whatsapp}
                  onChange={(event) => updateGuest(index, "whatsapp", event.target.value)}
                  className={inputClassName}
                  placeholder="+591 70000000"
                />
              </Field>

              <Field label="Documento">
                <input
                  value={guest.document}
                  onChange={(event) => updateGuest(index, "document", event.target.value)}
                  className={inputClassName}
                  placeholder="Documento"
                />
              </Field>

              <Field label="Estado de invitación">
                <select
                  value={guest.invitationState}
                  onChange={(event) =>
                    updateGuest(index, "invitationState", event.target.value)
                  }
                  className={selectClassName}
                >
                  {["Pendiente", "Lista", "Enviada", "Transferida"].map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-slate-300">
          <span className="font-medium text-white">{registeredGuests}</span> de{" "}
          <span className="font-medium text-white">{guestCount}</span> invitados registrados ·{" "}
          <span className="font-medium text-white">{pendingGuests}</span> pendientes
        </p>
      </div>
    </section>
  );
}

function TableStep({
  selectedTableId,
  setSelectedTableId,
}: {
  selectedTableId: string;
  setSelectedTableId: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Mesa
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Selecciona una mesa o zona con tarjetas visuales.
          </p>
        </div>
        <StatusBadge variant="info">Selector visual</StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {tableOptions.map((table) => {
          const selected = table.id === selectedTableId;

          return (
            <button
              key={table.id}
              type="button"
              onClick={() => setSelectedTableId(table.id)}
              className={[
                "rounded-[1.5rem] border p-5 text-left transition hover:-translate-y-0.5",
                selected
                  ? "border-cyan-400/35 bg-cyan-400/10 shadow-[0_20px_60px_rgba(0,0,0,0.24)]"
                  : "border-white/10 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/55",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold tracking-tight text-white">{table.name}</p>
                  <p className="mt-1 text-sm text-slate-400">{table.location}</p>
                </div>
                <StatusBadge variant={table.tone}>
                  {table.status}
                </StatusBadge>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailBadge label="Capacidad" value={`${table.capacity} personas`} />
                <DetailBadge label="Ubicación" value={table.location} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {table.recommended ? <StatusBadge variant="success">Recomendada</StatusBadge> : null}
                <StatusBadge variant={selected ? "info" : "warning"}>
                  {selected ? "Seleccionada" : "Disponible"}
                </StatusBadge>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PaymentStep({
  amount,
  setAmount,
  advance,
  setAdvance,
  paymentMethod,
  setPaymentMethod,
  paymentStatus,
  setPaymentStatus,
  pendingNumber,
}: {
  amount: string;
  setAmount: React.Dispatch<React.SetStateAction<string>>;
  advance: string;
  setAdvance: React.Dispatch<React.SetStateAction<string>>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: React.Dispatch<React.SetStateAction<PaymentMethod>>;
  paymentStatus: PaymentStatus;
  setPaymentStatus: React.Dispatch<React.SetStateAction<PaymentStatus>>;
  pendingNumber: number;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Field label="Monto de la reserva">
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputClassName}
            placeholder="850"
          />
        </Field>

        <Field label="Adelanto">
          <input
            type="number"
            value={advance}
            onChange={(event) => setAdvance(event.target.value)}
            className={inputClassName}
            placeholder="300"
          />
        </Field>

        <Field label="Pendiente">
          <input value={formatCurrency(String(pendingNumber))} readOnly className={inputClassName} />
        </Field>

        <Field label="Método de pago">
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
            className={selectClassName}
          >
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-200">Estado</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {paymentStatuses.map((status) => {
            const selected = paymentStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setPaymentStatus(status)}
                className={[
                  "rounded-[1.35rem] border px-4 py-4 text-left transition",
                  selected
                    ? "border-cyan-400/35 bg-cyan-400/10"
                    : "border-white/10 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/55",
                ].join(" ")}
              >
                <p className="text-sm font-semibold text-white">{status}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {status === "Pendiente"
                    ? "Pago aún no registrado"
                    : status === "Parcial"
                      ? "Cobro parcial capturado"
                      : "Reserva financiada"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Historial de pagos simulados
        </p>
        <div className="mt-4 space-y-3">
          {paymentHistory.map((entry) => (
            <div
              key={`${entry.time}-${entry.title}`}
              className={[
                "rounded-2xl border px-4 py-3",
                paymentHistoryStyle(entry.tone),
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{entry.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{entry.detail}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {entry.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  function paymentHistoryStyle(tone: PaymentHistoryEntry["tone"]) {
    if (tone === "success") {
      return "border-emerald-400/20 bg-emerald-400/10";
    }

    if (tone === "warning") {
      return "border-amber-400/20 bg-amber-400/10";
    }

    return "border-cyan-400/20 bg-cyan-400/10";
  }
}

function SummaryStep({
  eventName,
  date,
  time,
  guestCount,
  reservationType,
  observations,
  holderName,
  holderLastName,
  documentValue,
  whatsapp,
  email,
  preferences,
  vip,
  frequent,
  notes,
  guests,
  selectedTable,
  amount,
  advance,
  pendingNumber,
  paymentMethod,
  paymentStatus,
}: {
  eventName: string;
  date: string;
  time: string;
  guestCount: number;
  reservationType: ReservationType;
  observations: string;
  holderName: string;
  holderLastName: string;
  documentValue: string;
  whatsapp: string;
  email: string;
  preferences: string;
  vip: boolean;
  frequent: boolean;
  notes: string;
  guests: GuestDraft[];
  selectedTable: TableOption;
  amount: string;
  advance: string;
  pendingNumber: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}) {
  const summaryCards = [
    {
      title: "General",
      rows: [
        ["Evento", eventName],
        ["Fecha", date],
        ["Hora", time],
        ["Tipo", reservationType],
        ["Observaciones", observations || "Sin observaciones"],
      ],
    },
    {
      title: "Titular",
      rows: [
        ["Nombre", `${holderName} ${holderLastName}`.trim()],
        ["Documento", documentValue],
        ["WhatsApp", whatsapp],
        ["Email", email],
        ["Preferencias", preferences || "Sin preferencias"],
      ],
    },
    {
      title: "Invitados",
      rows: [
        ["Cantidad", `${guestCount}`],
        ["Registrados", `${guests.filter((guest) => guest.name.trim()).length}`],
        ["VIP", vip ? "Sí" : "No"],
        ["Frecuente", frequent ? "Sí" : "No"],
        ["Notas", notes || "Sin notas"],
      ],
    },
    {
      title: "Mesa",
      rows: [
        ["Mesa", selectedTable.name],
        ["Ubicación", selectedTable.location],
        ["Capacidad", `${selectedTable.capacity}`],
        ["Estado", selectedTable.status],
      ],
    },
    {
      title: "Pagos",
      rows: [
        ["Monto", formatCurrency(amount)],
        ["Adelanto", formatCurrency(advance)],
        ["Pendiente", formatCurrency(String(pendingNumber))],
        ["Método", paymentMethod],
        ["Estado", paymentStatus],
      ],
    },
  ];

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-400/10 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200">
          Confirmación premium
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Reserva lista para crear.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Todo está agrupado por contexto operativo. El botón final es visual y no
          persiste nada.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        {summaryCards.map((section) => (
          <div
            key={section.title}
            className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              {section.title}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.rows.map(([label, value]) => (
                <DetailBadge key={label} label={label} value={value} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={["block", className].filter(Boolean).join(" ")}>
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ToggleField({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "flex items-center justify-between rounded-[1.5rem] border px-4 py-4 text-left transition",
        active
          ? "border-cyan-400/35 bg-cyan-400/10"
          : "border-white/10 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/55",
      ].join(" ")}
    >
      <span className="text-sm font-medium text-white">{label}</span>
      <span
        className={[
          "inline-flex h-6 w-10 items-center rounded-full border p-1 transition",
          active
            ? "border-cyan-400/40 bg-cyan-400/20"
            : "border-white/10 bg-white/[0.04]",
        ].join(" ")}
      >
        <span
          className={[
            "h-4 w-4 rounded-full transition",
            active ? "translate-x-4 bg-cyan-100" : "translate-x-0 bg-slate-400",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function LiveSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function DetailBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

const inputClassName =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-cyan-500/10";

const selectClassName = `${inputClassName} h-12`;

const textareaClassName =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-cyan-500/10";
