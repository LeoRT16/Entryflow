"use client";

import { isTerminalEventStatus } from "@/features/events/domain";
import { useCheckInStore } from "@/services/workspace-service";
import StatusBadge from "@/components/status-badge";
import { EmptyState } from "@/components/premium-feedback";
import type { ReservationRow } from "@/types/dashboard";

export default function RecentReservationsTable({
  reservations,
}: {
  reservations: ReservationRow[];
}) {
  const { currentEvent } = useCheckInStore();
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold text-white">Actividad reciente</h2>
        <p className="mt-1 text-sm text-slate-400">
          Últimos movimientos desde web, recepción y reservas directas.
        </p>
      </div>

      <div className="overflow-x-auto">
        {reservations.length ? (
          <table className="min-w-full divide-y divide-white/10 text-left">
            <thead className="bg-white/[0.02]">
              <tr className="text-xs uppercase tracking-[0.22em] text-slate-500">
                <th scope="col" className="px-5 py-4 font-semibold sm:px-6">
                  Invitado
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Evento
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Hora
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Invitados
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Origen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {reservations.map((reservation) => (
                <tr key={`${reservation.guest}-${reservation.time}`}>
                  <td className="px-5 py-4 sm:px-6">
                    <div className="font-medium text-white">{reservation.guest}</div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">
                    {reservation.event}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">
                    {reservation.time}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">
                    {reservation.guests}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge variant={reservation.tone}>
                      {reservation.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">
                    {reservation.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="inbox"
              title="No hay reservas visibles."
              description="Cuando existan nuevos movimientos, aparecerán aquí con su estado operativo."
              primaryAction={{
                label: isTerminalEvent ? "Ver reservas" : "Crear reserva",
                href: "/reservations",
              }}
              secondaryAction={{ label: "Ver invitados", href: "/customers" }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
