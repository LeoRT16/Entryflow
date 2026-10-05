import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceIntelligence } from "../domain/workspace-intelligence";
import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildStatisticsViewModel, displayMoney } from "../features/reporting/domain/statistics-view-model";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

function intelligence(): Pick<WorkspaceIntelligence, "statistics"> {
  return {
    statistics: {
      cards: {
        checkInsPerMinute: 2,
        averageCheckInIntervalMinutes: 1.5,
      },
    } as WorkspaceIntelligence["statistics"],
  };
}

test("Statistics via EventReport reproduces people, commercial and physical capacity facts", () => {
  const model = buildStatisticsViewModel(buildEventReport(buildEventReportFixtureInput()), intelligence());

  assert.deepEqual(
    [model.summary.operationalPeople, model.summary.checkedInPeople, model.summary.pendingPeople],
    [17, 6, 11],
  );
  assert.equal(model.commercial.total.amount, 1120);
  assert.deepEqual(model.capacity, { physicalCapacity: 10, capacityAssigned: 7, capacityRemaining: 3, occupancyPercent: 70 });
  assert.equal(model.commercial.courtesies.people, 4);
});

test("cancelled courtesy people do not contaminate operational Statistics", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((reservation) => reservation.id === "courtesy-active")!.status = "Cancelled";
  const model = buildStatisticsViewModel(buildEventReport(input), intelligence());

  assert.equal(model.summary.activeCourtesyPeople, 0);
  assert.equal(model.commercial.courtesies.people, 0);
  assert.equal(model.commercial.courtesies.value.amount, 0);
});

test("Completed and No Show reservations remain in the historical sold total", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((reservation) => reservation.id === "mesa-active")!.status = "Completed";
  input.reservations.find((reservation) => reservation.id === "mesa-second")!.status = "No Show";
  const model = buildStatisticsViewModel(buildEventReport(input), intelligence());

  assert.equal(model.commercial.mesas.value.amount, 800);
  assert.equal(model.commercial.total.amount, 1120);
});

test("mixed currencies and missing snapshots render as incomplete instead of false totals", () => {
  const mixedInput = structuredClone(buildEventReportFixtureInput());
  mixedInput.reservations.find((reservation) => reservation.id === "presale-individual")!.commercialSnapshot!.currency = "USD";
  const mixed = buildStatisticsViewModel(buildEventReport(mixedInput), intelligence());
  assert.equal(mixed.diagnostics.mixedCurrencies, true);
  assert.equal(displayMoney(mixed.commercial.total), "Datos incompletos");

  const missingInput = structuredClone(buildEventReportFixtureInput());
  missingInput.reservations.find((reservation) => reservation.id === "mesa-active")!.commercialSnapshot = undefined;
  const missing = buildStatisticsViewModel(buildEventReport(missingInput), intelligence());
  assert.equal(missing.diagnostics.commercialIncomplete, true);
  assert.equal(displayMoney(missing.commercial.total), "Datos incompletos");
});

test("BOB is presented as Bs without changing the money model", () => {
  assert.equal(displayMoney({ currency: "BOB", amount: 1520, complete: true, currencies: ["BOB"] }), "Bs 1.520");
});

test("Statistics follows physical Guest location while preserving commercial ownership", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.guests.find((guest) => guest.id === "guest-1")!.tableId = "layout-mesa-2";
  input.guests.find((guest) => guest.id === "guest-8")!.tableId = "layout-mesa-2";
  const report = buildEventReport(input);
  const model = buildStatisticsViewModel(report, intelligence());
  const mesa1 = model.resources.find((resource) => resource.resourceId === "layout-mesa-1")!;
  const mesa2 = model.resources.find((resource) => resource.resourceId === "layout-mesa-2")!;

  assert.equal(mesa1.capacityAssigned, 4);
  assert.equal(mesa2.capacityAssigned, 4);
  assert.equal(model.commercial.total.amount, 1120);
  assert.equal(report.reservations.find((reservation) => reservation.id === "mesa-active")?.resourceId, "layout-mesa-1");
  assert.equal(report.reservations.find((reservation) => reservation.id === "presale-individual")?.resourceId, null);
});
