import assert from "node:assert/strict";
import test from "node:test";

import { formatDateOnly, formatEventWallDateTime, formatTime, formatTimestamp } from "../lib/date-time";

test("formats persisted instants in the event timezone", () => {
  assert.equal(formatTimestamp("2026-10-05T05:11:15.739797+00:00", "Etc/GMT+4"), "5 oct 2026 · 01:11");
});

test("handles timezone date crossing midnight", () => {
  assert.equal(formatTimestamp("2026-10-05T01:11:15.000Z", "America/La_Paz"), "4 oct 2026 · 21:11");
});

test("preserves date-only and event wall time without timezone shifting", () => {
  assert.equal(formatDateOnly("2026-10-22"), "22 oct 2026");
  assert.equal(formatEventWallDateTime("2026-10-22 21:00"), "22 oct 2026 · 21:00");
  assert.equal(formatTime("21:00"), "21:00");
});

test("fails safely for invalid temporal values", () => {
  assert.equal(formatTimestamp("invalid", "America/La_Paz"), "—");
  assert.equal(formatDateOnly("invalid"), "invalid");
});
