import assert from "node:assert/strict";
import test from "node:test";

import { toEventDateTimeInputValue } from "../features/events/domain/event-date-time";

test("event editor adapts canonical local datetime text to datetime-local input", () => {
  assert.equal(toEventDateTimeInputValue("2026-08-29 21:00", "America/La_Paz"), "2026-08-29T21:00");
  assert.equal(toEventDateTimeInputValue("2026-08-29T21:00", "America/La_Paz"), "2026-08-29T21:00");
});

test("event editor displays zoned instants in the event timezone", () => {
  assert.equal(toEventDateTimeInputValue("2026-08-30T03:00:00Z", "America/La_Paz"), "2026-08-29T23:00");
});

test("legacy localized event date stays blank so it must be deliberately normalized", () => {
  assert.equal(toEventDateTimeInputValue("29 de agosto de 2026 21:00", "America/La_Paz"), "");
});
