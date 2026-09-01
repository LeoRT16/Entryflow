import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccreditationSectorAccessAttempt,
  evaluateAccreditationSectorAccess,
  normalizeAccreditationSectorAccessAttemptSource,
} from "../features/accreditation/sector-access";

const scope = { organizationId: "org-1", eventId: "event-1" };
const grant = { id: "grant-1", organizationId: "org-1", eventId: "event-1", enrollmentId: "enrollment-1", status: "active" as const };
const enrollment = { id: "enrollment-1", organizationId: "org-1", eventId: "event-1", status: "active" as const };
const sector = { id: "sector-1", organizationId: "org-1", eventId: "event-1", status: "active" as const };
const entitlement = { accessGrantId: "grant-1", sectorId: "sector-1", organizationId: "org-1", eventId: "event-1", status: "active" as const };

type EvaluationOverrides = Partial<Omit<Parameters<typeof evaluateAccreditationSectorAccess>[0], "scope">>;

function evaluate(overrides: EvaluationOverrides = {}) {
  return evaluateAccreditationSectorAccess({ scope, grant, enrollment, sector, entitlements: [entitlement], ...overrides });
}

test("sector evaluation allows only an active matching entitlement", () => {
  assert.deepEqual(evaluate(), { allowed: true });
  assert.deepEqual(evaluate({ entitlements: [] }), { allowed: false, reason: "no_sector_entitlement" });
  assert.deepEqual(evaluate({ entitlements: [{ ...entitlement, status: "revoked" }] }), { allowed: false, reason: "entitlement_revoked" });
});

test("sector evaluation denies every required invalid state deterministically", () => {
  assert.equal(evaluate({ grant: null }).reason, "grant_not_found");
  assert.equal(evaluate({ grant: { ...grant, organizationId: "org-2" } }).reason, "wrong_scope");
  assert.equal(evaluate({ grant: { ...grant, eventId: "event-2" } }).reason, "wrong_scope");
  assert.equal(evaluate({ enrollment: { ...enrollment, status: "cancelled" } }).reason, "enrollment_cancelled");
  assert.equal(evaluate({ grant: { ...grant, status: "revoked" } }).reason, "grant_revoked");
  assert.equal(evaluate({ sector: { ...sector, status: "inactive" } }).reason, "sector_inactive");
  assert.equal(evaluate({ sector: null }).reason, "sector_not_found");
});

test("audit attempts preserve operator, source, references, and allow/deny history", () => {
  assert.equal(normalizeAccreditationSectorAccessAttemptSource("qr"), "qr");
  assert.equal(normalizeAccreditationSectorAccessAttemptSource("manual_code"), "manual_code");
  assert.equal(normalizeAccreditationSectorAccessAttemptSource("manual_operator"), "manual_operator");

  const allowed = buildAccreditationSectorAccessAttempt(
    {
      organizationId: "org-1",
      eventId: "event-1",
      accessGrantId: "grant-1",
      enrollmentId: "enrollment-1",
      sectorId: "sector-1",
      operatorProfileId: "profile-1",
      source: "qr",
      credentialReference: "acc1_token",
      sectorReference: "sector-1",
      decision: "allow",
    },
    { allowed: true },
    () => "2026-08-31T12:00:00.000Z",
  );
  const denied = buildAccreditationSectorAccessAttempt(
    {
      organizationId: "org-1",
      eventId: "event-1",
      accessGrantId: null,
      enrollmentId: null,
      sectorId: "sector-1",
      operatorProfileId: "profile-1",
      source: "manual_operator",
      credentialReference: "unknown",
      sectorReference: "sector-1",
      decision: "deny",
      denialReason: "grant_not_found",
    },
    { allowed: false, reason: "grant_not_found" },
    () => "2026-08-31T12:01:00.000Z",
  );

  assert.equal(allowed.decision, "allow");
  assert.equal(allowed.operatorProfileId, "profile-1");
  assert.equal(allowed.credentialReference, "acc1_token");
  assert.equal(denied.decision, "deny");
  assert.equal(denied.denialReason, "grant_not_found");
  assert.equal(denied.accessGrantId, null);
  assert.throws(() => buildAccreditationSectorAccessAttempt(allowed, { allowed: true, reason: "grant_not_found" }));
});
