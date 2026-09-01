import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAccreditationSectorPresence,
  evaluateAccreditationSectorMovementTransition,
} from "../features/accreditation/sector-access";
import type { AccreditationSectorMovement, AccreditationSectorMovementInput } from "../features/accreditation/sector-access";

const base: AccreditationSectorMovementInput = {
  organizationId: "org-1", eventId: "event-1", accessGrantId: "grant-1", enrollmentId: "enrollment-1", sectorId: "sector-1",
  operatorProfileId: "profile-1", movement: "entry", source: "manual_code", credentialReference: "code", sectorReference: "sector-1",
};
function movement(overrides: Partial<AccreditationSectorMovement> = {}): AccreditationSectorMovement {
  return { id: "movement-1", organizationId: "org-1", eventId: "event-1", accessGrantId: "grant-1", enrollmentId: "enrollment-1", sectorId: "sector-1", operatorProfileId: "profile-1", movement: "entry", source: "manual_code", credentialReference: "code", sectorReference: "sector-1", movedAt: "2026-08-31T12:00:00.000Z", createdAt: "2026-08-31T12:00:00.000Z", ...overrides };
}

test("movement transitions are idempotent and support entry, exit, entry", () => {
  const entry = evaluateAccreditationSectorMovementTransition(base);
  assert.deepEqual(entry, { status: "recorded", inside: true });
  const inside = deriveAccreditationSectorPresence([movement()])[0];
  assert.deepEqual(evaluateAccreditationSectorMovementTransition(base, inside), { status: "already_inside", inside: true });
  const exit = { ...base, movement: "exit" as const };
  assert.deepEqual(evaluateAccreditationSectorMovementTransition(exit, inside), { status: "recorded", inside: false });
  assert.deepEqual(evaluateAccreditationSectorMovementTransition(exit), { status: "already_outside", inside: false });
  assert.deepEqual(evaluateAccreditationSectorMovementTransition(base, { ...inside, inside: false }), { status: "recorded", inside: true });
});

test("presence is independent per sector and uses the latest movement", () => {
  const entries = deriveAccreditationSectorPresence([
    movement({ id: "a", sectorId: "sector-a", movedAt: "2026-08-31T12:00:00.000Z" }),
    movement({ id: "b", sectorId: "sector-b", movedAt: "2026-08-31T12:01:00.000Z" }),
    movement({ id: "c", sectorId: "sector-a", movement: "exit", movedAt: "2026-08-31T12:02:00.000Z" }),
  ]);
  assert.equal(entries.find((item) => item.sectorId === "sector-a")?.inside, false);
  assert.equal(entries.find((item) => item.sectorId === "sector-b")?.inside, true);
  assert.equal(entries.length, 2);
});
