import assert from "node:assert/strict";
import test from "node:test";

import {
  createReservationCommercialSnapshot,
  defaultEventCommercialConfig,
  getEventCommercialConfig,
  mergeEventCommercialConfig,
  normalizeCommercialBenefits,
} from "../features/events/domain/commercial-config";

test("commercial event config merges without removing unrelated metadata", () => {
  const metadata = { blueprint: "nightlife", invitation: { theme: "gold" } };
  const config = { ...defaultEventCommercialConfig, reservation: { ...defaultEventCommercialConfig.reservation, basePrice: 400 } };
  const merged = mergeEventCommercialConfig(metadata, config);

  assert.deepEqual(merged.blueprint, "nightlife");
  assert.deepEqual(merged.invitation, { theme: "gold" });
  assert.equal((merged.commercial as typeof config).reservation.basePrice, 400);
});

test("new reservations snapshot the current commercial event config", () => {
  const config = { ...defaultEventCommercialConfig, reservation: { ...defaultEventCommercialConfig.reservation, basePrice: 400, includedAccesses: 5, benefits: [{ id: "bottle", label: "Botella", quantity: 1 }] } };
  const snapshot = createReservationCommercialSnapshot(config);

  assert.deepEqual(snapshot, { version: 1, currency: "BOB", reservationPrice: 400, includedAccesses: 5, benefits: [{ id: "bottle", label: "Botella", quantity: 1 }] });
  config.reservation.basePrice = 500;
  assert.equal(snapshot.reservationPrice, 400);
});

test("a later event price produces a separate snapshot", () => {
  const first = createReservationCommercialSnapshot({ ...defaultEventCommercialConfig, reservation: { ...defaultEventCommercialConfig.reservation, basePrice: 400 } });
  const second = createReservationCommercialSnapshot({ ...defaultEventCommercialConfig, reservation: { ...defaultEventCommercialConfig.reservation, basePrice: 500 } });

  assert.equal(first.reservationPrice, 400);
  assert.equal(second.reservationPrice, 500);
});

test("included accesses remain separate from physical resource capacity", () => {
  const snapshot = createReservationCommercialSnapshot({ ...defaultEventCommercialConfig, reservation: { ...defaultEventCommercialConfig.reservation, includedAccesses: 5 } });

  assert.equal(snapshot.includedAccesses, 5);
  assert.equal(8, 8);
});

test("missing commercial snapshot remains valid for historical reservations", () => {
  const config = getEventCommercialConfig({ metadata: undefined });

  assert.equal(config.currency, "BOB");
  assert.deepEqual(normalizeCommercialBenefits(undefined), []);
});

test("benefit ids are normalized and made unique", () => {
  assert.deepEqual(normalizeCommercialBenefits([{ label: "Botella", quantity: 1 }, { label: "Botella", quantity: 2 }]), [
    { id: "botella-1", label: "Botella", quantity: 1 },
    { id: "botella-2", label: "Botella", quantity: 2 },
  ]);
});
