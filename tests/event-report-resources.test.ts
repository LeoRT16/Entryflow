import assert from "node:assert/strict";
import test from "node:test";

import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

test("Resource and Zone reports reproduce Mesa 1, Mesa 2 and Patio control totals", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const mesa1 = report.resources.find((resource) => resource.resourceId === "layout-mesa-1");
  const mesa2 = report.resources.find((resource) => resource.resourceId === "layout-mesa-2");
  const patio = report.zones.find((zone) => zone.sectorId === "layout-sector-patio");

  assert.deepEqual({
    name: mesa1?.resourceName,
    capacity: mesa1?.physicalCapacity,
    assigned: mesa1?.capacityAssigned,
    base: mesa1?.baseAccesses,
    extras: mesa1?.extraWristbands,
    operational: mesa1?.operationalPeople,
    checkedIn: mesa1?.checkedInPeople,
    pending: mesa1?.pendingPeople,
    reservation: mesa1?.soldReservationValue.amount,
    extraValue: mesa1?.extraWristbandValue.amount,
    total: mesa1?.soldTotal.amount,
  }, { name: "Mesa 1", capacity: 5, assigned: 5, base: 5, extras: 2, operational: 7, checkedIn: 3, pending: 4, reservation: 400, extraValue: 120, total: 520 });
  assert.deepEqual({
    name: mesa2?.resourceName,
    capacity: mesa2?.physicalCapacity,
    assigned: mesa2?.capacityAssigned,
    base: mesa2?.baseAccesses,
    extras: mesa2?.extraWristbands,
    operational: mesa2?.operationalPeople,
    checkedIn: mesa2?.checkedInPeople,
    pending: mesa2?.pendingPeople,
    reservation: mesa2?.soldReservationValue.amount,
    total: mesa2?.soldTotal.amount,
  }, { name: "Mesa 2", capacity: 5, assigned: 2, base: 2, extras: 0, operational: 2, checkedIn: 0, pending: 2, reservation: 400, total: 400 });
  assert.deepEqual({
    resources: patio?.resourceCount,
    capacity: patio?.physicalCapacity,
    assigned: patio?.capacityAssigned,
    base: patio?.baseAccesses,
    extras: patio?.extraWristbands,
    operational: patio?.operationalPeople,
    checkedIn: patio?.checkedInPeople,
    pending: patio?.pendingPeople,
    reservation: patio?.soldReservationValue.amount,
    extraValue: patio?.extraWristbandValue.amount,
    total: patio?.soldTotal.amount,
  }, { resources: 2, capacity: 10, assigned: 7, base: 7, extras: 2, operational: 9, checkedIn: 3, pending: 6, reservation: 800, extraValue: 120, total: 920 });
  assert.equal(report.commercial.sold.total.amount, 1120);
});

test("event layout identity wins over renamed current Resource and persisted labels", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const mesa1 = report.resources.find((resource) => resource.resourceId === "layout-mesa-1");

  assert.equal(mesa1?.resourceName, "Mesa 1");
  assert.equal(mesa1?.sectorName, "Patio");
  assert.equal(mesa1?.physicalCapacity, 5);
});

test("two Resources with the same name remain separate by ID", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.eventLayoutResources[1]!.name = "Mesa 1";
  const report = buildEventReport(input);

  assert.equal(report.resources.filter((resource) => resource.resourceName === "Mesa 1").length, 2);
  assert.deepEqual(new Set(report.resources.map((resource) => resource.resourceId)).size, 2);
});

test("missing Sector preserves the Resource and emits a diagnostic without a synthetic Zone", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.eventLayoutSectors = [];
  const report = buildEventReport(input);

  assert.equal(report.resources.length, 2);
  assert.equal(report.zones.length, 0);
  assert.equal(report.diagnostics.some((item) => item.code === "historical_sector_unresolved"), true);
});

test("persisted Reservation identity resolves a Resource unavailable from current catalogs", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.eventLayouts = [];
  input.eventLayoutResources = [];
  input.eventLayoutSectors = [];
  input.resources = [];
  for (const reservation of input.reservations.filter((item) => item.reservationType === "Mesa")) {
    reservation.eventLayoutId = undefined;
    reservation.eventLayoutResourceId = undefined;
  }
  const report = buildEventReport(input);

  assert.equal(report.resources.find((resource) => resource.resourceId === "mesa-1")?.resourceName, "Mesa 1 persistida");
  assert.equal(report.resources.find((resource) => resource.resourceId === "mesa-1")?.physicalCapacity, 5);
});

test("cancelled Reservation stays linked historically but contributes no people or sold value", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((item) => item.id === "mesa-active")!.status = "Cancelled";
  const report = buildEventReport(input);
  const mesa1 = report.resources.find((resource) => resource.resourceId === "layout-mesa-1");

  assert.equal(mesa1?.reservationIds.includes("mesa-active"), true);
  assert.equal(mesa1?.historicalPeople, 7);
  assert.equal(mesa1?.operationalPeople, 0);
  assert.equal(mesa1?.soldReservationValue.amount, 0);
  assert.equal(mesa1?.extraWristbandValue.amount, 0);
});

test("Completed Reservation remains sold and a reused Resource preserves multiple histories", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((item) => item.id === "mesa-active")!.status = "Completed";
  const reused = structuredClone(input.reservations.find((item) => item.id === "mesa-active")!);
  reused.id = "mesa-reused";
  reused.code = "M-REUSED";
  reused.status = "Confirmed";
  reused.commercialSnapshot!.reservationPrice = 100;
  input.reservations.push(reused);
  const report = buildEventReport(input);
  const mesa1 = report.resources.find((resource) => resource.resourceId === "layout-mesa-1");

  assert.equal(mesa1?.reservationCount, 2);
  assert.deepEqual(mesa1?.reservationIds, ["mesa-active", "mesa-reused"]);
  assert.equal(mesa1?.activeReservationId, "mesa-reused");
  assert.equal(mesa1?.soldReservationValue.amount, 500);
});

test("cancelled sales and cancelled extra Guests never inflate operational extras", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.guests.find((guest) => guest.id === "guest-17")!.admissionStatus = "Anulada";
  input.guests.find((guest) => guest.id === "guest-17")!.reservationStatus = "Cancelled";
  const report = buildEventReport(input);
  const mesa1 = report.resources.find((resource) => resource.resourceId === "layout-mesa-1");

  assert.equal(mesa1?.extraWristbands, 1);
  assert.equal(mesa1?.extraWristbandValue.amount, 120);
  assert.equal(mesa1?.historicalPeople, 7);
  assert.equal(report.historical.cancelledExtraWristbandSaleIds.includes("extra-cancelled"), true);
});

test("mixed Resource currencies and missing Mesa snapshots stay incomplete with diagnostics", () => {
  const mixedInput = structuredClone(buildEventReportFixtureInput());
  mixedInput.extraWristbandSales[0]!.currency = "USD";
  const mixed = buildEventReport(mixedInput);
  const mixedMesa = mixed.resources.find((resource) => resource.resourceId === "layout-mesa-1");
  assert.deepEqual(mixedMesa?.soldTotal, { currency: null, amount: null, complete: false, currencies: ["BOB", "USD"] });
  assert.equal(mixedMesa?.diagnostics.some((item) => item.code === "commercial_currency_mixed"), true);

  const missingInput = structuredClone(buildEventReportFixtureInput());
  missingInput.reservations.find((item) => item.id === "mesa-active")!.commercialSnapshot = undefined;
  const missing = buildEventReport(missingInput);
  const missingMesa = missing.resources.find((resource) => resource.resourceId === "layout-mesa-1");
  assert.equal(missingMesa?.soldReservationValue.amount, null);
  assert.equal(missingMesa?.soldTotal.amount, null);
  assert.equal(missingMesa?.diagnostics.some((item) => item.code === "commercial_snapshot_missing"), true);
});

test("Reservation without any Resource identity emits unresolved and does not create a fake Resource", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  const reservation = input.reservations.find((item) => item.id === "mesa-active")!;
  reservation.eventLayoutResourceId = undefined;
  reservation.resourceId = undefined;
  reservation.resourceName = undefined;
  reservation.tableId = undefined;
  reservation.tableName = "";
  const report = buildEventReport(input);

  assert.equal(report.diagnostics.some((item) => item.code === "historical_resource_unresolved" && item.entityId === reservation.id), true);
  assert.equal(report.resources.some((resource) => resource.reservationIds.includes(reservation.id)), false);
});

test("zero capacity remains zero and never uses a fallback capacity", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.eventLayoutResources[0]!.capacity = 0;
  const report = buildEventReport(input);

  assert.equal(report.resources.find((resource) => resource.resourceId === "layout-mesa-1")?.physicalCapacity, 0);
});
