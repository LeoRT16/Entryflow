import type { Guest } from "@/features/check-in/types";
import { normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import type { ReservationRecord } from "@/features/reservations/types";
import type { ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";

type CommercialCategory = {
  reservations: number;
  people: number;
  value: number;
};

export type CommercialSummary = {
  currency: string;
  mesa: CommercialCategory & { includedPeople: number; extraWristbandPeople: number };
  presale: CommercialCategory;
  courtesy: CommercialCategory;
  extraWristbands: { sales: number; people: number; value: number };
  totals: { commercialValue: number; registeredPeople: number };
  diagnostics: { missingHistoricalValue: number; mixedCurrencies: string[] };
};

type BuildCommercialSummaryInput = {
  eventId: string;
  reservations: ReservationRecord[];
  guests: Guest[];
  extraWristbandSales: ExtraWristbandSale[];
  currency?: string;
};

function isCommerciallyRegistered(reservation: ReservationRecord) {
  const status = normalizeReservationStatus(reservation.status);
  return status !== "Cancelled" && status !== "Draft";
}

function isActiveGuest(guest: Guest) {
  return guest.admissionStatus !== "Anulada" && normalizeReservationStatus(guest.reservationStatus) !== "Cancelled";
}

function snapshotValue(reservation: ReservationRecord, saleType: "reservation" | "presale") {
  const snapshot = reservation.commercialSnapshot;
  if (!snapshot || (saleType === "presale" && snapshot.saleType !== "presale")) return null;
  return saleType === "presale" ? snapshot.totalPrice ?? null : snapshot.reservationPrice;
}

export function buildCommercialSummary({
  eventId,
  reservations,
  guests,
  extraWristbandSales,
  currency = "BOB",
}: BuildCommercialSummaryInput): CommercialSummary {
  const eventReservations = reservations.filter((reservation) => reservation.eventId === eventId);
  const validReservations = eventReservations.filter(isCommerciallyRegistered);
  const validReservationIds = new Set(validReservations.map((reservation) => reservation.id));
  const eventGuests = guests.filter((guest) => guest.eventId === eventId && validReservationIds.has(guest.reservationId));
  const activeGuests = eventGuests.filter(isActiveGuest);
  const reservationById = new Map(eventReservations.map((reservation) => [reservation.id, reservation]));
  const activeSales = extraWristbandSales.filter(
    (sale) => sale.eventId === eventId && sale.status === "active" && reservationById.get(sale.reservationId)?.reservationType === "Mesa",
  );
  const activeSaleIds = new Set(activeSales.map((sale) => sale.id));
  const mesaReservations = validReservations.filter((reservation) => reservation.reservationType === "Mesa");
  const presaleReservations = validReservations.filter((reservation) => reservation.reservationType === "Preventa");
  const courtesyReservations = validReservations.filter((reservation) => reservation.reservationType === "Cortesía");
  const diagnostics = { missingHistoricalValue: 0, mixedCurrencies: [] as string[] };
  const currencies = new Set<string>();

  for (const reservation of validReservations) {
    const snapshot = reservation.commercialSnapshot;
    if (snapshot?.currency) currencies.add(snapshot.currency);
    if ((reservation.reservationType === "Mesa" || reservation.reservationType === "Preventa") && snapshotValue(reservation, reservation.reservationType === "Preventa" ? "presale" : "reservation") === null) {
      diagnostics.missingHistoricalValue += 1;
    }
  }
  for (const sale of activeSales) {
    if (sale.currency) currencies.add(sale.currency);
  }

  const effectiveCurrency = currencies.size === 1 ? [...currencies][0] : currency;
  if (currencies.size > 1) diagnostics.mixedCurrencies = [...currencies].sort();
  const canSumValues = currencies.size <= 1;
  const sumReservations = (items: ReservationRecord[], saleType: "reservation" | "presale") =>
    canSumValues
      ? items.reduce((total, reservation) => total + (snapshotValue(reservation, saleType) ?? 0), 0)
      : 0;
  const guestsFor = (reservationIds: Set<string>, predicate?: (guest: Guest) => boolean) =>
    activeGuests.filter((guest) => reservationIds.has(guest.reservationId) && (!predicate || predicate(guest)));
  const mesaIds = new Set(mesaReservations.map((reservation) => reservation.id));
  const presaleIds = new Set(presaleReservations.map((reservation) => reservation.id));
  const courtesyIds = new Set(courtesyReservations.map((reservation) => reservation.id));
  const baseMesaGuests = guestsFor(mesaIds, (guest) => !guest.extraWristbandSaleId);
  const extraGuests = guestsFor(mesaIds, (guest) => Boolean(guest.extraWristbandSaleId && activeSaleIds.has(guest.extraWristbandSaleId)));
  const presaleGuests = guestsFor(presaleIds);
  const courtesyGuests = guestsFor(courtesyIds);
  const registeredGuestIds = new Set(
    activeGuests
      .filter((guest) => !guest.extraWristbandSaleId || activeSaleIds.has(guest.extraWristbandSaleId))
      .map((guest) => guest.id),
  );
  const extraValue = canSumValues ? activeSales.reduce((total, sale) => total + sale.totalPrice, 0) : 0;

  const mesa = {
    reservations: mesaReservations.length,
    people: baseMesaGuests.length + extraGuests.length,
    value: sumReservations(mesaReservations, "reservation"),
    includedPeople: baseMesaGuests.length,
    extraWristbandPeople: extraGuests.length,
  };
  const presale = { reservations: presaleReservations.length, people: presaleGuests.length, value: sumReservations(presaleReservations, "presale") };
  const courtesy = { reservations: courtesyReservations.length, people: courtesyGuests.length, value: 0 };

  return {
    currency: effectiveCurrency,
    mesa,
    presale,
    courtesy,
    extraWristbands: { sales: activeSales.length, people: extraGuests.length, value: extraValue },
    totals: { commercialValue: mesa.value + presale.value + extraValue, registeredPeople: registeredGuestIds.size },
    diagnostics,
  };
}
