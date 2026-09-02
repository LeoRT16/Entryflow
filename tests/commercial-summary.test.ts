import assert from "node:assert/strict";
import test from "node:test";

import { buildCommercialSummary } from "../features/reservations/domain/commercial-summary";
import type { ReservationCommercialSnapshot } from "../features/events/domain/commercial-config";
import type { Guest } from "../features/check-in/types";
import type { ReservationRecord } from "../features/reservations/types";
import type { ExtraWristbandSale } from "../features/reservations/domain/extra-wristbands";

function reservation(overrides: Partial<ReservationRecord> = {}) {
  return {
    id: overrides.id ?? "reservation-1",
    eventId: overrides.eventId ?? "event-1",
    reservationType: overrides.reservationType ?? "Mesa",
    status: overrides.status ?? "Confirmed",
    commercialSnapshot: overrides.commercialSnapshot,
  } as ReservationRecord;
}

function guest(id: string, reservationId: string, overrides: Partial<Guest> = {}) {
  return {
    id,
    eventId: "event-1",
    reservationId,
    admissionStatus: "Pendiente",
    reservationStatus: "Confirmed",
    extraWristbandSaleId: null,
    ...overrides,
  } as Guest;
}

function sale(overrides: Partial<ExtraWristbandSale> = {}) {
  return {
    id: overrides.id ?? "sale-1",
    reservationId: overrides.reservationId ?? "reservation-1",
    eventId: overrides.eventId ?? "event-1",
    quantity: overrides.quantity ?? 3,
    totalPrice: overrides.totalPrice ?? 150,
    currency: overrides.currency ?? "BOB",
    status: overrides.status ?? "active",
  } as ExtraWristbandSale;
}

const mesaSnapshot: ReservationCommercialSnapshot = { version: 1, currency: "BOB", reservationPrice: 400, includedAccesses: 5, benefits: [] };
const presaleSnapshot: ReservationCommercialSnapshot = { version: 1, saleType: "presale", currency: "BOB", reservationPrice: 80, unitPrice: 80, quantity: 2, totalPrice: 160, includedAccesses: 2, benefits: [] };

test("consolidates Mesa, including Pending, Completed, and No Show, but excludes Cancelled", () => {
  const summary = buildCommercialSummary({
    eventId: "event-1",
    reservations: [
      reservation({ commercialSnapshot: mesaSnapshot }),
      reservation({ id: "completed", status: "Completed", commercialSnapshot: { ...mesaSnapshot, reservationPrice: 500 } }),
      reservation({ id: "no-show", status: "No Show", commercialSnapshot: { ...mesaSnapshot, reservationPrice: 600 } }),
      reservation({ id: "pending", status: "Pending", commercialSnapshot: { ...mesaSnapshot, reservationPrice: 700 } }),
      reservation({ id: "cancelled", status: "Cancelled", commercialSnapshot: { ...mesaSnapshot, reservationPrice: 900 } }),
    ],
    guests: [],
    extraWristbandSales: [],
  });

  assert.equal(summary.mesa.reservations, 4);
  assert.equal(summary.mesa.value, 2200);
});

test("uses historical Presale snapshots and never falls back to the current Event price", () => {
  const summary = buildCommercialSummary({
    eventId: "event-1",
    reservations: [reservation({ reservationType: "Preventa", commercialSnapshot: presaleSnapshot })],
    guests: [guest("presale-1", "reservation-1"), guest("presale-2", "reservation-1")],
    extraWristbandSales: [],
  });

  assert.deepEqual(summary.presale, { reservations: 1, people: 2, value: 160 });
  assert.equal(summary.diagnostics.missingHistoricalValue, 0);
});

test("counts Courtesy operationally with zero commercial value", () => {
  const summary = buildCommercialSummary({
    eventId: "event-1",
    reservations: [reservation({ reservationType: "Cortesía", amount: "400", commercialSnapshot: undefined })],
    guests: [guest("courtesy-1", "reservation-1")],
    extraWristbandSales: [],
  });

  assert.deepEqual(summary.courtesy, { reservations: 1, people: 1, value: 0 });
  assert.equal(summary.totals.commercialValue, 0);
});

test("separates active extra wristbands from physical Mesa capacity and excludes cancelled extras", () => {
  const summary = buildCommercialSummary({
    eventId: "event-1",
    reservations: [reservation({ commercialSnapshot: mesaSnapshot })],
    guests: [
      ...Array.from({ length: 5 }, (_, index) => guest(`base-${index}`, "reservation-1")),
      guest("extra-1", "reservation-1", { extraWristbandSaleId: "sale-active" }),
      guest("extra-2", "reservation-1", { extraWristbandSaleId: "sale-active" }),
      guest("extra-3", "reservation-1", { extraWristbandSaleId: "sale-active" }),
      guest("cancelled-extra", "reservation-1", { extraWristbandSaleId: "sale-cancelled" }),
    ],
    extraWristbandSales: [sale({ id: "sale-active" }), sale({ id: "sale-cancelled", status: "cancelled", totalPrice: 250 })],
  });

  assert.equal(summary.mesa.includedPeople, 5);
  assert.equal(summary.mesa.extraWristbandPeople, 3);
  assert.equal(summary.mesa.people, 8);
  assert.equal(summary.extraWristbands.sales, 1);
  assert.equal(summary.extraWristbands.people, 3);
  assert.equal(summary.extraWristbands.value, 150);
  assert.equal(summary.totals.registeredPeople, 8);
});

test("does not double-count a Guest and does not sum mixed currencies silently", () => {
  const summary = buildCommercialSummary({
    eventId: "event-1",
    reservations: [reservation({ commercialSnapshot: mesaSnapshot }), reservation({ id: "reservation-2", reservationType: "Preventa", commercialSnapshot: { ...presaleSnapshot, currency: "USD" } })],
    guests: [guest("same", "reservation-1"), guest("same", "reservation-2")],
    extraWristbandSales: [],
  });

  assert.equal(summary.totals.registeredPeople, 1);
  assert.equal(summary.totals.commercialValue, 0);
  assert.deepEqual(summary.diagnostics.mixedCurrencies, ["BOB", "USD"]);
});

test("reports missing snapshots without using amount", () => {
  const summary = buildCommercialSummary({
    eventId: "event-1",
    reservations: [reservation({ amount: "999" })],
    guests: [],
    extraWristbandSales: [],
  });

  assert.equal(summary.mesa.value, 0);
  assert.equal(summary.diagnostics.missingHistoricalValue, 1);
});
