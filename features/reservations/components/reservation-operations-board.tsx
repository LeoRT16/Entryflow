"use client";

import { useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import { ContextualCard } from "@/components/quick-actions-menu";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import { formatReservationStatus, getReservationStatusTone } from "@/features/reservations/domain/reservation-domain";
import type {
  ReservationGuestAction,
  ReservationGuestInput,
  ReservationSummary,
} from "@/features/reservations/types";

type ReservationOperationsBoardProps = {
  reservations: ReservationSummary[];
  activeReservationId: string;
  onSelectReservation: (reservationId: string) => void;
  onMarkConfirmed: (reservationId: string) => void;
  onAddGuest: (reservationId: string, guest: ReservationGuestInput) => void;
  onGuestAction: (params: {
    reservationId: string;
    guestId: string;
    action: ReservationGuestAction;
  }) => void;
  onRegisterCheckIn: (reservationId: string, guestId: string) => void;
  onCancelReservation: (reservationId: string) => void;
};

export default function ReservationOperationsBoard({
  reservations,
  activeReservationId,
  onSelectReservation,
  onMarkConfirmed,
  onAddGuest,
  onGuestAction,
  onRegisterCheckIn,
  onCancelReservation,
}: ReservationOperationsBoardProps) {
  const { showToast } = useFeedback();
  const activeReservation =
    reservations.find((reservation) => reservation.id === activeReservationId) ?? reservations[0] ?? null;
  const [guestName, setGuestName] = useState("");
  const [guestDocument, setGuestDocument] = useState("");
  const [guestWhatsapp, setGuestWhatsapp] = useState("");

  const totals = useMemo(
    () =>
      reservations.reduce(
        (accumulator, reservation) => ({
          guestCount: accumulator.guestCount + reservation.metrics.guestCount,
          confirmedGuests: accumulator.confirmedGuests + reservation.metrics.confirmedGuests,
          pendingGuests: accumulator.pendingGuests + reservation.metrics.pendingGuests,
          checkedInGuests: accumulator.checkedInGuests + reservation.metrics.checkedInGuests,
          cancelledGuests: accumulator.cancelledGuests + reservation.metrics.cancelledGuests,
          capacityRemaining: accumulator.capacityRemaining + reservation.metrics.capacityRemaining,
        }),
        {
          guestCount: 0,
          confirmedGuests: 0,
          pendingGuests: 0,
          checkedInGuests: 0,
          cancelledGuests: 0,
          capacityRemaining: 0,
        },
      ),
    [reservations],
  );

  const handleAddGuest = () => {
    if (!activeReservation) {
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

    setGuestName("");
    setGuestDocument("");
    setGuestWhatsapp("");
  };

  if (!reservations.length || !activeReservation) {
    return (
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Reservas operativas
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              No hay reservas para operar.
            </h2>
          </div>
          <StatusBadge variant="info">0</StatusBadge>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="space-y-4">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Reservas activas
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Selecciona una reserva para operar.
              </h2>
            </div>
            <StatusBadge variant="info">{reservations.length}</StatusBadge>
          </div>

          <div className="mt-5 space-y-3">
            {reservations.map((reservation) => {
              const isActive = reservation.id === activeReservation.id;

              const reservationActions = [
                {
                  id: `${reservation.id}-open`,
                  label: "Abrir",
                  description: "Mostrar el detalle operativo.",
                  tone: "info" as const,
                  onSelect: () => {
                    onSelectReservation(reservation.id);
                    setGuestName("");
                    setGuestDocument("");
                    setGuestWhatsapp("");
                  },
                },
                {
                  id: `${reservation.id}-confirm`,
                  label: "Confirmar",
                  description: "Marcar la reserva como confirmada.",
                  tone: "success" as const,
                  onSelect: () => onMarkConfirmed(reservation.id),
                },
                {
                  id: `${reservation.id}-guest`,
                  label: "Agregar invitado",
                  description: "Sumar una nueva invitación al grupo.",
                  tone: "info" as const,
                  onSelect: () => {
                    onSelectReservation(reservation.id);
                    setGuestName("");
                  },
                },
                {
                  id: `${reservation.id}-cancel`,
                  label: "Cancelar",
                  description: "Anular la reserva desde el flujo operativo.",
                  tone: "danger" as const,
                  onSelect: () => onCancelReservation(reservation.id),
                },
              ];

              return (
                <ContextualCard
                  key={reservation.id}
                  items={reservationActions}
                  className={[
                    "rounded-[1.5rem] border transition",
                    isActive
                      ? "border-cyan-400/30 bg-cyan-400/10"
                      : "border-white/10 bg-slate-950/40 hover:bg-slate-950/55",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectReservation(reservation.id);
                      setGuestName("");
                      setGuestDocument("");
                      setGuestWhatsapp("");
                    }}
                    className="w-full rounded-[1.5rem] p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{reservation.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                          {reservation.code} · {reservation.eventName}
                        </p>
                      </div>
                      <StatusBadge variant={getReservationStatusTone(reservation.status)}>
                        {formatReservationStatus(reservation.status)}
                      </StatusBadge>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <MiniStat label="Invitados" value={`${reservation.metrics.guestCount}`} />
                      <MiniStat label="Ingresados" value={`${reservation.metrics.checkedInGuests}`} />
                      <MiniStat label="Pendientes" value={`${reservation.metrics.pendingGuests}`} />
                      <MiniStat label="Último ingreso" value={reservation.metrics.lastCheckInAt} />
                    </div>
                  </button>
                </ContextualCard>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3 rounded-[2rem] border border-white/10 bg-slate-950/40 p-5 sm:grid-cols-2">
          <MetricTile label="Ocupación" value={`${Math.round((totals.guestCount / Math.max(totals.capacityRemaining + totals.guestCount, 1)) * 100)}%`} tone="info" />
          <MetricTile label="Ingresados" value={`${totals.checkedInGuests}`} tone="success" />
          <MetricTile label="Pendientes" value={`${totals.pendingGuests}`} tone="warning" />
          <MetricTile label="Capacidad restante" value={`${totals.capacityRemaining}`} tone="danger" />
        </section>
      </div>

      <section className="min-w-0 space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Detalle de reserva
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {activeReservation.name}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {activeReservation.code} · {activeReservation.eventName}
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <StatusBadge variant={getReservationStatusTone(activeReservation.status)}>
              {formatReservationStatus(activeReservation.status)}
            </StatusBadge>
            <button
              type="button"
              onClick={() => onMarkConfirmed(activeReservation.id)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
            >
              Marcar confirmado
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <LiveSummaryRow label="Evento" value={activeReservation.eventName} />
          <LiveSummaryRow label="Mesa" value={activeReservation.tableName} />
          <LiveSummaryRow label="Fecha" value={activeReservation.date} />
          <LiveSummaryRow label="Hora" value={activeReservation.time} />
          <LiveSummaryRow label="Titular" value={activeReservation.holderName} />
          <LiveSummaryRow label="Pago" value={activeReservation.paymentStatus} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Invitados confirmados" value={`${activeReservation.metrics.confirmedGuests}`} />
          <MiniStat label="Invitados pendientes" value={`${activeReservation.metrics.pendingGuests}`} />
          <MiniStat label="Invitados ingresados" value={`${activeReservation.metrics.checkedInGuests}`} />
          <MiniStat label="Capacidad restante" value={`${activeReservation.metrics.capacityRemaining}`} />
        </div>

        <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Invitados
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                Estado individual y acciones
              </h3>
            </div>
            <StatusBadge variant="info">{activeReservation.guests.length}</StatusBadge>
          </div>

          <div className="mt-4 space-y-3">
            {activeReservation.guests.map((guest) => (
              <ReservationGuestRow
                key={guest.id}
                guest={guest}
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
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Nombre del invitado"
              className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
            />
            <input
              value={guestDocument}
              onChange={(event) => setGuestDocument(event.target.value)}
              placeholder="Carnet"
              className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
            />
            <input
              value={guestWhatsapp}
              onChange={(event) => setGuestWhatsapp(event.target.value)}
              placeholder="WhatsApp"
              className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
            />
            <button
              type="button"
              onClick={handleAddGuest}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Agregar invitado
            </button>
          </div>
        </section>

        <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Timeline
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                Línea de tiempo operativa
              </h3>
            </div>
            <StatusBadge variant="info">{activeReservation.timeline.length}</StatusBadge>
          </div>

          <div className="mt-4 space-y-3">
            {activeReservation.timeline.map((item) => (
              <ReservationTimelineRow key={item.id} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Observaciones
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {activeReservation.notes || "Sin observaciones operativas."}
          </p>
        </section>
      </section>
    </section>
  );
}

function ReservationGuestRow({
  guest,
  onConfirm,
  onCancel,
  onCheckIn,
  onRevert,
  onRemove,
}: {
  guest: ReservationSummary["guests"][number];
  onConfirm: () => void;
  onCancel: () => void;
  onCheckIn: () => void;
  onRevert: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{guest.guestName}</p>
          <p className="mt-1 text-xs text-slate-400">
            {guest.invitationCode} · {guest.invitationSequence}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge variant={guest.reservationStatus === "Cancelled" ? "danger" : guest.reservationStatus === "Pending" ? "warning" : guest.reservationStatus === "Checked In" ? "success" : "info"}>
              {formatReservationStatus(guest.reservationStatus)}
            </StatusBadge>
            <StatusBadge variant={guest.admissionStatus === "Ingresó" ? "success" : guest.admissionStatus === "Anulada" ? "danger" : guest.admissionStatus === "Bloqueada" ? "warning" : "warning"}>
              {guest.admissionStatus}
            </StatusBadge>
            <StatusBadge variant="info">{guest.deliveryStatus}</StatusBadge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {guest.canConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Confirmar
            </button>
          ) : null}

          {guest.canCheckIn ? (
            <button
              type="button"
              onClick={onCheckIn}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
            >
              Registrar ingreso
            </button>
          ) : null}

          {guest.canRevert ? (
            <button
              type="button"
              onClick={onRevert}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15"
            >
              Revertir ingreso
            </button>
          ) : null}

          {guest.canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 text-sm font-medium text-rose-50 transition hover:bg-rose-400/15"
            >
              Cancelar invitado
            </button>
          ) : null}

          {guest.canRemove ? (
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <LiveSummaryRow label="WhatsApp" value={guest.deliveryStatus} />
        <LiveSummaryRow label="Ingreso" value={guest.checkInTime ?? "Pendiente"} />
        <LiveSummaryRow label="Puerta" value={guest.gate ?? "Sin asignar"} />
        <LiveSummaryRow label="QR" value={guest.qrStatus ?? "Válido"} />
        <LiveSummaryRow label="Mesa" value={guest.tableName ?? "Sin mesa"} />
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
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{item.title}</p>
          <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
        </div>
        <div className="text-right">
          <StatusBadge variant={item.tone === "danger" ? "danger" : item.tone === "warning" ? "warning" : item.tone === "success" ? "success" : "info"}>
            {item.time}
          </StatusBadge>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xl font-semibold ${toneClasses}`}>{value}</p>
    </div>
  );
}
