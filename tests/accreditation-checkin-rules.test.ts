import assert from "node:assert/strict";
import test from "node:test";

import {
  AccreditationCheckInValidationError,
  evaluateAccreditationCheckIn,
  normalizeAccreditationCheckInSource,
} from "../features/accreditation/check-in";

test("check-in source normalizes to qr or manual_code only", () => {
  assert.equal(normalizeAccreditationCheckInSource("qr"), "qr");
  assert.equal(normalizeAccreditationCheckInSource("manual_code"), "manual_code");
  assert.throws(() => normalizeAccreditationCheckInSource("manual"), AccreditationCheckInValidationError);
});

test("active access with no prior check-in is valid", () => {
  const evaluation = evaluateAccreditationCheckIn({
    scope: {
      organizationId: "org-1",
      eventId: "event-1",
    },
    access: {
      grantId: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      enrollmentId: "enrollment-1",
      isValid: true,
    },
  });

  assert.equal(evaluation.isValid, true);
  assert.equal(evaluation.invalidReason, undefined);
});

test("missing grant, scope mismatch, revocation, cancellation and duplicate check-ins are rejected", () => {
  const scopeMismatch = evaluateAccreditationCheckIn({
    scope: {
      organizationId: "org-1",
      eventId: "event-1",
    },
    access: {
      grantId: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      enrollmentId: "enrollment-1",
      isValid: false,
      invalidReason: "wrong_scope",
    },
  });

  const revoked = evaluateAccreditationCheckIn({
    scope: {
      organizationId: "org-1",
      eventId: "event-1",
    },
    access: {
      grantId: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      enrollmentId: "enrollment-1",
      isValid: false,
      invalidReason: "revoked",
    },
  });

  const cancelled = evaluateAccreditationCheckIn({
    scope: {
      organizationId: "org-1",
      eventId: "event-1",
    },
    access: {
      grantId: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      enrollmentId: "enrollment-1",
      isValid: false,
      invalidReason: "enrollment_cancelled",
    },
  });

  const duplicate = evaluateAccreditationCheckIn({
    scope: {
      organizationId: "org-1",
      eventId: "event-1",
    },
    access: {
      grantId: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      enrollmentId: "enrollment-1",
      isValid: true,
    },
    existingCheckIn: {
      accessGrantId: "grant-1",
    },
  });

  const missing = evaluateAccreditationCheckIn({
    scope: {
      organizationId: "org-1",
      eventId: "event-1",
    },
    access: null,
  });

  assert.equal(scopeMismatch.invalidReason, "wrong_scope");
  assert.equal(revoked.invalidReason, "grant_revoked");
  assert.equal(cancelled.invalidReason, "enrollment_cancelled");
  assert.equal(duplicate.invalidReason, "already_checked_in");
  assert.equal(missing.invalidReason, "grant_not_found");
});
