import assert from "node:assert/strict";
import test from "node:test";

import { buildEventWallClockInterval } from "../features/events/domain/event-date-time";

test("event interval keeps the operational start date for same-day events", () => {
  assert.deepEqual(buildEventWallClockInterval({ date: "2026-10-11", startTime: "18:00", endTime: "23:00" }), {
    startAt: "2026-10-11 18:00", endAt: "2026-10-11 23:00", overnight: false,
  });
});

test("event interval rolls overnight end to the next calendar day", () => {
  for (const [date, startTime, endTime, endDate] of [
    ["2026-10-05", "21:00", "03:00", "2026-10-06"],
    ["2026-10-07", "23:00", "01:00", "2026-10-08"],
    ["2026-12-31", "21:00", "03:00", "2027-01-01"],
  ] as const) {
    assert.equal(buildEventWallClockInterval({ date, startTime, endTime }).endAt, `${endDate} ${endTime}`);
  }
});

test("equal start and end time means a 24 hour overnight interval", () => {
  assert.deepEqual(buildEventWallClockInterval({ date: "2026-10-06", startTime: "20:00", endTime: "20:00" }), {
    startAt: "2026-10-06 20:00", endAt: "2026-10-07 20:00", overnight: true,
  });
});

test("consecutive events retain separate operational dates", () => {
  const first = buildEventWallClockInterval({ date: "2026-10-09", startTime: "21:00", endTime: "03:00" });
  const second = buildEventWallClockInterval({ date: "2026-10-10", startTime: "21:00", endTime: "03:00" });
  assert.equal(first.startAt.slice(0, 10), "2026-10-09");
  assert.equal(second.startAt.slice(0, 10), "2026-10-10");
  assert.notEqual(first.startAt.slice(0, 10), second.startAt.slice(0, 10));
});
