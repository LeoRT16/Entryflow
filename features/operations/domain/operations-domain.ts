import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import { buildAccessGrantFromGuest } from "@/features/access/domain/access-ledger";
import type { ReservationRecord, ReservationSummary } from "@/features/reservations/types";
import { buildTimelineEvents } from "@/features/timeline/domain/timeline-domain";
import type { TimelineEvent } from "@/features/timeline/types";
import type { TableSummary } from "@/features/tables/types";
import { normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";

export type OperationsAlertTone = "success" | "warning" | "danger" | "info";

export type OperationsAlert = {
  id: string;
  title: string;
  description: string;
  tone: OperationsAlertTone;
  source: string;
  reservationName?: string;
  tableName?: string;
};

export type OperationsCriticalTable = {
  id: string;
  name: string;
  status: TableSummary["status"];
  tone: TableSummary["statusTone"];
  capacity: number;
  assignedGuests: number;
  overCapacity: number;
};

export type OperationsSnapshot = {
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
    tone: OperationsAlertTone;
  }>;
  quickSummary: Array<{
    label: string;
    value: string;
    tone: OperationsAlertTone;
  }>;
  upcomingReservations: ReservationSummary[];
  alerts: OperationsAlert[];
  criticalTables: {
    full: OperationsCriticalTable[];
    overCapacity: OperationsCriticalTable[];
    empty: OperationsCriticalTable[];
  };
  recentActivity: TimelineEvent[];
};

function timeToMinutes(timestamp: string) {
  const [hours, minutes] = timestamp.split(":").map((value) => Number.parseInt(value, 10));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.POSITIVE_INFINITY;
  }

  return hours * 60 + minutes;
}

function buildMetric(
  label: string,
  value: string,
  detail: string,
  tone: OperationsAlertTone,
) {
  return {
    label,
    value,
    detail,
    tone,
  };
}

function buildAlert(
  id: string,
  title: string,
  description: string,
  tone: OperationsAlertTone,
  source: string,
  reservationName?: string,
  tableName?: string,
): OperationsAlert {
  return {
    id,
    title,
    description,
    tone,
    source,
    reservationName,
    tableName,
  };
}

function buildCriticalTable(table: TableSummary): OperationsCriticalTable {
  return {
    id: table.id,
    name: table.name,
    status: table.status,
    tone: table.statusTone,
    capacity: table.capacity,
    assignedGuests: table.metrics.assignedGuests,
    overCapacity: table.metrics.overCapacity,
  };
}

export function buildOperationsSnapshot({
  eventId,
  reservations,
  reservationSummaries,
  guests,
  tableSummaries,
  attempts,
  checkIns,
  timelineEvents,
}: {
  eventId?: string;
  reservations: ReservationRecord[];
  reservationSummaries: ReservationSummary[];
  guests: Guest[];
  tableSummaries: TableSummary[];
  attempts: CheckInAttempt[];
  checkIns: CheckIn[];
  timelineEvents?: TimelineEvent[];
}) {
  const filteredReservations = eventId ? reservations.filter((reservation) => reservation.eventId === eventId) : reservations;
  const filteredReservationSummaries = eventId
    ? reservationSummaries.filter((reservation) => filteredReservations.some((item) => item.id === reservation.id))
    : reservationSummaries;
  const filteredGuests = eventId ? guests.filter((guest) => guest.eventId === eventId) : guests;
  const filteredTableSummaries = eventId
    ? tableSummaries.filter((table) => table.reservationIds.some((reservationId) => filteredReservations.some((item) => item.id === reservationId)))
    : tableSummaries;
  const filteredAttempts = eventId ? attempts.filter((attempt) => attempt.eventId === eventId) : attempts;
  const filteredCheckIns = eventId ? checkIns.filter((checkIn) => checkIn.eventId === eventId) : checkIns;
  const accessGrants = filteredGuests.map((guest) => {
    const reservation = filteredReservations.find((item) => item.id === guest.reservationId) ?? null;
    return buildAccessGrantFromGuest(guest, reservation);
  });
  const activeAccessGrants = accessGrants.filter((grant) => grant.status === "active").length;
  const rejectedAccessAttempts = filteredCheckIns.filter(
    (checkIn) => checkIn.status === "Rejected" || checkIn.status === "Blocked" || checkIn.status === "Expired" || checkIn.status === "Cancelled" || checkIn.status === "No Show",
  ).length;

  const confirmedGuests = filteredGuests.filter(
    (guest) => normalizeReservationStatus(guest.reservationStatus) === "Confirmed" || guest.admissionStatus === "Ingresó",
  ).length;
  const checkedInGuests = filteredGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const pendingGuests = filteredGuests.filter((guest) => guest.admissionStatus === "Pendiente").length;
  const cancelledGuests = filteredGuests.filter(
    (guest) =>
      normalizeReservationStatus(guest.reservationStatus) === "Cancelled" ||
      normalizeReservationStatus(guest.reservationStatus) === "No Show" ||
      guest.admissionStatus === "Anulada",
  ).length;
  const reservationsCount = filteredReservationSummaries.length;
  const guestsCount = filteredGuests.length;
  const totalAssignedGuests = filteredTableSummaries.reduce((sum, table) => sum + table.metrics.assignedGuests, 0);
  const totalCapacity = filteredTableSummaries.reduce((sum, table) => sum + table.capacity, 0);
  const capacityRemaining = filteredTableSummaries.reduce((sum, table) => sum + table.metrics.capacityRemaining, 0);
  const occupancyPercent = Math.round((totalAssignedGuests / Math.max(totalCapacity, 1)) * 100);
  const recentActivity = (timelineEvents?.length
    ? (eventId ? timelineEvents.filter((entry) => entry.eventId === eventId || !entry.eventId) : timelineEvents)
    : buildTimelineEvents({
        eventId,
        reservations,
        guests,
        checkIns,
        attempts,
      })
  ).slice(0, 8);

  const upcomingReservations = [...filteredReservationSummaries]
    .filter((reservation) => normalizeReservationStatus(reservation.status) !== "Cancelled" && normalizeReservationStatus(reservation.status) !== "No Show")
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
    .slice(0, 6);

  const alerts: OperationsAlert[] = [];

  filteredTableSummaries
    .filter((table) => table.status === "Over Capacity")
    .forEach((table) => {
      alerts.push(
        buildAlert(
          `table-over-${table.id}`,
          "Mesa sobreocupada",
          `${table.name} tiene ${table.metrics.overCapacity} invitados por encima de su capacidad.`,
          "danger",
          "Tables",
          undefined,
          table.name,
        ),
      );
    });

  filteredTableSummaries
    .filter((table) => table.status === "Full")
    .forEach((table) => {
      alerts.push(
        buildAlert(
          `table-full-${table.id}`,
          "Mesa llena",
          `${table.name} ya alcanzó su capacidad completa.`,
          "warning",
          "Tables",
          undefined,
          table.name,
        ),
      );
    });

  filteredReservationSummaries
    .filter(
      (reservation) =>
        (!reservation.tableName || reservation.tableName === "Sin mesa") &&
        normalizeReservationStatus(reservation.status) !== "Cancelled" &&
        normalizeReservationStatus(reservation.status) !== "No Show",
    )
    .slice(0, 4)
    .forEach((reservation) => {
      alerts.push(
        buildAlert(
          `reservation-unassigned-${reservation.id}`,
          "Reserva sin mesa",
          `${reservation.name} todavía no tiene una mesa asignada.`,
          "warning",
          "Reservations",
          reservation.name,
        ),
      );
    });

  filteredGuests
    .filter((guest) => guest.admissionStatus === "Pendiente")
    .slice(0, 4)
    .forEach((guest) => {
      alerts.push(
        buildAlert(
          `guest-pending-${guest.id}`,
          "Invitado pendiente",
          `${guest.guestName} sigue esperando ingreso.`,
          "info",
          "Check-in",
          guest.reservationName,
          guest.tableName,
        ),
      );
    });

  filteredAttempts
    .slice(0, 8)
    .forEach((attempt) => {
      if (attempt.result === "No encontrado") {
        alerts.push(
          buildAlert(
            `attempt-invalid-${attempt.id}`,
            "Código inválido",
            attempt.note,
            "danger",
            "Check-in",
            attempt.guestName,
          ),
        );
        return;
      }

      if (attempt.result === "Usado") {
        alerts.push(
          buildAlert(
            `attempt-used-${attempt.id}`,
            "Segundo intento",
            attempt.note,
            "warning",
            "Check-in",
            attempt.guestName,
          ),
        );
        return;
      }

      if (attempt.result === "Anulado" || attempt.result === "Bloqueado") {
        alerts.push(
          buildAlert(
            `attempt-blocked-${attempt.id}`,
            "Check-in rechazado",
            attempt.note,
            "danger",
            "Check-in",
            attempt.guestName,
          ),
        );
      }
    });

  if (rejectedAccessAttempts > 0) {
    alerts.push(
      buildAlert(
        "access-rejected",
        "Accesos rechazados",
        `${rejectedAccessAttempts} intentos de acceso quedaron bloqueados o rechazados.`,
        "warning",
        "Check-in",
      ),
    );
  }

  const dedupedAlerts = Array.from(
    new Map(alerts.map((alert) => [alert.title + alert.description + (alert.reservationName ?? "") + (alert.tableName ?? ""), alert])).values(),
  ).slice(0, 10);

  const criticalTables = {
    full: filteredTableSummaries.filter((table) => table.status === "Full").map(buildCriticalTable),
    overCapacity: filteredTableSummaries.filter((table) => table.status === "Over Capacity").map(buildCriticalTable),
    empty: filteredTableSummaries.filter((table) => table.status === "Available" && table.metrics.assignedGuests === 0).map(buildCriticalTable),
  };

  return {
    metrics: [
      buildMetric("Reservas", `${reservationsCount}`, "Reservas activas en la sesión", "info"),
    buildMetric("Invitados", `${guestsCount}`, "Población total del evento", "warning"),
    buildMetric("Confirmados", `${confirmedGuests}`, "Invitados con reserva validada", "success"),
    buildMetric("Access", `${activeAccessGrants}`, "Grants activos para el evento", "info"),
    buildMetric("Check-in", `${checkedInGuests}`, "Ingresos ya registrados", "success"),
    buildMetric("Ocupación", `${occupancyPercent}%`, "Promedio sobre mesas activas", "info"),
    buildMetric("Capacidad restante", `${capacityRemaining}`, "Asientos libres en mesas abiertas", "warning"),
  ],
  quickSummary: [
    { label: "Reservas", value: `${reservationsCount}`, tone: "info" as OperationsAlertTone },
    { label: "Invitados", value: `${guestsCount}`, tone: "warning" as OperationsAlertTone },
    { label: "Access", value: `${activeAccessGrants}`, tone: activeAccessGrants > 0 ? "success" as OperationsAlertTone : "info" as OperationsAlertTone },
    { label: "Ingresados", value: `${checkedInGuests}`, tone: "success" as OperationsAlertTone },
    { label: "Pendientes", value: `${pendingGuests}`, tone: "warning" as OperationsAlertTone },
    { label: "Cancelados", value: `${cancelledGuests}`, tone: "danger" as OperationsAlertTone },
  ],
    upcomingReservations,
    alerts: dedupedAlerts,
    criticalTables,
    recentActivity,
  };
}
