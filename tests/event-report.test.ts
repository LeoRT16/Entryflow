import assert from "node:assert/strict";
import test from "node:test";

import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

test("EventReport reproduces the 17/18/6/11 and BOB 1,120 control fixture", () => {
  const report = buildEventReport(buildEventReportFixtureInput());

  assert.equal(report.version, 1);
  assert.equal(report.summary.operationalPeople, 17);
  assert.equal(report.summary.historicalPeople, 18);
  assert.equal(report.summary.checkedInPeople, 6);
  assert.equal(report.summary.pendingPeople, 11);
  assert.equal(report.summary.activeCourtesyPeople, 4);
  assert.equal(report.summary.activeExtraWristbands, 2);
  assert.deepEqual(report.commercial.sold.mesas.value, { currency: "BOB", amount: 800, complete: true, currencies: ["BOB"] });
  assert.deepEqual(report.commercial.sold.presales.value, { currency: "BOB", amount: 200, complete: true, currencies: ["BOB"] });
  assert.deepEqual(report.commercial.sold.extraWristbands.value, { currency: "BOB", amount: 120, complete: true, currencies: ["BOB"] });
  assert.equal(report.commercial.sold.courtesies.value.amount, 0);
  assert.deepEqual(report.commercial.sold.total, { currency: "BOB", amount: 1120, complete: true, currencies: ["BOB"] });
});

test("cancelled people stay historical without contaminating operations or sold value", () => {
  const report = buildEventReport(buildEventReportFixtureInput());

  assert.deepEqual(report.historical.cancelledAttendeeIds, ["guest-18"]);
  assert.deepEqual(report.historical.cancelledReservationIds, ["cart5-cancelled"]);
  assert.deepEqual(report.historical.cancelledExtraWristbandSaleIds, ["extra-cancelled"]);
  assert.equal(report.attendees.find((item) => item.guestId === "guest-18")?.operational, false);
  assert.equal(report.commercial.sold.total.amount, 1120);
  assert.equal(report.historical.activity[0]?.id, "timeline-1");
  assert.equal(report.historical.activity[0]?.type, "guest.cancelled");
  assert.equal(report.historical.activity[0]?.reason, "Solicitud del titular");
  assert.equal("qrToken" in report.historical.activity[0]!.metadata, false);
});

test("Completed and No Show preserve sold value while staying outside operational commercial value", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((item) => item.id === "mesa-active")!.status = "Completed";
  input.reservations.find((item) => item.id === "mesa-second")!.status = "No Show";
  const report = buildEventReport(input);

  assert.equal(report.commercial.sold.mesas.value.amount, 800);
  assert.equal(report.commercial.operational.mesas.value.amount, 0);
  assert.equal(report.reservations.find((item) => item.id === "mesa-active")?.commercialSold, true);
  assert.equal(report.reservations.find((item) => item.id === "mesa-active")?.operational, false);
  assert.equal(report.reservations.find((item) => item.id === "mesa-second")?.commercialSold, true);
  assert.equal(report.reservations.find((item) => item.id === "mesa-second")?.operational, false);
  assert.deepEqual(report.historical.completedReservationIds, ["mesa-active"]);
  assert.deepEqual(report.historical.noShowReservationIds, ["mesa-second"]);
});

test("Courtesy and attendee reports preserve their explicit semantics", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const courtesy = report.courtesies[0];
  const extraAttendee = report.attendees.find((item) => item.guestId === "guest-16");

  assert.equal(courtesy?.operationalPeople, 4);
  assert.equal(courtesy?.checkedInPeople, 1);
  assert.equal(courtesy?.pendingPeople, 3);
  assert.equal(courtesy?.cancelledPeopleHistorical, 1);
  assert.deepEqual(courtesy?.cancelledAttendeeIds, ["guest-18"]);
  assert.deepEqual(courtesy?.commercialAmount, { currency: null, amount: 0, complete: true, currencies: [] });
  assert.equal(extraAttendee?.accessType, "extra_wristband");
  assert.equal(extraAttendee?.extraWristband, true);
  assert.equal(extraAttendee?.extraWristbandSaleId, "extra-active");
  assert.equal(extraAttendee?.checkInAt, "2026-09-02T22:12:00-04:00");
});

test("ReservationReport exposes canonical identity, resource references and separated totals", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const mesa = report.reservations.find((item) => item.id === "mesa-active");

  assert.equal(mesa?.date, "2026-09-02");
  assert.equal(mesa?.time, "21:00");
  assert.equal(mesa?.resourceId, "layout-mesa-1");
  assert.equal(mesa?.sectorId, "layout-sector-patio");
  assert.equal(mesa?.operationalPeople, 7);
  assert.equal(mesa?.checkedInPeople, 3);
  assert.equal(mesa?.pendingPeople, 4);
  assert.equal(mesa?.cancelledPeople, 0);
  assert.equal(mesa?.soldValue.amount, 400);
  assert.equal(mesa?.extraWristbandValue.amount, 120);
  assert.equal(mesa?.soldTotal.amount, 520);
});

test("missing snapshots are unknown and emit structured diagnostics instead of false zero", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  const target = input.reservations.find((item) => item.id === "mesa-active")!;
  target.commercialSnapshot = undefined;
  const report = buildEventReport(input);

  assert.deepEqual(report.commercial.sold.mesas.value, { currency: "BOB", amount: null, complete: false, currencies: ["BOB"] });
  assert.equal(report.commercial.sold.total.amount, null);
  assert.equal(report.commercial.sold.total.complete, false);
  assert.equal(report.diagnostics.some((item) => item.code === "commercial_snapshot_missing" && item.entityId === target.id), true);
});

test("mixed currencies are not summed and emit an event diagnostic", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((item) => item.id === "presale-individual")!.commercialSnapshot!.currency = "USD";
  const report = buildEventReport(input);

  assert.deepEqual(report.commercial.sold.total, { currency: null, amount: null, complete: false, currencies: ["BOB", "USD"] });
  assert.equal(report.diagnostics.some((item) => item.code === "commercial_currency_mixed"), true);
});

test("Presale keeps purchased quantity separate from currently loaded people", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((item) => item.id === "presale-group")!.commercialSnapshot!.quantity = 5;
  const report = buildEventReport(input);
  const presale = report.presales.find((item) => item.reservationId === "presale-group");

  assert.equal(presale?.quantityPurchased, 5);
  assert.equal(presale?.loadedPeople, 3);
  assert.equal(presale?.remainingToLoad, 2);
  assert.equal(report.diagnostics.some((item) => item.code === "presale_quantity_mismatch"), true);
});

test("individual and group presales retain their commercial and attendance contracts", () => {
  const report = buildEventReport(buildEventReportFixtureInput());
  const individual = report.presales.find((item) => item.reservationId === "presale-individual");
  const group = report.presales.find((item) => item.reservationId === "presale-group");

  assert.deepEqual(
    [individual?.quantityPurchased, individual?.loadedPeople, individual?.checkedInPeople, individual?.pendingPeople, individual?.soldTotal.amount],
    [1, 1, 1, 0, 50],
  );
  assert.deepEqual(
    [group?.quantityPurchased, group?.loadedPeople, group?.checkedInPeople, group?.pendingPeople, group?.soldTotal.amount],
    [3, 3, 1, 2, 150],
  );
});

test("overloaded presales clamp remaining access and emit an explicit diagnostic", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((item) => item.id === "presale-group")!.commercialSnapshot!.quantity = 2;
  const report = buildEventReport(input);
  const presale = report.presales.find((item) => item.reservationId === "presale-group");

  assert.equal(presale?.remainingToLoad, 0);
  assert.equal(presale?.diagnostics.some((item) => item.code === "presale_overloaded"), true);
});

test("cancelled presale guests remain historical and do not count as loaded", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  const guest = input.guests.find((item) => item.id === "guest-11")!;
  guest.admissionStatus = "Anulada";
  guest.reservationStatus = "Cancelled";
  const report = buildEventReport(input);
  const presale = report.presales.find((item) => item.reservationId === "presale-group");

  assert.equal(presale?.loadedPeople, 2);
  assert.equal(presale?.cancelledPeople, 1);
  assert.equal(presale?.remainingToLoad, 1);
});

test("cancelled, completed and no-show presales remain historical without becoming operational", () => {
  for (const status of ["Cancelled", "Completed", "No Show"] as const) {
    const input = structuredClone(buildEventReportFixtureInput());
    input.reservations.find((item) => item.id === "presale-group")!.status = status;
    const report = buildEventReport(input);
    const presale = report.presales.find((item) => item.reservationId === "presale-group");
    assert.equal(presale?.historical, true);
    assert.equal(presale?.operational, false);
  }
});

test("cancelled courtesy and cancelled courtesy guests preserve a zero-value historical record", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.reservations.find((item) => item.id === "courtesy-active")!.status = "Cancelled";
  const report = buildEventReport(input);
  const courtesy = report.courtesies[0];

  assert.equal(courtesy?.operational, false);
  assert.equal(courtesy?.operationalPeople, 0);
  assert.equal(courtesy?.cancelledPeopleHistorical, 1);
  assert.equal(courtesy?.commercialAmount.amount, 0);
});

test("persisted check-ins are preferred and inconsistent states are diagnosed without invented timestamps", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  const guest = input.guests.find((item) => item.id === "guest-10")!;
  input.checkIns.push({ ...input.checkIns[0]!, id: "checkin-guest-10", guestId: guest.id, reservationId: guest.reservationId, checkedInAt: "2026-09-02T22:40:00-04:00" });
  input.checkIns = input.checkIns.filter((item) => item.guestId !== "guest-8");
  delete input.guests.find((item) => item.id === "guest-8")!.checkInTime;
  const report = buildEventReport(input);

  assert.equal(report.attendees.find((item) => item.guestId === "guest-10")?.checkedIn, true);
  assert.equal(report.attendees.find((item) => item.guestId === "guest-10")?.checkInAt, "2026-09-02T22:40:00-04:00");
  assert.equal(report.attendees.find((item) => item.guestId === "guest-8")?.checkInAt, undefined);
  assert.equal(report.diagnostics.some((item) => item.code === "checkin_state_inconsistent" && item.entityId === "guest-10"), true);
  assert.equal(report.diagnostics.some((item) => item.code === "checkin_record_missing" && item.entityId === "guest-8"), true);
});

test("an active check-in for a non-operational guest is preserved as history and diagnosed", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.checkIns.push({ ...input.checkIns[0]!, id: "checkin-guest-18", guestId: "guest-18", reservationId: "courtesy-active" });
  const report = buildEventReport(input);

  assert.equal(report.attendees.find((item) => item.guestId === "guest-18")?.checkedIn, true);
  assert.equal(report.diagnostics.some((item) => item.code === "checkin_state_inconsistent" && item.entityId === "guest-18"), true);
});

test("missing timeline activity stays empty and is never reconstructed from local timelines", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.timelineEvents = [];
  input.reservations[0]!.timeline = [{ id: "local-only", time: "22:00", title: "Local", detail: "Ignore", tone: "info" }];
  assert.deepEqual(buildEventReport(input).historical.activity, []);
});

test("generatedAt is deterministic and buildEventReport does not mutate its inputs", () => {
  const input = buildEventReportFixtureInput();
  const before = structuredClone(input);
  const first = buildEventReport(input);
  const second = buildEventReport(input);

  assert.equal(first.metadata.generatedAt, "2026-09-03T04:00:00.000Z");
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
});
