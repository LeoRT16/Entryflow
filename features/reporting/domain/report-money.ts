import { getReservationCommercialSnapshotValue } from "@/features/reservations/domain/commercial-summary";
import type { ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";
import type { ReservationRecord } from "@/features/reservations/types";
import type { MoneyValue } from "@/features/reporting/types";

export function knownMoney(amount: number, currency: string | null): MoneyValue {
  return { currency, amount, complete: true, currencies: currency ? [currency] : [] };
}

export function unknownMoney(currency: string | null = null): MoneyValue {
  return { currency, amount: null, complete: false, currencies: currency ? [currency] : [] };
}

export function combineMoney(values: MoneyValue[]): MoneyValue {
  const currencies = [...new Set(values.flatMap((value) => value.currencies))].sort();
  if (currencies.length > 1) return { currency: null, amount: null, complete: false, currencies };
  const currency = currencies[0] ?? null;
  if (values.some((value) => !value.complete || value.amount === null)) return unknownMoney(currency);
  return knownMoney(values.reduce((total, value) => total + (value.amount ?? 0), 0), currency);
}

export function reservationMoney(reservation: ReservationRecord): MoneyValue {
  if (reservation.reservationType === "Cortesía") return knownMoney(0, null);
  if (reservation.reservationType !== "Mesa" && reservation.reservationType !== "Preventa") return unknownMoney();
  const snapshot = reservation.commercialSnapshot;
  const value = getReservationCommercialSnapshotValue(
    reservation,
    reservation.reservationType === "Preventa" ? "presale" : "reservation",
  );
  return value === null ? unknownMoney(snapshot?.currency ?? null) : knownMoney(value, snapshot?.currency ?? null);
}

export function extraWristbandSaleMoney(sale: ExtraWristbandSale) {
  return knownMoney(sale.totalPrice, sale.currency);
}
