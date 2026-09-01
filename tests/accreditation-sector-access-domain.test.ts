import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccreditationAccessEntitlement,
  buildAccreditationAccessSector,
  deactivateAccreditationAccessSector,
  evaluateAccreditationSectorAccess,
  revokeAccreditationAccessEntitlement,
  updateAccreditationAccessSector,
} from "../features/accreditation/sector-access";

test("sector access builders keep identities stable and normalize sector records", () => {
  const sector = buildAccreditationAccessSector(
    {
      organizationId: "org-1",
      eventId: "event-1",
      name: "  Vip Lounge  ",
      code: "  vip  ",
      description: "  Front row  ",
      status: "active",
      capacity: 120,
      sortOrder: 3,
      metadata: { source: "manual" },
    },
    () => "2026-08-27T10:00:00.000Z",
  );

  const updated = updateAccreditationAccessSector(
    sector,
    {
      name: "VIP Lounge Premium",
      status: "inactive",
    },
    () => "2026-08-27T10:10:00.000Z",
  );

  const deactivated = deactivateAccreditationAccessSector(updated, () => "2026-08-27T10:20:00.000Z");

  assert.equal(sector.code, "VIP");
  assert.equal(sector.status, "active");
  assert.equal(sector.deletedAt, null);
  assert.equal(sector.createdAt, "2026-08-27T10:00:00.000Z");
  assert.equal(updated.id, sector.id);
  assert.equal(updated.status, "inactive");
  assert.equal(updated.updatedAt, "2026-08-27T10:10:00.000Z");
  assert.equal(deactivated.status, "inactive");
  assert.equal(deactivated.updatedAt, "2026-08-27T10:20:00.000Z");
});

test("entitlement builders keep credential links stable", () => {
  const entitlement = buildAccreditationAccessEntitlement(
    {
      organizationId: "org-1",
      eventId: "event-1",
      accessGrantId: "grant-1",
      sectorId: "sector-1",
      metadata: { source: "operator" },
    },
    () => "2026-08-27T10:00:00.000Z",
  );

  const revoked = revokeAccreditationAccessEntitlement(entitlement, () => "2026-08-27T10:30:00.000Z");

  assert.equal(entitlement.status, "active");
  assert.equal(entitlement.issuedAt, "2026-08-27T10:00:00.000Z");
  assert.equal(revoked.id, entitlement.id);
  assert.equal(revoked.accessGrantId, "grant-1");
  assert.equal(revoked.sectorId, "sector-1");
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.revokedAt, "2026-08-27T10:30:00.000Z");
});

test("sector access decisions resolve the narrowest allowed reason", () => {
  const scope = { organizationId: "org-1", eventId: "event-1" };
  const grant = {
    id: "grant-1",
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: "enrollment-1",
    status: "active" as const,
  };
  const enrollment = {
    id: "enrollment-1",
    organizationId: "org-1",
    eventId: "event-1",
    status: "active" as const,
  };
  const sector = {
    id: "sector-1",
    organizationId: "org-1",
    eventId: "event-1",
    status: "active" as const,
  };

  const allowed = evaluateAccreditationSectorAccess({
    scope,
    grant,
    enrollment,
    sector,
    entitlements: [{ organizationId: "org-1", eventId: "event-1", accessGrantId: "grant-1", sectorId: "sector-1", status: "active" }],
  });
  const revoked = evaluateAccreditationSectorAccess({
    scope,
    grant,
    enrollment,
    sector,
    entitlements: [{ organizationId: "org-1", eventId: "event-1", accessGrantId: "grant-1", sectorId: "sector-1", status: "revoked" }],
  });
  const missing = evaluateAccreditationSectorAccess({ scope, grant, enrollment, sector, entitlements: [] });
  const inactiveSector = evaluateAccreditationSectorAccess({
    scope,
    grant,
    enrollment,
    sector: { ...sector, status: "inactive" as const },
  });
  const cancelledEnrollment = evaluateAccreditationSectorAccess({
    scope,
    grant,
    enrollment: { ...enrollment, status: "cancelled" as const },
    sector,
  });

  assert.equal(allowed.allowed, true);
  assert.equal(revoked.reason, "entitlement_revoked");
  assert.equal(missing.reason, "no_sector_entitlement");
  assert.equal(inactiveSector.reason, "sector_inactive");
  assert.equal(cancelledEnrollment.reason, "enrollment_cancelled");
});
