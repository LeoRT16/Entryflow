import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccreditationAccessDto,
  evaluateAccreditationAccessValidity,
  normalizeAccreditationAccessCode,
  normalizeAccreditationAccessStatus,
  normalizeAccreditationQrToken,
  AccreditationAccessValidationError,
} from "../features/accreditation/access";

test("access status normalizes to active and revoked only", () => {
  assert.equal(normalizeAccreditationAccessStatus("active"), "active");
  assert.equal(normalizeAccreditationAccessStatus("revoked"), "revoked");
  assert.throws(() => normalizeAccreditationAccessStatus("pending"), AccreditationAccessValidationError);
});

test("access code and qr token normalization stays exact and canonical", () => {
  assert.equal(normalizeAccreditationAccessCode(" acc-7k4d-9m2q "), "ACC-7K4D-9M2Q");
  assert.equal(normalizeAccreditationQrToken(" ACC1_ABC "), "acc1_abc");
});

test("access validity is derived from scope, grant state, and enrollment status", () => {
  const scope = { organizationId: "org-1", eventId: "event-1" };

  const valid = evaluateAccreditationAccessValidity({
    scope,
    grant: {
      organizationId: "org-1",
      eventId: "event-1",
      status: "active",
      enrollmentId: "enrollment-1",
    },
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-1",
      eventId: "event-1",
      status: "active",
    },
  });

  const revoked = evaluateAccreditationAccessValidity({
    scope,
    grant: {
      organizationId: "org-1",
      eventId: "event-1",
      status: "revoked",
      enrollmentId: "enrollment-1",
    },
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-1",
      eventId: "event-1",
      status: "active",
    },
  });

  const cancelled = evaluateAccreditationAccessValidity({
    scope,
    grant: {
      organizationId: "org-1",
      eventId: "event-1",
      status: "active",
      enrollmentId: "enrollment-1",
    },
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-1",
      eventId: "event-1",
      status: "cancelled",
    },
  });

  const wrongScope = evaluateAccreditationAccessValidity({
    scope,
    grant: {
      organizationId: "org-2",
      eventId: "event-1",
      status: "active",
      enrollmentId: "enrollment-1",
    },
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-2",
      eventId: "event-1",
      status: "active",
    },
  });

  assert.equal(valid.isValid, true);
  assert.equal(revoked.invalidReason, "revoked");
  assert.equal(cancelled.invalidReason, "enrollment_cancelled");
  assert.equal(wrongScope.invalidReason, "wrong_scope");
});

test("access dto preserves the stable future shape", () => {
  const dto = buildAccreditationAccessDto({
    scope: { organizationId: "org-1", eventId: "event-1" },
    grant: {
      id: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      enrollmentId: "enrollment-1",
      accessCode: "ACC-7K4D-9M2Q",
      qrToken: "acc1_1234",
      status: "active",
    },
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-1",
      eventId: "event-1",
      name: "Leonardo Rodríguez",
      status: "active",
    },
  });

  assert.deepEqual(dto, {
    grantId: "grant-1",
    enrollmentId: "enrollment-1",
    organizationId: "org-1",
    eventId: "event-1",
    displayName: "Leonardo Rodríguez",
    accessCode: "ACC-7K4D-9M2Q",
    qrToken: "acc1_1234",
    isValid: true,
    invalidReason: undefined,
  });
});
