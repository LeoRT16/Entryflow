import test from "node:test";
import assert from "node:assert/strict";

import { resolveOperationalEventId, resolveReloadCurrentEventId } from "../services/workspace-service";
import type { Event } from "../features/domain/types";
import { applyEventActivation } from "../repositories/workspace-repositories";

const event = (id: string, status: Event["status"], organizationId = "org-a"): Event => ({
  id, organizationId, name: id, eventType: "custom", status, startAt: "2026-01-01", timezone: "America/La_Paz", venue: "", capacity: 10,
  enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [],
});

test("Reception and Door resolve the only live event and empty when none is live", () => {
  const events = [event("a", "live"), event("b", "published")];
  assert.equal(resolveOperationalEventId(events, "org-a", "reception", "b"), "a");
  assert.equal(resolveOperationalEventId(events, "org-a", "door", "b"), "a");
  assert.equal(resolveOperationalEventId([event("b", "published")], "org-a", "reception", "b"), "");
});

test("management selection remains personal and unresolved roles do not become operational", () => {
  const events = [event("a", "live"), event("b", "published")];
  assert.equal(resolveOperationalEventId(events, "org-a", "owner", "b"), "b");
  assert.equal(resolveOperationalEventId(events, "org-a", "", "b"), "b");
});

test("reload switches explicit operational roles to the authoritative live event", () => {
  assert.equal(resolveReloadCurrentEventId([event("a", "finished"), event("b", "live")], "org-a", "a", "a", [], "reception"), "b");
  assert.equal(resolveReloadCurrentEventId([event("a", "finished"), event("b", "live")], "org-a", "a", "a", [], "door"), "b");
});

test("reload preserves a management user's personal published selection", () => {
  assert.equal(resolveReloadCurrentEventId([event("a", "live"), event("b", "published")], "org-a", "b", "a", [], "owner"), "b");
});

test("activation replaces only the live event in the target organization", () => {
  const input = [event("a", "live"), event("b", "published"), event("other", "live", "org-b")];
  const next = applyEventActivation(input, "b");
  assert.equal(next.result.previousLiveEventId, "a");
  assert.equal(next.events.find((item) => item.id === "a")?.status, "finished");
  assert.equal(next.events.find((item) => item.id === "b")?.status, "live");
  assert.equal(next.events.find((item) => item.id === "other")?.status, "live");
});

test("activation rejects draft and terminal events", () => {
  for (const status of ["draft", "finished", "cancelled"] as const) {
    assert.throws(() => applyEventActivation([event("target", status)], "target"));
  }
});
