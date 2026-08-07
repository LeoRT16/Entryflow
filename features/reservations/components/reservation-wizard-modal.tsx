"use client";

import type { Dispatch, SetStateAction } from "react";

import StatusBadge from "@/components/status-badge";
import { formatCurrency } from "@/utils/currency";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import {
  reservationEventOptions,
  reservationPaymentHistory,
  reservationTableOptions,
} from "@/features/reservations/mock/reservations";
import type {
  GuestDraft,
  PaymentHistoryEntry,
  PaymentMethod,
  PaymentStatus,
  ReservationType,
  TableOption,
  WizardStep,
} from "@/features/reservations/types";

export const wizardSteps: Array<{ step: WizardStep; title: string; subtitle: string }> = [
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

export default function ReservationWizardModal({
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
  setStep: Dispatch<SetStateAction<WizardStep>>;
  goNext: () => void;
  goPrevious: () => void;
  closeWizard: () => void;
  eventName: string;
  setEventName: Dispatch<SetStateAction<string>>;
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  time: string;
  setTime: Dispatch<SetStateAction<string>>;
  guestCount: number;
  updateGuestCount: (nextCount: number) => void;
  reservationType: ReservationType;
  setReservationType: Dispatch<SetStateAction<ReservationType>>;
  observations: string;
  setObservations: Dispatch<SetStateAction<string>>;
  holderName: string;
  setHolderName: Dispatch<SetStateAction<string>>;
  holderLastName: string;
  setHolderLastName: Dispatch<SetStateAction<string>>;
  documentValue: string;
  setDocumentValue: Dispatch<SetStateAction<string>>;
  whatsapp: string;
  setWhatsapp: Dispatch<SetStateAction<string>>;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  preferences: string;
  setPreferences: Dispatch<SetStateAction<string>>;
  vip: boolean;
  setVip: Dispatch<SetStateAction<boolean>>;
  frequent: boolean;
  setFrequent: Dispatch<SetStateAction<boolean>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  guests: GuestDraft[];
  addGuest: () => void;
  removeGuest: (index: number) => void;
  updateGuest: (index: number, field: keyof GuestDraft, value: string | boolean) => void;
  selectedTable: TableOption;
  selectedTableId: string;
  setSelectedTableId: Dispatch<SetStateAction<string>>;
  amount: string;
  setAmount: Dispatch<SetStateAction<string>>;
  advance: string;
  setAdvance: Dispatch<SetStateAction<string>>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: Dispatch<SetStateAction<PaymentMethod>>;
  paymentStatus: PaymentStatus;
  setPaymentStatus: Dispatch<SetStateAction<PaymentStatus>>;
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
  setEventName: Dispatch<SetStateAction<string>>;
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  time: string;
  setTime: Dispatch<SetStateAction<string>>;
  guestCount: number;
  updateGuestCount: (nextCount: number) => void;
  reservationType: ReservationType;
  setReservationType: Dispatch<SetStateAction<ReservationType>>;
  observations: string;
  setObservations: Dispatch<SetStateAction<string>>;
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
            {reservationEventOptions.map((option) => (
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
  setHolderName: Dispatch<SetStateAction<string>>;
  holderLastName: string;
  setHolderLastName: Dispatch<SetStateAction<string>>;
  documentValue: string;
  setDocumentValue: Dispatch<SetStateAction<string>>;
  whatsapp: string;
  setWhatsapp: Dispatch<SetStateAction<string>>;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  preferences: string;
  setPreferences: Dispatch<SetStateAction<string>>;
  vip: boolean;
  setVip: Dispatch<SetStateAction<boolean>>;
  frequent: boolean;
  setFrequent: Dispatch<SetStateAction<boolean>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
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
        <ToggleField label="Activar VIP" active={vip} onToggle={() => setVip((current) => !current)} />
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
  updateGuest: (index: number, field: keyof GuestDraft, value: string | boolean) => void;
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
  setSelectedTableId: Dispatch<SetStateAction<string>>;
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
            {reservationTableOptions.map((table) => {
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
                <StatusBadge variant={table.tone}>{table.status}</StatusBadge>
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
  setAmount: Dispatch<SetStateAction<string>>;
  advance: string;
  setAdvance: Dispatch<SetStateAction<string>>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: Dispatch<SetStateAction<PaymentMethod>>;
  paymentStatus: PaymentStatus;
  setPaymentStatus: Dispatch<SetStateAction<PaymentStatus>>;
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
          {reservationPaymentHistory.map((entry) => (
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
