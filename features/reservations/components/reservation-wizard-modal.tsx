"use client";

import type { Dispatch, SetStateAction } from "react";

import StatusBadge from "@/components/status-badge";
import { formatCurrency } from "@/utils/currency";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import { formatTableStatus } from "@/features/tables/domain/table-domain";
import type { TableSummary } from "@/features/tables/types";
import { reservationPaymentHistory } from "@/features/reservations/domain/reservation-presets";
import type {
  GuestDraft,
  PaymentHistoryEntry,
  PaymentMethod,
  PaymentStatus,
  ReservationCreationInput,
  ReservationRecord,
  ReservationType,
  ReservationUpdateInput,
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
    title: "Recurso",
    subtitle: "Selección visual de recurso físico recomendado.",
  },
  {
    step: 5,
    title: "Pago",
    subtitle: "Monto, adelanto y estado de cobro simulado.",
  },
  {
    step: 6,
    title: "Resumen",
    subtitle: "Vista final antes de confirmar la reserva.",
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
  notes,
  setNotes,
  guests,
  addGuest,
  removeGuest,
  updateGuest,
  selectedResource,
  selectedResourceSummary,
  selectedActiveReservation,
  selectedReservationConflictCount,
  wizardMode,
  selectedResourceId,
  setSelectedResourceId,
  resourceOptions,
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
  isSubmitting,
  submissionActionLabel,
  submissionError,
  onCreateReservation,
  onUpdateReservation,
  onAddManillas,
  eventOptions,
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
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  guests: GuestDraft[];
  addGuest: () => void;
  removeGuest: (index: number) => void;
  updateGuest: (index: number, field: keyof GuestDraft, value: string | boolean) => void;
  selectedResource: TableOption | null;
  selectedResourceSummary: TableSummary | null;
  selectedActiveReservation: ReservationRecord | null;
  selectedReservationConflictCount: number;
  wizardMode: "create" | "edit" | "append";
  selectedResourceId: string;
  setSelectedResourceId: Dispatch<SetStateAction<string>>;
  resourceOptions: TableOption[];
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
  isSubmitting: boolean;
  submissionActionLabel: string;
  submissionError: string | null;
  onCreateReservation: (input: Omit<ReservationCreationInput, "eventId">) => Promise<void>;
  onUpdateReservation: (input: Omit<ReservationUpdateInput, "eventId">) => Promise<void>;
  onAddManillas: (input: Omit<ReservationCreationInput, "eventId">) => Promise<void>;
  eventOptions: string[];
}) {
  const currentStep = wizardSteps.find((item) => item.step === step) ?? wizardSteps[0];
  const isCreateMode = wizardMode === "create";
  const modeLabel =
    wizardMode === "edit" ? "Editar reserva" : wizardMode === "append" ? "Agregar manillas" : "Crear reserva";

  const liveSummary = [
    { label: "Código", value: "RES-0108-DB" },
    { label: "Invitados", value: `${guestCount}` },
    { label: "Recurso", value: selectedResource?.name ?? "Sin recurso" },
    { label: "Monto", value: formatCurrency(amount) },
    { label: "Pago", value: paymentStatus },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={closeWizard}
        disabled={isSubmitting}
        className="absolute inset-0"
      />

      <div className="relative mx-auto flex h-full w-full max-w-[1700px] items-stretch p-0 lg:p-4">
        <div
          className="relative flex h-full w-full flex-col overflow-hidden surface-panel bg-[#0b0f14]"
          aria-busy={isSubmitting}
          style={{ animation: "wizardShellIn 220ms ease" }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="kicker">{modeLabel}</p>
                <StatusBadge variant="info">{isCreateMode ? "Borrador" : wizardMode === "edit" ? "Edición" : "Manillas"}</StatusBadge>
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
                disabled={isSubmitting}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
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
                        eventOptions={eventOptions}
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
                        wizardMode={wizardMode}
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
                        notes={notes}
                        setNotes={setNotes}
                      />
                    ) : null}

                    {step === 3 ? (
                      <GuestsStep
                        wizardMode={wizardMode}
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
                        selectedResourceId={selectedResourceId}
                        setSelectedResourceId={setSelectedResourceId}
                        resourceOptions={resourceOptions}
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
                        wizardMode={wizardMode}
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
                        selectedResource={selectedResource}
                        selectedResourceSummary={selectedResourceSummary}
                        selectedActiveReservation={selectedActiveReservation}
                        selectedReservationConflictCount={selectedReservationConflictCount}
                        amount={amount}
                        advance={advance}
                        pendingNumber={pendingNumber}
                        paymentMethod={paymentMethod}
                        paymentStatus={paymentStatus}
                      />
                    ) : null}

                    {submissionError ? (
                      <div className="surface-alert px-4 py-3 text-sm leading-6 text-red-50">
                        {submissionError}
                      </div>
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
                          onClick={() => {
                            if (isSubmitting) {
                              return;
                            }

                            const payload = {
                              eventName,
                              date,
                              time,
                              reservationType,
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
                              selectedResource: selectedResource ?? undefined,
                              amount,
                              advance,
                              paymentMethod,
                              paymentStatus,
                              observations,
                            };
                            const isAppendFlow = wizardMode === "append" || (wizardMode === "create" && Boolean(selectedActiveReservation));

                            void (
                              wizardMode === "edit"
                                ? onUpdateReservation({ ...payload, reservationId: selectedActiveReservation?.id ?? "" })
                                : isAppendFlow
                                    ? onAddManillas(payload)
                                    : onCreateReservation(payload)
                            );
                          }}
                          disabled={isSubmitting}
                          className="inline-flex h-12 items-center justify-center rounded-[1.25rem] bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSubmitting
                            ? submissionActionLabel
                            : wizardMode === "edit"
                            ? "Guardar cambios"
                            : wizardMode === "append" || selectedActiveReservation
                              ? "Agregar manillas"
                              : "Crear reserva"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </main>

              <aside className="border-t border-white/10 bg-slate-950/40 px-5 py-5 sm:px-6 lg:sticky lg:top-0 lg:h-full lg:border-l lg:border-t-0 lg:px-5 lg:py-6">
                <div className="space-y-4">
                  <div className="surface-panel p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="kicker">
                          Resumen en vivo
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-tight text-white">
                          Reserva en construcción
                        </p>
                      </div>
                      <StatusBadge variant="info">Borrador</StatusBadge>
                    </div>

                    <div className="mt-4 space-y-3">
                      {liveSummary.map((item) => (
                        <LiveSummaryRow key={item.label} label={item.label} value={item.value} />
                      ))}
                    </div>
                  </div>

                  <div className="surface-elevated p-4 sm:p-5">
                    <p className="kicker">
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

                  <div className="surface-panel p-4 sm:p-5">
                    <p className="kicker">
                      Estado
                    </p>
                    <div className="mt-4 grid gap-3">
                      <LiveSummaryRow label="Estado de pago" value={paymentStatus} />
                      <LiveSummaryRow label="Recurso" value={selectedResource?.name ?? "Sin recurso"} />
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
    <section className="surface-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker">
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
  eventOptions,
}: {
  eventName: string;
  setEventName: Dispatch<SetStateAction<string>>;
  eventOptions: string[];
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
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
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

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
  wizardMode,
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
  notes,
  setNotes,
}: {
  wizardMode: "create" | "edit" | "append";
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
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
}) {
  const showDecorativeSignals = wizardMode !== "create";

  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Field label="Nombre del titular">
          <input
            value={holderName}
            onChange={(event) => setHolderName(event.target.value)}
            className={inputClassName}
            placeholder="Nombre del titular"
          />
        </Field>

        <Field label="Apellido del titular">
          <input
            value={holderLastName}
            onChange={(event) => setHolderLastName(event.target.value)}
            className={inputClassName}
            placeholder="Apellido del titular"
          />
        </Field>

        <Field label="Documento del titular">
          <input
            value={documentValue}
            onChange={(event) => setDocumentValue(event.target.value)}
            className={inputClassName}
            placeholder="Documento del titular"
          />
        </Field>

        <Field label="WhatsApp del titular">
          <input
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            className={inputClassName}
            placeholder="+591 70000011"
          />
        </Field>

        <Field label="Email del titular">
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

      {showDecorativeSignals ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <ToggleField
            label="Marca VIP"
            active={vip}
            onToggle={() => setVip((current) => !current)}
          />
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Cliente frecuente
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">
                {frequent ? "Sí, por historial" : "No detectado en historial"}
              </p>
              <StatusBadge variant={frequent ? "success" : "info"}>{frequent ? "Derivado" : "Nuevo"}</StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Calculado automáticamente desde reservas y asistencias previas; no se edita manualmente.
            </p>
          </div>
        </div>
      ) : null}

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
  wizardMode,
  guests,
  guestCount,
  registeredGuests,
  pendingGuests,
  addGuest,
  removeGuest,
  updateGuest,
}: {
  wizardMode: "create" | "edit" | "append";
  guests: GuestDraft[];
  guestCount: number;
  registeredGuests: number;
  pendingGuests: number;
  addGuest: () => void;
  removeGuest: (index: number) => void;
  updateGuest: (index: number, field: keyof GuestDraft, value: string | boolean) => void;
}) {
  return (
    <section className="surface-panel p-4 sm:p-5">
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

      <div className="mt-4 grid gap-4">
        {guests.map((guest, index) => (
          <article
            key={guest.id}
            className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">
                  {index === 0 ? "Titular" : `Invitado ${index + 1}`}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {index === 0
                    ? "Sincronizado con el titular de la reserva"
                    : index < registeredGuests
                      ? "Registro completado"
                      : "Aún pendiente"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={guest.vip ? "success" : "info"}>
                  {guest.vip ? "VIP" : "General"}
                </StatusBadge>
                <StatusBadge variant="info">{guest.transferBadge}</StatusBadge>
                {wizardMode === "create" && index === 0 ? null : (
                  <button
                    type="button"
                    onClick={() => removeGuest(index)}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white transition hover:bg-white/[0.08]"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-4">
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

      <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
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
  selectedResourceId,
  setSelectedResourceId,
  resourceOptions,
}: {
  selectedResourceId: string;
  setSelectedResourceId: Dispatch<SetStateAction<string>>;
  resourceOptions: TableOption[];
}) {
  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Recurso
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Selecciona un recurso físico con tarjetas visuales.
          </p>
        </div>
        <StatusBadge variant="info">Selector visual</StatusBadge>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {resourceOptions.map((table) => {
          const selected = table.id === selectedResourceId;
          const assignedGuests = table.assignedGuests ?? 0;
          const overCapacity = table.overCapacity ?? Math.max(assignedGuests - table.capacity, 0);
          const hasReservation = (table.activeReservations ?? 0) > 0;

          return (
            <button
              key={table.id}
              type="button"
              onClick={() => setSelectedResourceId(table.id)}
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
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge variant={table.tone}>{formatTableStatus(table.status)}</StatusBadge>
                  {hasReservation ? (
                    <StatusBadge
                      variant={
                        table.status === "Over Capacity"
                          ? "danger"
                          : table.status === "Full" || table.status === "Partially Occupied"
                            ? "warning"
                            : "info"
                      }
                    >
                      {table.status === "Over Capacity"
                        ? "Sobrecapacidad"
                        : table.status === "Full" || table.status === "Partially Occupied"
                          ? "Ocupada"
                          : "Reserva activa"}
                    </StatusBadge>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailBadge label="Capacidad" value={`${table.capacity} personas`} />
                <DetailBadge label="Sector" value={table.location} />
                <DetailBadge label="Ocupación" value={`${assignedGuests}/${table.capacity}`} />
                <DetailBadge label="Estado real" value={hasReservation ? formatTableStatus(table.status) : "Disponible"} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {table.recommended ? <StatusBadge variant="success">Recomendado</StatusBadge> : null}
                {selected ? <StatusBadge variant="info">Seleccionada</StatusBadge> : null}
                {overCapacity > 0 ? <StatusBadge variant="danger">Sobrecapacidad +{overCapacity}</StatusBadge> : null}
              </div>
              {hasReservation ? (
                <p className="mt-3 text-sm text-amber-100">
                  Esta mesa ya tiene una reserva activa.
                </p>
              ) : null}
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
    <section className="surface-panel p-4 sm:p-5">
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
            readOnly={paymentStatus === "Pagado"}
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

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <LiveSummaryRow label="Monto" value={formatCurrency(amount)} />
        <LiveSummaryRow label="Adelanto" value={formatCurrency(advance)} />
        <LiveSummaryRow label="Pendiente" value={formatCurrency(String(pendingNumber))} />
        <LiveSummaryRow label="Método" value={paymentMethod} />
        <LiveSummaryRow label="Estado" value={paymentStatus} />
      </div>

      <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Estado de pago</p>
            {paymentStatus === "Pagado" ? (
              <p className="mt-2 text-sm text-slate-400">
                Cuando la reserva queda pagada, el adelanto sigue automáticamente el monto total.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                Puedes ajustar el adelanto manualmente mientras el estado no sea Pagado.
              </p>
            )}
          </div>
          <StatusBadge variant={paymentStatus === "Pagado" ? "success" : paymentStatus === "Parcial" ? "warning" : "info"}>
            {paymentStatus}
          </StatusBadge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
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

      <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Historial de pagos simulados
        </p>
        <div className="mt-3 space-y-2">
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
  wizardMode,
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
  selectedResource,
  selectedResourceSummary,
  selectedActiveReservation,
  selectedReservationConflictCount,
  amount,
  advance,
  pendingNumber,
  paymentMethod,
  paymentStatus,
}: {
  wizardMode: "create" | "edit" | "append";
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
  selectedResource: TableOption | null;
  selectedResourceSummary: TableSummary | null;
  selectedActiveReservation: ReservationRecord | null;
  selectedReservationConflictCount: number;
  amount: string;
  advance: string;
  pendingNumber: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}) {
  const showDecorativeSignals = wizardMode !== "create";
  const invitationRows: Array<[string, string]> = [
    ["Cantidad", `${guestCount}`],
    ["Registrados", `${guests.filter((guest) => guest.name.trim()).length}`],
  ];

  if (showDecorativeSignals) {
    invitationRows.push(["VIP", vip ? "Sí" : "No"], ["Historial frecuente", frequent ? "Sí" : "No"]);
  }

  invitationRows.push(["Notas", notes || "Sin notas"]);

  const summaryCards: Array<{ title: string; rows: Array<[string, string]> }> = [
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
      rows: invitationRows,
    },
    {
      title: "Recurso",
      rows: [
        ["Recurso", selectedResource?.name ?? "Sin recurso"],
        ["Sector", selectedResource?.location ?? "Sin sector"],
        ["Capacidad", `${selectedResource?.capacity ?? 0}`],
        ["Estado", selectedResource ? formatTableStatus(selectedResource.status) : "Sin estado"],
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
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-400/10 p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200">
          Confirmación premium
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          {wizardMode === "edit" ? "Reserva lista para guardar." : "Reserva lista para crear."}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Todo está agrupado por contexto operativo. El botón final registra los cambios en
          el estado compartido.
        </p>
      </div>

      {selectedActiveReservation && wizardMode === "create" ? (
        <div className="mt-4 rounded-[1.5rem] border border-amber-400/20 bg-amber-400/10 p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-100">
            Mesa con reserva activa
          </p>
          <h4 className="mt-2 text-lg font-semibold text-white">
            Esta mesa ya tiene una reserva activa.
          </h4>
          <p className="mt-2 text-sm leading-6 text-amber-50/90">
            Se reutilizará la reserva <span className="font-semibold text-white">{selectedActiveReservation.name}</span>.
            {selectedReservationConflictCount > 1 ? (
              <>
                {" "}
                Conflicto histórico detectado: hay {selectedReservationConflictCount} reservas activas asociadas a esta mesa.
              </>
            ) : null}
          </p>
          <p className="mt-2 text-sm text-amber-50/90">
            Se agregarán <span className="font-semibold text-white">{guestCount}</span> manillas a la reserva existente.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <DetailBadge
              label="Invitados actuales"
              value={`${selectedResourceSummary?.metrics.assignedGuests ?? selectedActiveReservation.guestIds.length}`}
            />
            <DetailBadge label="Capacidad" value={`${selectedResource?.capacity ?? 0}`} />
            <DetailBadge
              label="Sobrecapacidad"
              value={`+${Math.max(
                (selectedResourceSummary?.metrics.assignedGuests ?? selectedActiveReservation.guestIds.length) -
                  (selectedResource?.capacity ?? 0),
                0,
              )}`}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {summaryCards.map((section) => (
          <div
            key={section.title}
            className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              {section.title}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
