"use client";

import type { Resource } from "@/features/domain/types";
import StatusBadge from "@/components/status-badge";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import { formatCurrency } from "@/utils/currency";
import { formatReservationStatus, getReservationStatusTone } from "@/features/reservations/domain/reservation-domain";
import type { Guest } from "@/features/check-in/types";
import type { ReservationRecord } from "@/features/reservations/types";
import type { TableSummary } from "@/features/tables/types";

type ResourceReservationModalProps = {
  isOpen: boolean;
  resource: Resource | null;
  reservation: ReservationRecord | null;
  guests: Guest[];
  summary: TableSummary | null;
  sectorName: string;
  conflictCount: number;
  isTerminalEvent?: boolean;
  onClose: () => void;
  onEditReservation: () => void;
  onAddManillas: () => void;
};

export default function ResourceReservationModal({
  isOpen,
  resource,
  reservation,
  guests,
  summary,
  sectorName,
  conflictCount,
  isTerminalEvent = false,
  onClose,
  onEditReservation,
  onAddManillas,
}: ResourceReservationModalProps) {
  if (!isOpen || !resource || !reservation) {
    return null;
  }

  const guestCount = summary?.metrics.assignedGuests ?? guests.length;
  const overCapacity = summary?.metrics.overCapacity ?? Math.max(guestCount - resource.capacity, 0);
  const reservationTone = getReservationStatusTone(reservation.status);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Cerrar detalle de reserva"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative mx-auto flex h-full w-full max-w-4xl items-center p-4">
        <section className="relative w-full rounded-[2rem] border border-white/10 bg-[#0b0f14] p-5 shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Vista rápida de reserva
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {reservation.name}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {reservation.code} · {resource.name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge variant={reservationTone}>{formatReservationStatus(reservation.status)}</StatusBadge>
              {conflictCount > 1 ? <StatusBadge variant="warning">Conflicto x{conflictCount}</StatusBadge> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div className="space-y-4">
              <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <LiveSummaryRow label="Titular" value={reservation.holderName} />
                  <LiveSummaryRow label="WhatsApp" value={reservation.holderWhatsapp || "Sin WhatsApp"} />
                  <LiveSummaryRow label="Mesa" value={reservation.tableName} />
                  <LiveSummaryRow label="Sector" value={sectorName} />
                  <LiveSummaryRow label="Ocupación" value={`${guestCount}/${resource.capacity}`} />
                  <LiveSummaryRow label="Sobrecapacidad" value={overCapacity > 0 ? `+${overCapacity}` : "0"} />
                  <LiveSummaryRow label="Pago" value={reservation.paymentStatus} />
                  <LiveSummaryRow label="Monto" value={formatCurrency(reservation.amount)} />
                  <LiveSummaryRow label="Adelanto" value={formatCurrency(reservation.advance)} />
                </div>
              </section>

              {reservation.notes ? (
                <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Notas
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{reservation.notes}</p>
                </section>
              ) : null}
            </div>

            <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Invitados
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    {guests.length} invitados
                  </h3>
                </div>
                {overCapacity > 0 ? <StatusBadge variant="danger">+{overCapacity}</StatusBadge> : null}
              </div>

              <div className="mt-4 space-y-2">
                {guests.length ? (
                  guests.map((guest) => (
                    <div key={guest.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <p className="text-sm font-medium text-white">{guest.guestName}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {guest.whatsapp || "Sin WhatsApp"} · {guest.carnet || "Sin documento"}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                    Sin invitados registrados.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Cerrar
            </button>
            {isTerminalEvent ? (
              <span className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-slate-400">
                Vista histórica
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onAddManillas}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                >
                  Agregar manillas
                </button>
                <button
                  type="button"
                  onClick={onEditReservation}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  Editar reserva
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
