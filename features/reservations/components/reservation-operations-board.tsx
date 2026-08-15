"use client";

import { useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import {
  formatReservationStatus,
  getReservationStatusTone,
  isTerminalReservationStatus,
} from "@/features/reservations/domain/reservation-domain";
import type {
  ReservationGuestAction,
  ReservationGuestInput,
  ReservationSummary,
} from "@/features/reservations/types";

type ReservationOperationsBoardProps = {
  reservations: ReservationSummary[];
  activeReservationId: string;
  isTerminalEvent?: boolean;
  onSelectReservation: (reservationId: string) => void;
  onMarkConfirmed: (reservationId: string) => void;
  onAddGuest: (reservationId: string, guest: ReservationGuestInput) => void;
  onGuestAction: (params: {
    reservationId: string;
    guestId: string;
    action: ReservationGuestAction;
  }) => void;
  onRegisterCheckIn: (reservationId: string, guestId: string) => void;
};

export function getReservationGuestActionVisibility(
  reservationStatus: ReservationSummary["status"],
  guest: ReservationSummary["guests"][number],
  eventTerminal = false,
) {
  const terminal = eventTerminal || isTerminalReservationStatus(reservationStatus);

  return {
    terminal,
    showConfirm: !terminal && guest.canConfirm,
    showCheckIn: !terminal && guest.canCheckIn,
    showRevert: !terminal && guest.canRevert,
    showCancel: !terminal && guest.canCancel,
    showRemove: !terminal && guest.canRemove,
  };
}

export default function ReservationOperationsBoard({
  reservations,
  activeReservationId,
  onSelectReservation,
  onMarkConfirmed,
  onAddGuest,
  onGuestAction,
  onRegisterCheckIn,
  isTerminalEvent = false,
}: ReservationOperationsBoardProps) {
  const { showToast } = useFeedback();
  const [query, setQuery] = useState("");
  const [isAddGuestFormOpen, setIsAddGuestFormOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestDocument, setGuestDocument] = useState("");
  const [guestWhatsapp, setGuestWhatsapp] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const visibleReservations = useMemo(() => {
    if (!normalizedQuery) {
      return reservations;
    }

    return reservations.filter((reservation) =>
      [reservation.name, reservation.code, reservation.eventName, reservation.tableName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, reservations]);

  const activeReservation =
    visibleReservations.find((reservation) => reservation.id === activeReservationId) ??
    visibleReservations[0] ??
    null;
  const isTerminalReservation = activeReservation
    ? isTerminalEvent || isTerminalReservationStatus(activeReservation.status)
    : false;

  const resetGuestForm = () => {
    setGuestName("");
    setGuestDocument("");
    setGuestWhatsapp("");
  };

  const handleSelectReservation = (reservationId: string) => {
    onSelectReservation(reservationId);
    setIsAddGuestFormOpen(false);
    resetGuestForm();
  };

  const handleAddGuest = () => {
    if (!activeReservation || isTerminalReservation) {
      return;
    }

    if (!guestName.trim()) {
      showToast({
        title: "Ingresa un nombre",
        description: "Necesitamos al menos el nombre del invitado para crear la invitación.",
        tone: "warning",
      });
      return;
    }

    onAddGuest(activeReservation.id, {
      guestName,
      carnet: guestDocument,
      whatsapp: guestWhatsapp,
    });

    setIsAddGuestFormOpen(false);
    resetGuestForm();
  };

  if (!reservations.length) {
    return (
      <section className="surface-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker">Reservas operativas</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              No hay reservas para operar.
            </h2>
          </div>
          <StatusBadge variant="info">0</StatusBadge>
        </div>
      </section>
    );
  }

  if (!activeReservation) {
    return (
      <section className="grid min-w-0 gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="surface-panel min-w-0 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="kicker">Reservas activas</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Selecciona una reserva para operar.
              </h2>
            </div>
            <StatusBadge variant="info">{visibleReservations.length}</StatusBadge>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            No hay coincidencias con la búsqueda actual.
          </div>
        </div>

        <section className="surface-panel min-w-0 p-5">
          <p className="kicker">Detalle de reserva</p>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            Selecciona una reserva visible para ver su detalle operativo.
          </div>
        </section>
      </section>
    );
  }

  const canConfirmReservation = activeReservation.status === "Draft" || activeReservation.status === "Pending";

  return (
    <section className="grid min-w-0 gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="surface-panel min-w-0 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker">Reservas activas</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Selecciona una reserva para operar.
            </h2>
          </div>
          <StatusBadge variant="info">{visibleReservations.length}</StatusBadge>
        </div>

        <div className="mt-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, código, mesa o evento"
            className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
          />
        </div>

        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
          Mostrando {visibleReservations.length} de {reservations.length}
        </p>

        <div className="mt-4 space-y-3">
          {visibleReservations.map((reservation) => {
            const isActive = reservation.id === activeReservation.id;

            return (
              <button
                key={reservation.id}
                type="button"
                onClick={() => handleSelectReservation(reservation.id)}
                className={[
                  "w-full rounded-[1.35rem] border p-4 text-left transition",
                  isActive
                    ? "border-cyan-400/30 bg-cyan-400/10"
                    : "border-white/10 bg-slate-950/40 hover:bg-slate-950/55",
                ].join(" ")}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-white">{reservation.name}</p>
                    <p
                      className="mt-1 break-words text-xs uppercase tracking-[0.22em] text-slate-500"
                      title={`${reservation.code} · ${reservation.eventName}`}
                    >
                      {reservation.code} · {reservation.eventName}
                    </p>
                  </div>
                  <StatusBadge variant={getReservationStatusTone(reservation.status)}>
                    {formatReservationStatus(reservation.status)}
                  </StatusBadge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300">
                  <span className="max-w-full break-words rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 normal-case tracking-normal">
                    Mesa {reservation.tableName}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Invitados {reservation.metrics.guestCount}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Ingresados {reservation.metrics.checkedInGuests}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Pendientes {reservation.metrics.pendingGuests}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <section className="surface-panel min-w-0 space-y-5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="kicker">Detalle de reserva</p>
            <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight text-white">
              {activeReservation.tableName} · {activeReservation.eventName}
            </h2>
            <p className="mt-2 break-words text-sm text-slate-400">
              {activeReservation.code} · {activeReservation.name}
            </p>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <StatusBadge variant={getReservationStatusTone(activeReservation.status)}>
              {formatReservationStatus(activeReservation.status)}
            </StatusBadge>
            {canConfirmReservation ? (
              <button
                type="button"
                onClick={() => onMarkConfirmed(activeReservation.id)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
              >
                Marcar confirmado
              </button>
            ) : isTerminalReservation ? (
              <span className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-slate-400">
                Reserva terminal
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReservationInfoRow label="Fecha" value={activeReservation.date} />
          <ReservationInfoRow label="Hora" value={activeReservation.time} />
          <ReservationInfoRow label="Mesa / espacio" value={activeReservation.tableName} />
          <ReservationInfoRow label="Pago" value={activeReservation.paymentStatus} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReservationInfoRow label="Invitados" value={`${activeReservation.metrics.guestCount}`} />
          <ReservationInfoRow label="Ingresados" value={`${activeReservation.metrics.checkedInGuests}`} />
          <ReservationInfoRow label="Pendientes" value={`${activeReservation.metrics.pendingGuests}`} />
          <ReservationInfoRow label="Capacidad restante" value={`${activeReservation.metrics.capacityRemaining}`} />
        </div>

        <section className="surface-elevated min-w-0 p-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="kicker">Invitados ({activeReservation.guests.length})</p>
              <p className="mt-2 break-words text-sm text-slate-400">
                Estado individual y acciones
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddGuestFormOpen((current) => !current)}
              disabled={isTerminalReservation}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Agregar invitado
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {activeReservation.guests.length ? (
              activeReservation.guests.map((guest) => (
                <ReservationGuestRow
                  key={guest.id}
                  reservationStatus={activeReservation.status}
                  guest={guest}
                  eventTerminal={isTerminalEvent}
                  onConfirm={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "confirm" });
                  }}
                  onCancel={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "cancel" });
                  }}
                  onCheckIn={() => {
                    onRegisterCheckIn(activeReservation.id, guest.id);
                  }}
                  onRevert={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "revert" });
                  }}
                  onRemove={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "remove" });
                  }}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                Todavía no hay invitados cargados en esta reserva.
              </div>
            )}
          </div>

          {isAddGuestFormOpen ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.95fr)_auto]">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Nombre del invitado"
                  className="h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
                <input
                  value={guestDocument}
                  onChange={(event) => setGuestDocument(event.target.value)}
                  placeholder="Carnet"
                  className="h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
                <input
                  value={guestWhatsapp}
                  onChange={(event) => setGuestWhatsapp(event.target.value)}
                  placeholder="WhatsApp"
                  className="h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
                <div className="flex min-w-0 flex-wrap gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddGuestFormOpen(false);
                      resetGuestForm();
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAddGuest}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                  >
                    Agregar invitado
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <details className="surface-elevated min-w-0 p-4">
          <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="kicker">Timeline</p>
              <h3 className="mt-2 break-words text-lg font-semibold tracking-tight text-white">
                Línea de tiempo operativa
              </h3>
            </div>
            <StatusBadge variant="info">{activeReservation.timeline.length}</StatusBadge>
          </summary>

          <div className="mt-4 space-y-3">
            {activeReservation.timeline.map((item) => (
              <ReservationTimelineRow key={item.id} item={item} />
            ))}
          </div>
        </details>

        <section className="surface-elevated min-w-0 p-4">
          <p className="kicker">Observaciones</p>
          <p className="mt-3 break-words text-sm leading-6 text-slate-300">
            {activeReservation.notes || "Sin observaciones operativas."}
          </p>
        </section>
      </section>
    </section>
  );
}

function ReservationGuestRow({
  guest,
  reservationStatus,
  eventTerminal,
  onConfirm,
  onCancel,
  onCheckIn,
  onRevert,
  onRemove,
}: {
  guest: ReservationSummary["guests"][number];
  reservationStatus: ReservationSummary["status"];
  eventTerminal: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onCheckIn: () => void;
  onRevert: () => void;
  onRemove: () => void;
}) {
  const actionVisibility = getReservationGuestActionVisibility(reservationStatus, guest, eventTerminal);

  return (
    <div className="surface-elevated min-w-0 p-4">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-white">{guest.guestName}</p>
          <p
            className="mt-1 break-words text-xs text-slate-400"
            title={`${guest.invitationCode} · ${guest.invitationSequence}`}
          >
            {guest.invitationCode} · {guest.invitationSequence}
          </p>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            <StatusBadge
              variant={
                guest.reservationStatus === "Cancelled"
                  ? "danger"
                  : guest.reservationStatus === "Pending"
                    ? "warning"
                    : guest.reservationStatus === "Checked In"
                      ? "success"
                      : "info"
              }
            >
              {formatReservationStatus(guest.reservationStatus)}
            </StatusBadge>
            <StatusBadge
              variant={
                guest.admissionStatus === "Ingresó"
                  ? "success"
                  : guest.admissionStatus === "Anulada"
                    ? "danger"
                    : guest.admissionStatus === "Bloqueada"
                      ? "warning"
                      : "warning"
              }
            >
              {guest.admissionStatus}
            </StatusBadge>
            <StatusBadge variant="info">{guest.deliveryStatus}</StatusBadge>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">
          {actionVisibility.showConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Confirmar
            </button>
          ) : null}

          {actionVisibility.showCheckIn ? (
            <button
              type="button"
              onClick={onCheckIn}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
            >
              Registrar ingreso
            </button>
          ) : null}

          {actionVisibility.showRevert ? (
            <button
              type="button"
              onClick={onRevert}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15"
            >
              Revertir ingreso
            </button>
          ) : null}

          {actionVisibility.showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 text-sm font-medium text-rose-50 transition hover:bg-rose-400/15"
            >
              Cancelar invitado
            </button>
          ) : null}

          {actionVisibility.showRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Eliminar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReservationTimelineRow({
  item,
}: {
  item: ReservationSummary["timeline"][number];
}) {
  return (
    <div className="surface-elevated min-w-0 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-white">{item.title}</p>
          <p className="mt-1 break-words text-sm leading-6 text-slate-400">{item.detail}</p>
        </div>
        <p className="shrink-0 text-xs uppercase tracking-[0.22em] text-slate-500">{item.time}</p>
      </div>
    </div>
  );
}

function ReservationInfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="break-words text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}
