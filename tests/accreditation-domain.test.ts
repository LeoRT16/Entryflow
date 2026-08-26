import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccreditationCategory,
  buildAccreditationEnrollment,
  cancelAccreditationEnrollment,
  updateAccreditationCategory,
  updateAccreditationEnrollment,
} from "../features/accreditation/domain";
import { AccreditationValidationError, normalizeAccreditationStatus } from "../features/accreditation/domain/accreditation-rules";

test("create active enrollment keeps participant identity on the enrollment record", () => {
  const enrollment = buildAccreditationEnrollment(
    {
      organizationId: "org-1",
      eventId: "event-1",
      name: "  Leonardo Rodríguez  ",
      email: "  LEONARDO@example.com  ",
      phone: "  +59170000000  ",
      categoryId: "category-1",
      sectorId: "sector-1",
      metadata: { badge: "vip" },
    },
    () => "2026-08-26T12:00:00.000Z",
  );

  assert.equal(enrollment.status, "active");
  assert.equal(enrollment.name, "Leonardo Rodríguez");
  assert.equal(enrollment.email, "leonardo@example.com");
  assert.equal(enrollment.phone, "+59170000000");
  assert.equal(enrollment.createdAt, "2026-08-26T12:00:00.000Z");
  assert.equal(enrollment.updatedAt, "2026-08-26T12:00:00.000Z");
  assert.equal(enrollment.categoryId, "category-1");
  assert.equal(enrollment.sectorId, "sector-1");
});

test("cancelled enrollment preserves the historical row", () => {
  const current = buildAccreditationEnrollment(
    {
      organizationId: "org-1",
      eventId: "event-1",
      name: "Guest",
    },
    () => "2026-08-26T12:00:00.000Z",
  );

  const cancelled = cancelAccreditationEnrollment(current, () => "2026-08-26T13:00:00.000Z");

  assert.equal(cancelled.id, current.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.createdAt, current.createdAt);
  assert.equal(cancelled.updatedAt, "2026-08-26T13:00:00.000Z");
});

test("category rows stay event scoped and support later updates", () => {
  const category = buildAccreditationCategory(
    {
      organizationId: "org-1",
      eventId: "event-1",
      slug: "  VIP Access  ",
      name: "VIP Access",
      description: "  Front row  ",
      color: "  #ff00aa  ",
      sortOrder: 2,
      isActive: true,
      metadata: { source: "template" },
    },
    () => "2026-08-26T12:00:00.000Z",
  );

  const updated = updateAccreditationCategory(
    category,
    {
      name: "VIP Plus",
      isActive: false,
    },
    () => "2026-08-26T12:30:00.000Z",
  );

  assert.equal(category.slug, "vip-access");
  assert.equal(category.name, "VIP Access");
  assert.equal(updated.name, "VIP Plus");
  assert.equal(updated.isActive, false);
  assert.equal(updated.updatedAt, "2026-08-26T12:30:00.000Z");
});

test("enrollment updates preserve identity and allow status changes", () => {
  const current = buildAccreditationEnrollment(
    {
      organizationId: "org-1",
      eventId: "event-1",
      name: "Guest",
      email: "guest@example.com",
    },
    () => "2026-08-26T12:00:00.000Z",
  );

  const next = updateAccreditationEnrollment(
    current,
    {
      name: "Guest Updated",
      sectorId: "sector-2",
      status: "cancelled",
    },
    () => "2026-08-26T12:45:00.000Z",
  );

  assert.equal(next.name, "Guest Updated");
  assert.equal(next.sectorId, "sector-2");
  assert.equal(next.status, "cancelled");
  assert.equal(next.createdAt, current.createdAt);
  assert.equal(next.updatedAt, "2026-08-26T12:45:00.000Z");
});

test("normalizeAccreditationStatus rejects unexpected states", () => {
  assert.equal(normalizeAccreditationStatus("active"), "active");
  assert.equal(normalizeAccreditationStatus("cancelled"), "cancelled");
  assert.throws(() => normalizeAccreditationStatus("pending"), AccreditationValidationError);
});
