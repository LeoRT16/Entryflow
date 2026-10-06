import assert from "node:assert/strict";
import test from "node:test";
import { validateEventClockInput, validateEventForPersistence } from "../features/events/domain/event-validation";
import type { Event } from "../features/domain/types";

const base: Event = { id: "e", organizationId: "o", name: "Evento", eventType: "nightlife", status: "published", startAt: "2026-10-20 21:00", endAt: "2026-10-21 03:00", timezone: "America/La_Paz", venueId: "v", venue: "Venue", capacity: 100, enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity"], operationalModel: "mixed", admissionMethods: ["qr"], resourceTypes: ["table"] };

test("event validation rejects blank names and malformed date/time before persistence", () => {
  assert.ok(validateEventClockInput({ name: "  ", date: "2026-99-99", startTime: "25:90", endTime: "bad", timezone: "America/La_Paz", capacity: "10", eventType: "nightlife" }).length >= 3);
});

test("event validation preserves valid timezone and overnight local end times", () => {
  assert.deepEqual(validateEventClockInput({ name: "Evento", date: "2026-10-20", startTime: "21:00", endTime: "03:00", timezone: "America/La_Paz", capacity: "10", eventType: "nightlife" }), []);
});

test("event persistence validation enforces canonical venue ownership and blueprint modules", () => {
  assert.deepEqual(validateEventForPersistence(base, [{ id: "v", organizationId: "o", name: "Venue", status: "active", createdAt: "", updatedAt: "" }]), []);
  assert.match(validateEventForPersistence({ ...base, venueId: "other" }, []).join(" "), /venue/i);
});
