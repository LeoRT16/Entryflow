import type { CheckIn, Guest } from "@/features/check-in/types";
import type {
  ReservationCreationInput,
  ReservationGuestSummary,
  ReservationMetrics,
  ReservationRecord,
  ReservationStatus,
  ReservationSummary,
  ReservationTimelineEntry,
  ReservationTone,
} from "@/features/reservations/types";
import { createUuid } from "@/lib/supabase/helpers";

function createTimeStamp() {
  return new Date().toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function reservationToneForStatus(status: ReservationStatus): ReservationTone {
  if (status === "Confirmed" || status === "Checked In" || status === "Completed") {
    return "success";
  }

  if (status === "Pending" || status === "Draft") {
    return "warning";
  }

  if (status === "Cancelled" || status === "No Show") {
    return "danger";
  }

  return "info";
}

function normalizeIdentityText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function normalizeReservationStatus(status: string): ReservationStatus {
  if (status === "Draft" || status === "Pending" || status === "Confirmed" || status === "Checked In" || status === "Completed" || status === "Cancelled" || status === "No Show") {
    return status;
  }

  if (status === "Confirmada") {
    return "Confirmed";
  }

  if (status === "Pendientes de pago" || status === "Pago parcial") {
    return "Pending";
  }

  if (status === "Cancelada" || status === "Anulada") {
    return "Cancelled";
  }

  if (status === "Ingresó") {
    return "Checked In";
  }

  return "Draft";
}

export function formatReservationStatus(status: ReservationStatus | string) {
  const normalized = normalizeReservationStatus(status);

  if (normalized === "Draft") return "Borrador";
  if (normalized === "Pending") return "Pendiente";
  if (normalized === "Confirmed") return "Confirmada";
  if (normalized === "Checked In") return "Ingresada";
  if (normalized === "Completed") return "Completada";
  if (normalized === "Cancelled") return "Cancelada";
  return "No asistió";
}

export function getReservationStatusTone(status: ReservationStatus | string) {
  return reservationToneForStatus(normalizeReservationStatus(status));
}

export function deriveFrequentCustomerFromHistory(
  reservations: Array<Pick<ReservationRecord, "holderName" | "holderDocument" | "holderWhatsapp" | "status" | "eventId" | "createdAt" | "updatedAt">>,
  identity: {
    holderName?: string;
    holderDocument?: string;
    holderWhatsapp?: string;
    eventId?: string;
  },
) {
  const normalizedName = normalizeIdentityText(identity.holderName ?? "");
  const normalizedDocument = normalizeIdentityText(identity.holderDocument ?? "");
  const normalizedWhatsapp = normalizeIdentityText(identity.holderWhatsapp ?? "");

  if (!normalizedName && !normalizedDocument && !normalizedWhatsapp) {
    return {
      frequent: false,
      matchedReservations: 0,
      lastSeenAt: undefined as string | undefined,
    };
  }

  const matchesFor = (source: typeof reservations) =>
    source.filter((reservation) => {
    const reservationName = normalizeIdentityText(reservation.holderName ?? "");
    const reservationDocument = normalizeIdentityText(reservation.holderDocument ?? "");
    const reservationWhatsapp = normalizeIdentityText(reservation.holderWhatsapp ?? "");
    const status = normalizeReservationStatus(reservation.status);

    if (status === "Cancelled" || status === "No Show") {
      return false;
    }

    if (normalizedDocument && reservationDocument && normalizedDocument === reservationDocument) {
      return true;
    }

    if (normalizedWhatsapp && reservationWhatsapp && normalizedWhatsapp === reservationWhatsapp) {
      return true;
    }

    if (!normalizedDocument && !normalizedWhatsapp && normalizedName) {
      return reservationName === normalizedName;
    }

    return false;
    });

  const eventScopedMatches = identity.eventId
    ? matchesFor(reservations.filter((reservation) => reservation.eventId === identity.eventId))
    : [];
  const matches = eventScopedMatches.length >= 2 ? eventScopedMatches : matchesFor(reservations);

  const lastSeenAt =
    matches
      .map((reservation) => reservation.updatedAt ?? reservation.createdAt)
      .sort((a, b) => (a < b ? 1 : -1))[0] ?? undefined;

  return {
    frequent: matches.length >= 2,
    matchedReservations: matches.length,
    lastSeenAt,
  };
}

function buildTimelineEntry(
  title: string,
  detail: string,
  tone: ReservationTone,
  time = createTimeStamp(),
): ReservationTimelineEntry {
  return {
    id: `${title}-${time}-${Math.random().toString(36).slice(2, 7)}`,
    time,
    title,
    detail,
    tone,
  };
}

function deriveReservationType(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes("cumple")) {
    return "Cumpleaños";
  }

  if (normalized.includes("vip")) {
    return "VIP";
  }

  if (normalized.includes("corpor")) {
    return "Corporativo";
  }

  return "Mesa";
}

function getGuestReservationSummary(guest: Guest): ReservationGuestSummary {
  const status = normalizeReservationStatus(guest.reservationStatus);

  return {
    id: guest.id,
    guestName: guest.guestName,
    invitationCode: guest.invitationCode,
    invitationSequence: guest.invitationSequence,
    admissionStatus: guest.admissionStatus,
    reservationStatus: status,
    deliveryStatus: guest.deliveryStatus,
    checkInTime: guest.checkInTime,
    checkInMethod: guest.checkInMethod,
    gate: guest.gate,
    qrStatus: guest.qrStatus,
    manualAdmission: guest.manualAdmission,
    attention: guest.attention,
    canConfirm: guest.admissionStatus !== "Ingresó" && status !== "Confirmed",
    canCancel: guest.admissionStatus !== "Ingresó" && status !== "Cancelled",
    canCheckIn: guest.admissionStatus === "Pendiente" && status !== "Cancelled",
    canRevert: guest.admissionStatus === "Ingresó",
    canRemove: guest.admissionStatus !== "Ingresó",
  };
}

function inferReservationStatus(guests: Guest[], baseStatus?: ReservationStatus) {
  if (!guests.length) {
    return baseStatus ?? "Draft";
  }

  const checkedIn = guests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const cancelled = guests.filter((guest) => normalizeReservationStatus(guest.reservationStatus) === "Cancelled" || guest.admissionStatus === "Anulada").length;
  const pending = guests.filter((guest) => guest.admissionStatus === "Pendiente").length;

  if (baseStatus === "Cancelled" || baseStatus === "No Show" || baseStatus === "Completed") {
    return baseStatus;
  }

  if (checkedIn > 0 && checkedIn === guests.length) {
    return "Checked In";
  }

  if (cancelled > 0 && cancelled === guests.length) {
    return "Cancelled";
  }

  if (checkedIn > 0 || pending < guests.length) {
    return "Confirmed";
  }

  return baseStatus ?? "Pending";
}

function buildReservationTimelineFromGuestData(
  reservation: Pick<ReservationRecord, "name" | "createdAt" | "updatedAt">,
  guests: Guest[],
): ReservationTimelineEntry[] {
  const firstGuest = guests[0];
  const timeline: ReservationTimelineEntry[] = [
    buildTimelineEntry("Reserva creada", `Se abrió ${reservation.name}.`, "info", reservation.createdAt),
  ];

  if (firstGuest?.deliveryHistory.length) {
    const sentEntry = firstGuest.deliveryHistory.find((entry) => entry.title === "Enviada" || entry.title === "Reenviada");
    if (sentEntry) {
      timeline.push(
        buildTimelineEntry(
          sentEntry.title === "Reenviada" ? "Invitación reenviada" : "Invitación enviada",
          sentEntry.detail,
          "info",
          sentEntry.time,
        ),
      );
    }
  }

  guests.forEach((guest) => {
    if (guest.admissionStatus === "Ingresó" && guest.checkInTime) {
      timeline.push(
        buildTimelineEntry(
          guest.manualAdmission ? "Ingreso manual" : "Invitado ingresó",
          `${guest.guestName} pasó por ${guest.gate ?? "principal"}.`,
          "success",
          guest.checkInTime,
        ),
      );
    }

    if (guest.admissionStatus === "Anulada") {
      timeline.push(
        buildTimelineEntry(
          "Invitado rechazado",
          `${guest.guestName} quedó anulado.`,
          "danger",
          guest.operatorActivity.at(-1)?.time ?? reservation.updatedAt,
        ),
      );
    }
  });

  return timeline;
}

export function buildReservationRecordsFromGuests(
  guests: Guest[],
  events: Array<{ id: string; name: string; date: string; startsAt: string }>,
): ReservationRecord[] {
  const grouped = new Map<string, Guest[]>();

  guests.forEach((guest) => {
    const current = grouped.get(guest.reservationId) ?? [];
    current.push(guest);
    grouped.set(guest.reservationId, current);
  });

  return Array.from(grouped.entries()).map(([reservationId, reservationGuests]) => {
    const representative = reservationGuests[0];
    const event = events.find((item) => item.id === representative.eventId);
    const status = inferReservationStatus(reservationGuests, normalizeReservationStatus(representative.reservationStatus));
    const createdAt = reservationGuests[0]?.deliveryHistory[0]?.time ?? event?.startsAt ?? "18:30";
    const updatedAt = reservationGuests[0]?.checkInTime ?? reservationGuests[0]?.operatorActivity.at(-1)?.time ?? createdAt;
    const tableCapacity = Math.max(reservationGuests.length + 2, 4);
    const reservation: ReservationRecord = {
      id: reservationId,
      code: representative.reservationCode,
      name: representative.reservationName,
      eventId: representative.eventId,
      eventName: representative.eventName,
      date: event?.date ?? "8 de agosto de 2026",
      time: event?.startsAt ?? "21:00",
      tableName: representative.tableName ?? representative.reservationName,
      tableId: representative.tableId,
      tableCapacity,
      holderName: representative.guestName,
      holderDocument: representative.carnet,
      holderWhatsapp: representative.whatsapp,
      holderEmail: "",
      reservationType: deriveReservationType(representative.reservationName),
      paymentStatus: status === "Confirmed" || status === "Checked In" || status === "Completed" ? "Pagado" : "Parcial",
      amount: "0",
      advance: "0",
      notes: representative.internalNotes ?? representative.attention ?? "Sin observaciones",
      guestIds: reservationGuests.map((guest) => guest.id),
      status,
      timeline: buildReservationTimelineFromGuestData(
        {
          name: representative.reservationName,
          createdAt,
          updatedAt,
        },
        reservationGuests,
      ),
      createdAt,
      updatedAt,
    };

    return reservation;
  });
}

export function buildReservationMetrics(
  reservation: ReservationRecord,
  guests: Guest[],
  checkIns: CheckIn[],
): ReservationMetrics {
  const reservationGuests = guests.filter((guest) => guest.reservationId === reservation.id);
  const guestCount = reservationGuests.length;
  const confirmedGuests = reservationGuests.filter((guest) => normalizeReservationStatus(guest.reservationStatus) === "Confirmed" || guest.admissionStatus === "Ingresó").length;
  const pendingGuests = reservationGuests.filter((guest) => guest.admissionStatus === "Pendiente").length;
  const checkedInGuests = reservationGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
  const cancelledGuests = reservationGuests.filter((guest) => normalizeReservationStatus(guest.reservationStatus) === "Cancelled" || guest.admissionStatus === "Anulada").length;
  const attendancePercent = Math.round((checkedInGuests / Math.max(guestCount, 1)) * 100);
  const occupancyPercent = Math.round((guestCount / Math.max(reservation.tableCapacity, 1)) * 100);
  const capacityRemaining = Math.max(reservation.tableCapacity - guestCount, 0);
  const latestAccess = [...checkIns]
    .filter(
      (checkIn) =>
        checkIn.reservationId === reservation.id &&
        (checkIn.status === "Checked In" || checkIn.status === "Confirmed" || checkIn.status === "Checked Out"),
    )
    .sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1))[0];
  const lastCheckInAt =
    reservationGuests.findLast((guest) => guest.checkInTime)?.checkInTime ??
    latestAccess?.checkedOutAt ??
    latestAccess?.checkedInAt ??
    reservation.updatedAt;

  return {
    guestCount,
    confirmedGuests,
    pendingGuests,
    checkedInGuests,
    cancelledGuests,
    attendancePercent,
    occupancyPercent,
    capacityRemaining,
    lastCheckInAt,
  };
}

export function buildReservationTimeline(
  reservation: ReservationRecord,
  guests: Guest[],
): ReservationTimelineEntry[] {
  const reservationGuests = guests.filter((guest) => guest.reservationId === reservation.id);
  const items = [...reservation.timeline];

  if (!items.length) {
    items.push(buildTimelineEntry("Reserva creada", `Se abrió ${reservation.name}.`, "info", reservation.createdAt));
  }

  if (reservation.paymentStatus === "Pagado") {
    items.push(buildTimelineEntry("Pago confirmado", "El saldo quedó cubierto.", "success", reservation.updatedAt));
  } else if (reservation.paymentStatus === "Parcial") {
    items.push(buildTimelineEntry("Pago parcial", "La reserva mantiene saldo pendiente.", "warning", reservation.updatedAt));
  } else if (reservation.paymentStatus === "Pendiente") {
    items.push(buildTimelineEntry("Pago pendiente", "La reserva sigue abierta.", "warning", reservation.updatedAt));
  }

  reservationGuests.forEach((guest) => {
    if (guest.admissionStatus === "Ingresó" && guest.checkInTime) {
      items.push(
        buildTimelineEntry(
          guest.manualAdmission ? "Ingreso manual" : "Invitado ingresó",
          `${guest.guestName} pasó por ${guest.gate ?? "principal"}.`,
          "success",
          guest.checkInTime,
        ),
      );
    }

    if (normalizeReservationStatus(guest.reservationStatus) === "Confirmed" && guest.deliveryStatus === "Enviada") {
      const latestDelivery = guest.deliveryHistory.at(-1);
      items.push(
        buildTimelineEntry(
          "Invitación enviada",
          `${guest.guestName} recibió su invitación.`,
          "info",
          latestDelivery?.time ?? reservation.createdAt,
        ),
      );
    }

    if (guest.admissionStatus === "Anulada") {
      items.push(
        buildTimelineEntry(
          "Invitado rechazado",
          `${guest.guestName} quedó anulado.`,
          "danger",
          guest.operatorActivity.at(-1)?.time ?? reservation.updatedAt,
        ),
      );
    }
  });

  return Array.from(
    new Map(items.map((item) => [`${item.title}|${item.time}|${item.detail}`, item])).values(),
  );
}

export function buildReservationSummary(
  reservation: ReservationRecord,
  guests: Guest[],
  checkIns: CheckIn[],
): ReservationSummary {
  const reservationGuests = guests.filter((guest) => guest.reservationId === reservation.id);
  const metrics = buildReservationMetrics(reservation, guests, checkIns);
  const timeline = buildReservationTimeline(reservation, guests);
  const status = inferReservationStatus(reservationGuests, reservation.status);

  return {
    id: reservation.id,
    code: reservation.code,
    name: reservation.name,
    eventName: reservation.eventName,
    date: reservation.date,
    time: reservation.time,
    tableName: reservation.tableName,
    status,
    statusTone: getReservationStatusTone(status),
    metrics,
    paymentStatus: reservation.paymentStatus,
    notes: reservation.notes,
    holderName: reservation.holderName,
    holderDocument: reservation.holderDocument,
    holderWhatsapp: reservation.holderWhatsapp,
    guests: reservationGuests.map((guest) => getGuestReservationSummary(guest)),
    timeline,
  };
}

export function buildReservationSummaries(
  reservations: ReservationRecord[],
  guests: Guest[],
  checkIns: CheckIn[],
) {
  return reservations
    .map((reservation) => buildReservationSummary(reservation, guests, checkIns))
    .sort((a, b) => b.code.localeCompare(a.code));
}

function buildGuestDraftIdentity(index: number, input: ReservationCreationInput) {
  const guestDraft = input.guests[index];
  const name = guestDraft.name.trim() || `Invitado ${index + 1}`;
  return {
    name,
    guestDraft,
  };
}

function getSelectedReservationResource(input: ReservationCreationInput) {
  return input.selectedResource ?? input.selectedTable;
}

export function createReservationBundle(input: ReservationCreationInput) {
  const createdAt = createTimeStamp();
  const selectedResource = getSelectedReservationResource(input);

  if (!selectedResource) {
    throw new Error("A reservation resource is required.");
  }

  const codeBase = `${input.eventName}-${selectedResource.id}-${Date.now().toString().slice(-4)}`;
  const code = `RES-${codeBase.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase()}`;
  const name = `${selectedResource.name} · ${input.holderName} ${input.holderLastName}`.trim();
  const status: ReservationStatus = input.paymentStatus === "Pagado" ? "Confirmed" : "Pending";
  const reservation: ReservationRecord = {
    id: createUuid(),
    code,
    name,
    eventId: input.eventId,
    eventName: input.eventName,
    date: input.date,
    time: input.time,
    resourceId: selectedResource.id,
    resourceName: selectedResource.name,
    sectorId: selectedResource.sectorId,
    sectorName: selectedResource.location,
    venueId: selectedResource.venueId,
    tableName: selectedResource.name,
    tableId: selectedResource.id,
    tableCapacity: selectedResource.capacity,
    holderName: `${input.holderName} ${input.holderLastName}`.trim(),
    holderDocument: input.documentValue,
    holderWhatsapp: input.whatsapp,
    holderEmail: input.email,
    reservationType: input.reservationType,
    paymentStatus: input.paymentStatus,
    amount: input.amount,
    advance: input.advance,
    notes: [input.observations, input.preferences, input.notes].filter(Boolean).join(" · "),
    guestIds: [],
    status,
    timeline: [
      buildTimelineEntry("Reserva creada", `${name} quedó en borrador operativo.`, "info", createdAt),
      buildTimelineEntry("Invitados registrados", `${input.guests.length} invitaciones preparadas.`, "warning", createdAt),
      buildTimelineEntry(
        "Pago simulado",
        input.paymentStatus === "Pagado"
          ? "Reserva confirmada con pago completo."
          : input.paymentStatus === "Parcial"
            ? "La reserva quedó con saldo pendiente."
            : "La reserva sigue pendiente de pago.",
        input.paymentStatus === "Pagado" ? "success" : "warning",
        createdAt,
      ),
    ],
    createdAt,
    updatedAt: createdAt,
  };

  const guests: Guest[] = input.guests
    .map((guestDraft, index) => {
      const identity = buildGuestDraftIdentity(index, input);
      const invitationCode = `${code}-${String(index + 1).padStart(2, "0")}`;
      return {
        id: createUuid(),
        guestName: identity.name,
        reservationName: name,
        reservationCode: code,
        reservationId: reservation.id,
        eventId: reservation.eventId,
        eventName: reservation.eventName,
        tableId: reservation.tableId,
        tableName: reservation.tableName,
        eventStatus: "Próximo" as const,
        invitationSequence: `${index + 1} de ${input.guests.length}`,
        invitationCode,
        carnet: guestDraft.document || `Pendiente ${index + 1}`,
        whatsapp: guestDraft.whatsapp || input.whatsapp,
        deliveryStatus: "Enviada" as const,
        admissionStatus: "Pendiente" as const,
        reservationStatus: status,
        deliveryHistory: [
          { time: createdAt, title: "Enviada", detail: "Invitación generada en el flujo operativo" },
        ],
        operatorActivity: [
          {
            time: createdAt,
            action: "Invitación generada",
            operator: input.holderName || "Operación",
            reason: "Alta en Reservations",
          },
        ],
        qrStatus: "Válido" as const,
        manualAdmission: false,
        attention: guestDraft.vip ? "Invitado VIP" : undefined,
        recentChange: true,
      };
    })
    .map((guest, index, list) => ({
      ...guest,
      invitationSequence: `${index + 1} de ${list.length}`,
    }));

  reservation.guestIds = guests.map((guest) => guest.id);
  reservation.timeline.push(
    buildTimelineEntry("Invitaciones enviadas", `${guests.length} invitados quedaron registrados.`, "info", createdAt),
  );

  return {
    reservation,
    guests,
  };
}

export function updateReservationStatusFromGuests(
  reservation: ReservationRecord,
  guests: Guest[],
) {
  const status = inferReservationStatus(guests, reservation.status);

  return {
    ...reservation,
    status,
    updatedAt: createTimeStamp(),
  };
}
