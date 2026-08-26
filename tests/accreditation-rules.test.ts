import assert from "node:assert/strict";
import test from "node:test";

import {
  AccreditationValidationError,
  assertAccreditationCategoryOwnership,
  assertAccreditationEnrollmentScope,
  assertAccreditationSectorAssignment,
} from "../features/accreditation/domain/accreditation-rules";

test("same organization and same event category assignment passes", () => {
  assert.doesNotThrow(() =>
    assertAccreditationCategoryOwnership({
      organizationId: "org-1",
      eventId: "event-1",
      category: {
        organizationId: "org-1",
        eventId: "event-1",
      },
    }),
  );
});

test("foreign category assignment fails closed", () => {
  assert.throws(
    () =>
      assertAccreditationCategoryOwnership({
        organizationId: "org-1",
        eventId: "event-1",
        category: {
          organizationId: "org-2",
          eventId: "event-1",
        },
      }),
    (error: unknown) => error instanceof AccreditationValidationError && error.code === "organization_mismatch",
  );
});

test("enrollment without venue accepts no sector and rejects sector assignment when venue is missing", () => {
  assert.doesNotThrow(() =>
    assertAccreditationEnrollmentScope({
      organizationId: "org-1",
      eventId: "event-1",
      event: {
        id: "event-1",
        organizationId: "org-1",
        venueId: undefined,
      },
    }),
  );

  assert.throws(
    () =>
      assertAccreditationSectorAssignment({
        organizationId: "org-1",
        eventId: "event-1",
        eventVenueId: null,
        sector: {
          id: "sector-1",
          venueId: "venue-1",
        },
      }),
    (error: unknown) => error instanceof AccreditationValidationError && error.code === "missing_event_venue",
  );
});

test("sector assignment requires matching venue", () => {
  assert.throws(
    () =>
      assertAccreditationSectorAssignment({
        organizationId: "org-1",
        eventId: "event-1",
        eventVenueId: "venue-a",
        sector: {
          id: "sector-1",
          venueId: "venue-b",
        },
      }),
    (error: unknown) => error instanceof AccreditationValidationError && error.code === "sector_mismatch",
  );
});
