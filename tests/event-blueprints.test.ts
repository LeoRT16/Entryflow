import assert from "node:assert/strict";
import test from "node:test";

import { buildEventDraft, getEventBlueprint, getEventBlueprints, getEventModuleLabel } from "../features/events/domain/event-blueprints";

test("event blueprints expose only supported beta event types", () => {
  const types = getEventBlueprints().map((blueprint) => blueprint.eventType);

  assert.equal(types.includes("sports"), false);
  assert.deepEqual(types, ["nightlife", "concert", "festival", "corporate", "conference", "seminar", "workshop", "theatre", "private", "custom"]);
  assert.equal(getEventBlueprint("sports").label, "Deportivo");
});

test("accreditation blueprints include live access checkpoints", () => {
  const concert = getEventBlueprints().find((blueprint) => blueprint.eventType === "concert");

  assert.ok(concert);
  assert.equal(concert.enabledModules.includes("gates"), true);
  assert.equal(concert.futureModules.includes("gates"), false);
  assert.equal(getEventModuleLabel("gates"), "Puntos de acceso");
});

test("new event drafts use the current event date instead of a historical hard-coded date", () => {
  const draft = buildEventDraft(getEventBlueprints().find((blueprint) => blueprint.eventType === "concert")!, "America/La_Paz");

  assert.match(draft.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(draft.date, "8 de agosto de 2026");
});
