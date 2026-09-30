import type { ReservationRecord, ReservationStatus } from "@/features/reservations/types";

export type SetReservationStatusResult = {
  reservationId: string;
  previousStatus: ReservationStatus;
  status: ReservationStatus;
  changed: boolean;
};

export type SetReservationStatusDeps = {
  persistOrdinary: (reservationId: string, status: ReservationStatus) => Promise<SetReservationStatusResult>;
  cancel: (reservationId: string) => Promise<void>;
  requestReporting: (eventId: string) => Promise<unknown>;
};

const ordinaryTransitions = new Set<ReservationStatus>(["Pending", "Confirmed"]);

export async function setReservationStatusOperation(
  reservation: Pick<ReservationRecord, "id" | "eventId" | "status">,
  targetStatus: ReservationStatus,
  deps: SetReservationStatusDeps,
): Promise<SetReservationStatusResult> {
  if (targetStatus === "Cancelled") {
    await deps.cancel(reservation.id);
    await deps.requestReporting(reservation.eventId);
    return { reservationId: reservation.id, previousStatus: reservation.status, status: targetStatus, changed: true };
  }

  if (!ordinaryTransitions.has(targetStatus)) {
    throw new Error("Esta transición de estado no está disponible en este flujo.");
  }

  const persisted = await deps.persistOrdinary(reservation.id, targetStatus);
  await deps.requestReporting(reservation.eventId);
  return {
    reservationId: persisted.reservationId,
    previousStatus: persisted.previousStatus,
    status: persisted.status,
    changed: persisted.changed,
  };
}
