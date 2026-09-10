import type { CheckIn, Guest } from "@/features/check-in/types";
import {
  getActiveExtraWristbandSales,
  isCommerciallyRegistered,
} from "@/features/reservations/domain/commercial-summary";
import {
  isOperationalReservationGuest,
  isReservationOperational,
  normalizeReservationStatus,
} from "@/features/reservations/domain/reservation-domain";
import type { ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";
import type { ReservationRecord } from "@/features/reservations/types";
import { createReportDiagnostic, sortReportDiagnostics } from "@/features/reporting/domain/report-diagnostics";
import { buildResourceReports } from "@/features/reporting/domain/resource-report";
import { combineMoney, extraWristbandSaleMoney, knownMoney, reservationMoney, unknownMoney } from "@/features/reporting/domain/report-money";
import type {
  AttendeeReport,
  ActivityReport,
  BuildEventReportInput,
  CommercialReportCategory,
  CommercialReportView,
  CourtesyReport,
  EventReport,
  MoneyValue,
  PresaleReport,
  ReportDiagnostic,
  ReservationReport,
} from "@/features/reporting/types";
import type { TimelineEvent } from "@/features/timeline/types";

function isActiveReservation(reservation: ReservationRecord) {
  return normalizeReservationStatus(reservation.status) !== "Draft" && isReservationOperational(reservation.status);
}

function isCancelledGuest(guest: Guest) {
  return !isOperationalReservationGuest(guest);
}

function category(transactions: number, people: number, values: MoneyValue[]): CommercialReportCategory {
  return { transactions, people, value: combineMoney(values) };
}

function buildCommercialView({
  reservations,
  guests,
  sales,
}: {
  reservations: ReservationRecord[];
  guests: Guest[];
  sales: ExtraWristbandSale[];
}): CommercialReportView {
  const reservationIds = new Set(reservations.map((reservation) => reservation.id));
  const viewGuests = guests.filter((guest) => reservationIds.has(guest.reservationId));
  const mesas = reservations.filter((reservation) => reservation.reservationType === "Mesa");
  const presales = reservations.filter((reservation) => reservation.reservationType === "Preventa");
  const courtesies = reservations.filter((reservation) => reservation.reservationType === "Cortesía");
  const mesaIds = new Set(mesas.map((reservation) => reservation.id));
  const presaleIds = new Set(presales.map((reservation) => reservation.id));
  const courtesyIds = new Set(courtesies.map((reservation) => reservation.id));
  const saleIds = new Set(sales.map((sale) => sale.id));
  const mesaPeople = viewGuests.filter((guest) => mesaIds.has(guest.reservationId) && !guest.extraWristbandSaleId).length;
  const presalePeople = viewGuests.filter((guest) => presaleIds.has(guest.reservationId)).length;
  const courtesyPeople = viewGuests.filter((guest) => courtesyIds.has(guest.reservationId)).length;
  const extraPeople = viewGuests.filter((guest) => Boolean(guest.extraWristbandSaleId && saleIds.has(guest.extraWristbandSaleId))).length;
  const mesaCategory = category(mesas.length, mesaPeople, mesas.map(reservationMoney));
  const presaleCategory = category(presales.length, presalePeople, presales.map(reservationMoney));
  const extraCategory = category(sales.length, extraPeople, sales.map(extraWristbandSaleMoney));
  const courtesyCategory = category(courtesies.length, courtesyPeople, [knownMoney(0, null)]);

  return {
    mesas: mesaCategory,
    presales: presaleCategory,
    extraWristbands: extraCategory,
    courtesies: courtesyCategory,
    total: combineMoney([mesaCategory.value, presaleCategory.value, extraCategory.value, courtesyCategory.value]),
  };
}

function resolveAccessType(guest: Guest, reservation?: ReservationRecord): AttendeeReport["accessType"] {
  if (guest.extraWristbandSaleId) return "extra_wristband";
  if (reservation?.reservationType === "Mesa") return "mesa";
  if (reservation?.reservationType === "Preventa") return "presale";
  if (reservation?.reservationType === "Cortesía") return "courtesy";
  return "other";
}

function isPersistedCheckIn(checkIn: CheckIn | undefined) {
  return Boolean(checkIn && ["Confirmed", "Checked In", "Checked Out"].includes(checkIn.status));
}

function safeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeMetadataValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(password|secret|token|qr)/i.test(key))
        .map(([key, nestedValue]) => [key, safeMetadataValue(nestedValue)]),
    );
  }
  return value;
}

function safeMetadata(metadata: Record<string, unknown> | undefined) {
  return safeMetadataValue(metadata ?? {}) as Record<string, unknown>;
}

function buildActivity(event: TimelineEvent, eventId: string): ActivityReport {
  const metadata = safeMetadata(event.metadata);
  const reason = typeof metadata.reason === "string" ? metadata.reason : null;
  return {
    id: event.id,
    type: event.kind,
    createdAt: event.createdAt ?? null,
    eventId,
    reservationId: event.reservationId ?? null,
    guestId: event.guestId ?? null,
    actor: event.actor ?? null,
    reason,
    label: event.title,
    context: event.context ?? event.description ?? null,
    metadata,
  };
}

export function buildEventReport(input: BuildEventReportInput): EventReport {
  const eventReservations = input.reservations.filter((reservation) => reservation.eventId === input.event.id);
  const reservationById = new Map(eventReservations.map((reservation) => [reservation.id, reservation]));
  const eventGuests = input.guests.filter((guest) => guest.eventId === input.event.id);
  const diagnostics: ReportDiagnostic[] = [];
  const activeReservations = eventReservations.filter(isActiveReservation);
  const activeReservationIds = new Set(activeReservations.map((reservation) => reservation.id));
  const operationalGuests = eventGuests.filter(
    (guest) => activeReservationIds.has(guest.reservationId) && isOperationalReservationGuest(guest),
  );
  const operationalGuestIds = new Set(operationalGuests.map((guest) => guest.id));
  const soldReservations = eventReservations.filter(isCommerciallyRegistered);
  const operationalCommercialReservations = activeReservations.filter(isCommerciallyRegistered);
  const soldSales = getActiveExtraWristbandSales({
    eventId: input.event.id,
    reservations: eventReservations,
    extraWristbandSales: input.extraWristbandSales,
  });
  const operationalSales = soldSales.filter((sale) => activeReservationIds.has(sale.reservationId));
  const resourceReport = buildResourceReports({
    event: input.event,
    venue: input.venue,
    reservations: eventReservations,
    guests: eventGuests,
    operationalGuestIds,
    soldSales,
    resources: input.resources,
    sectors: input.sectors,
    tables: input.tables,
    eventLayouts: input.eventLayouts,
    eventLayoutResources: input.eventLayoutResources,
    eventLayoutSectors: input.eventLayoutSectors,
  });
  diagnostics.push(...resourceReport.diagnostics);

  for (const reservation of soldReservations) {
    if (
      (reservation.reservationType === "Mesa" || reservation.reservationType === "Preventa")
      && reservationMoney(reservation).amount === null
    ) {
      diagnostics.push(createReportDiagnostic({
        code: "commercial_snapshot_missing",
        severity: "error",
        entityType: "reservation",
        entityId: reservation.id,
        message: `No se puede reconstruir el valor vendido de ${reservation.code} sin su snapshot comercial.`,
      }));
    }
  }

  for (const guest of eventGuests) {
    if (!reservationById.has(guest.reservationId)) {
      diagnostics.push(createReportDiagnostic({
        code: "entity_relation_inconsistent",
        severity: "error",
        entityType: "guest",
        entityId: guest.id,
        message: `El invitado ${guest.id} no tiene una reserva del mismo evento disponible.`,
        details: { reservationId: guest.reservationId },
      }));
    }
  }

  const checkInByGuestId = new Map(
    input.checkIns
      .filter((checkIn) => checkIn.eventId === input.event.id)
      .sort((left, right) => left.checkedInAt.localeCompare(right.checkedInAt))
      .map((checkIn) => [checkIn.guestId, checkIn]),
  );

  const isCheckedIn = (guest: Guest) => isPersistedCheckIn(checkInByGuestId.get(guest.id)) || guest.admissionStatus === "Ingresó";

  for (const guest of eventGuests) {
    const persisted = isPersistedCheckIn(checkInByGuestId.get(guest.id));
    const operational = operationalGuestIds.has(guest.id);
    if (guest.admissionStatus === "Ingresó" && !persisted) {
      diagnostics.push(createReportDiagnostic({
        code: "checkin_record_missing",
        severity: "warning",
        entityType: "guest",
        entityId: guest.id,
        message: `El invitado ${guest.id} figura como ingresado sin un check-in persistido.`,
      }));
    }
    if (persisted && (guest.admissionStatus !== "Ingresó" || !operational)) {
      diagnostics.push(createReportDiagnostic({
        code: "checkin_state_inconsistent",
        severity: "warning",
        entityType: "guest",
        entityId: guest.id,
        message: operational
          ? `El check-in persistido de ${guest.id} no coincide con su estado de admisión.`
          : `El invitado no operativo ${guest.id} conserva un check-in activo.`,
        details: { admissionStatus: guest.admissionStatus, operational },
      }));
    }
  }

  const attendees: AttendeeReport[] = eventGuests.map((guest) => {
    const reservation = reservationById.get(guest.reservationId);
    const checkIn = checkInByGuestId.get(guest.id);
    const checkedIn = isCheckedIn(guest);
    return {
      guestId: guest.id,
      name: guest.guestName,
      carnet: guest.carnet,
      whatsapp: guest.whatsapp,
      accessCode: guest.accessCode ?? guest.invitationCode,
      reservationId: guest.reservationId,
      reservationCode: guest.reservationCode,
      accessType: resolveAccessType(guest, reservation),
      operational: operationalGuestIds.has(guest.id),
      admissionStatus: guest.admissionStatus,
      reservationStatus: guest.reservationStatus,
      qrStatus: guest.qrStatus,
      checkedIn,
      ...(checkedIn && (isPersistedCheckIn(checkIn) ? checkIn?.checkedInAt : guest.checkInTime)
        ? { checkInAt: isPersistedCheckIn(checkIn) ? checkIn!.checkedInAt : guest.checkInTime }
        : {}),
      extraWristband: Boolean(guest.extraWristbandSaleId),
      ...(guest.extraWristbandSaleId ? { extraWristbandSaleId: guest.extraWristbandSaleId } : {}),
    };
  });

  const reservations: ReservationReport[] = eventReservations.map((reservation) => {
    const relatedGuests = eventGuests.filter((guest) => guest.reservationId === reservation.id);
    const currentGuests = relatedGuests.filter((guest) => operationalGuestIds.has(guest.id));
    const linkedResource = resourceReport.resources.find((resource) => resource.reservationIds.includes(reservation.id));
    const reservationSales = soldSales.filter((sale) => sale.reservationId === reservation.id);
    const soldValue = isCommerciallyRegistered(reservation) ? reservationMoney(reservation) : knownMoney(0, null);
    const extraWristbandValue = combineMoney(reservationSales.map(extraWristbandSaleMoney));
    return {
      id: reservation.id,
      code: reservation.code,
      type: reservation.reservationType,
      holder: reservation.holderName,
      status: normalizeReservationStatus(reservation.status),
      operational: isActiveReservation(reservation),
      historical: !isActiveReservation(reservation),
      commercialSold: isCommerciallyRegistered(reservation),
      date: reservation.date,
      time: reservation.time,
      resourceId: linkedResource?.resourceId ?? reservation.eventLayoutResourceId ?? reservation.resourceId ?? reservation.tableId ?? null,
      sectorId: linkedResource?.sectorId ?? reservation.sectorId ?? null,
      operationalPeople: currentGuests.length,
      historicalPeople: relatedGuests.length,
      checkedInPeople: currentGuests.filter(isCheckedIn).length,
      pendingPeople: currentGuests.filter((guest) => !isCheckedIn(guest)).length,
      cancelledPeople: relatedGuests.filter(isCancelledGuest).length,
      soldValue,
      extraWristbandValue,
      soldTotal: combineMoney([soldValue, extraWristbandValue]),
      diagnostics: [],
    };
  });

  const presales: PresaleReport[] = eventReservations
    .filter((reservation) => reservation.reservationType === "Preventa")
    .map((reservation) => {
      const guests = operationalGuests.filter((guest) => guest.reservationId === reservation.id);
      const historicalGuests = eventGuests.filter((guest) => guest.reservationId === reservation.id);
      const snapshot = reservation.commercialSnapshot;
      const quantityPurchased = snapshot?.saleType === "presale" && typeof snapshot.quantity === "number" ? snapshot.quantity : null;
      if (quantityPurchased !== null && quantityPurchased !== guests.length) {
        diagnostics.push(createReportDiagnostic({
          code: "presale_quantity_mismatch",
          severity: "warning",
          entityType: "reservation",
          entityId: reservation.id,
          message: `La Preventa ${reservation.code} compró ${quantityPurchased} accesos y tiene ${guests.length} personas operativas cargadas.`,
          details: { quantityPurchased, loadedPeople: guests.length },
        }));
      }
      if (quantityPurchased !== null && guests.length > quantityPurchased) {
        diagnostics.push(createReportDiagnostic({
          code: "presale_overloaded",
          severity: "error",
          entityType: "reservation",
          entityId: reservation.id,
          message: `La Preventa ${reservation.code} excede en ${guests.length - quantityPurchased} sus accesos comprados.`,
          details: { quantityPurchased, loadedPeople: guests.length },
        }));
      }
      return {
        reservationId: reservation.id,
        reservationCode: reservation.code,
        holder: reservation.holderName,
        status: normalizeReservationStatus(reservation.status),
        quantityPurchased,
        loadedPeople: guests.length,
        remainingToLoad: quantityPurchased === null ? null : Math.max(quantityPurchased - guests.length, 0),
        checkedInPeople: guests.filter(isCheckedIn).length,
        pendingPeople: guests.filter((guest) => !isCheckedIn(guest)).length,
        cancelledPeople: historicalGuests.filter(isCancelledGuest).length,
        currency: snapshot?.currency ?? null,
        unitPrice: typeof snapshot?.unitPrice === "number" ? knownMoney(snapshot.unitPrice, snapshot.currency) : unknownMoney(snapshot?.currency ?? null),
        soldTotal: typeof snapshot?.totalPrice === "number" ? knownMoney(snapshot.totalPrice, snapshot.currency) : unknownMoney(snapshot?.currency ?? null),
        operational: isActiveReservation(reservation),
        historical: !isActiveReservation(reservation),
        diagnostics: [],
      };
    });

  const courtesies: CourtesyReport[] = eventReservations
    .filter((reservation) => reservation.reservationType === "Cortesía")
    .map((reservation) => {
      const guests = eventGuests.filter((guest) => guest.reservationId === reservation.id);
      const currentGuests = guests.filter((guest) => operationalGuestIds.has(guest.id));
      return {
        reservationId: reservation.id,
        reservationCode: reservation.code,
        reference: reservation.reference ?? null,
        status: normalizeReservationStatus(reservation.status),
        operational: isActiveReservation(reservation),
        operationalPeople: currentGuests.length,
        checkedInPeople: currentGuests.filter(isCheckedIn).length,
        pendingPeople: currentGuests.filter((guest) => !isCheckedIn(guest)).length,
        cancelledPeopleHistorical: guests.filter(isCancelledGuest).length,
        commercialAmount: knownMoney(0, null),
        attendeeIds: currentGuests.map((guest) => guest.id),
        cancelledAttendeeIds: guests.filter(isCancelledGuest).map((guest) => guest.id),
        diagnostics: [],
      };
    });

  const soldCommercial = buildCommercialView({ reservations: soldReservations, guests: operationalGuests, sales: soldSales });
  const operationalCommercial = buildCommercialView({ reservations: operationalCommercialReservations, guests: operationalGuests, sales: operationalSales });
  const mixedCurrencies = soldCommercial.total.currencies;
  if (mixedCurrencies.length > 1) {
    diagnostics.push(createReportDiagnostic({
      code: "commercial_currency_mixed",
      severity: "error",
      entityType: "event",
      entityId: input.event.id,
      message: `El evento contiene valores comerciales en monedas incompatibles: ${mixedCurrencies.join(", ")}.`,
      details: { currencies: mixedCurrencies.join(",") },
    }));
  }

  const sortedDiagnostics = sortReportDiagnostics(diagnostics);
  const diagnosticsForReservation = (reservationId: string) => sortedDiagnostics.filter(
    (diagnostic) => diagnostic.entityType === "reservation" && diagnostic.entityId === reservationId,
  );

  return {
    version: 1,
    metadata: {
      organizationId: input.organization.id,
      organizationName: input.organization.name,
      eventId: input.event.id,
      eventName: input.event.name,
      eventStatus: input.event.status,
      eventStartAt: input.event.startAt,
      timezone: input.event.timezone,
      ...(input.event.venueId ? { venueId: input.event.venueId } : {}),
      venueName: input.venue?.name ?? input.event.venue,
      generatedAt: input.generatedAt,
    },
    summary: {
      activeReservations: activeReservations.length,
      cancelledReservations: eventReservations.filter((reservation) => normalizeReservationStatus(reservation.status) === "Cancelled").length,
      operationalPeople: operationalGuests.length,
      historicalPeople: eventGuests.length,
      checkedInPeople: operationalGuests.filter(isCheckedIn).length,
      pendingPeople: operationalGuests.filter((guest) => !isCheckedIn(guest)).length,
      activeCourtesyPeople: operationalGuests.filter((guest) => reservationById.get(guest.reservationId)?.reservationType === "Cortesía").length,
      presalePurchases: soldReservations.filter((reservation) => reservation.reservationType === "Preventa").length,
      presaleAccessesSold: soldReservations
        .filter((reservation) => reservation.reservationType === "Preventa")
        .reduce((total, reservation) => total + (reservation.commercialSnapshot?.quantity ?? 0), 0),
      activeExtraWristbands: operationalSales.reduce((total, sale) => total + sale.quantity, 0),
    },
    commercial: { sold: soldCommercial, operational: operationalCommercial },
    zones: resourceReport.zones,
    resources: resourceReport.resources,
    reservations: reservations.map((reservation) => ({
      ...reservation,
      diagnostics: diagnosticsForReservation(reservation.id),
    })),
    presales: presales.map((presale) => ({
      ...presale,
      diagnostics: diagnosticsForReservation(presale.reservationId),
    })),
    courtesies: courtesies.map((courtesy) => ({
      ...courtesy,
      diagnostics: diagnosticsForReservation(courtesy.reservationId),
    })),
    attendees,
    historical: {
      cancelledReservationIds: eventReservations
        .filter((reservation) => normalizeReservationStatus(reservation.status) === "Cancelled")
        .map((reservation) => reservation.id),
      completedReservationIds: eventReservations
        .filter((reservation) => normalizeReservationStatus(reservation.status) === "Completed")
        .map((reservation) => reservation.id),
      noShowReservationIds: eventReservations
        .filter((reservation) => normalizeReservationStatus(reservation.status) === "No Show")
        .map((reservation) => reservation.id),
      cancelledAttendeeIds: eventGuests
        .filter((guest) => isCancelledGuest(guest) || normalizeReservationStatus(reservationById.get(guest.reservationId)?.status ?? "Draft") === "Cancelled")
        .map((guest) => guest.id),
      cancelledExtraWristbandSaleIds: input.extraWristbandSales
        .filter((sale) => sale.eventId === input.event.id && sale.status === "cancelled")
        .map((sale) => sale.id),
      activity: input.timelineEvents
        .filter((event) => event.eventId === input.event.id)
        .map((event) => buildActivity(event, input.event.id)),
    },
    diagnostics: sortedDiagnostics,
  };
}
