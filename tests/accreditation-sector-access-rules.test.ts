import assert from "node:assert/strict";
import test from "node:test";

import {
  AccreditationSectorAccessValidationError,
  normalizeAccreditationAccessEntitlementStatus,
  normalizeAccreditationAccessSectorCapacity,
  normalizeAccreditationAccessSectorCode,
  normalizeAccreditationAccessSectorName,
  normalizeAccreditationAccessSectorStatus,
  assertAccreditationAccessSectorScope,
} from "../features/accreditation/sector-access";

test("sector access normalizers accept only the supported states and identifiers", () => {
  assert.equal(normalizeAccreditationAccessSectorStatus("active"), "active");
  assert.equal(normalizeAccreditationAccessSectorStatus("inactive"), "inactive");
  assert.equal(normalizeAccreditationAccessEntitlementStatus("active"), "active");
  assert.equal(normalizeAccreditationAccessEntitlementStatus("revoked"), "revoked");
  assert.equal(normalizeAccreditationAccessSectorName("  VIP  "), "VIP");
  assert.equal(normalizeAccreditationAccessSectorCode("  vip  "), "VIP");
  assert.equal(normalizeAccreditationAccessSectorCapacity("12"), 12);

  assert.throws(() => normalizeAccreditationAccessSectorStatus("pending"), AccreditationSectorAccessValidationError);
  assert.throws(() => normalizeAccreditationAccessSectorName("   "), AccreditationSectorAccessValidationError);
  assert.throws(() => normalizeAccreditationAccessSectorCode("   "), AccreditationSectorAccessValidationError);
  assert.throws(() => normalizeAccreditationAccessSectorCapacity(-1), AccreditationSectorAccessValidationError);
  assert.throws(() => normalizeAccreditationAccessSectorCapacity(1.5), AccreditationSectorAccessValidationError);
});

test("sector scope assertions reject foreign or missing rows", () => {
  assert.doesNotThrow(() =>
    assertAccreditationAccessSectorScope({
      scope: { organizationId: "org-1", eventId: "event-1" },
      sector: { organizationId: "org-1", eventId: "event-1" },
    }),
  );

  assert.throws(
    () =>
      assertAccreditationAccessSectorScope({
        scope: { organizationId: "org-1", eventId: "event-1" },
        sector: { organizationId: "org-2", eventId: "event-1" },
      }),
    AccreditationSectorAccessValidationError,
  );
  assert.throws(
    () =>
      assertAccreditationAccessSectorScope({
        scope: { organizationId: "org-1", eventId: "event-1" },
        sector: null,
      }),
    AccreditationSectorAccessValidationError,
  );
});
