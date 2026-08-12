import assert from "node:assert/strict";
import test from "node:test";

import { buildActiveCheckIns } from "../services/workspace-loader";
import { isAccessGrantAlreadyConsumed } from "../features/check-in/domain/check-in-persistence";
import type { CheckInRow } from "../lib/supabase/types";

function buildCheckInRow(overrides: Partial<CheckInRow> = {}): CheckInRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    guest_id: "guest-1",
    reservation_id: "reservation-1",
    event_id: "event-1",
    access_grant_id: "grant-1",
    access_type: "qr",
    method: "QR",
    checked_in_at: "17:25",
    checked_out_at: null,
    operator: "Escáner",
    gate: "Principal",
    notes: null,
    audit_trail: [],
    reentry_allowed: true,
    max_entries: 1,
    reentry_window_minutes: null,
    attempt_count: 1,
    last_attempt_at: "17:25",
    status: "Checked In",
    source: "qr",
    created_at: "2026-08-12T17:25:36.575+00:00",
    updated_at: "2026-08-12T17:25:37.424722+00:00",
    deleted_at: null,
    ...overrides,
  };
}

test("soft-deleted check-ins are excluded from the bootstrap state", () => {
  const activeCheckIn = buildCheckInRow({
    id: "00000000-0000-4000-8000-000000000001",
    access_grant_id: "grant-active",
    deleted_at: null,
  });
  const softDeletedCheckIn = buildCheckInRow({
    id: "00000000-0000-4000-8000-000000000002",
    access_grant_id: "grant-deleted",
    deleted_at: "2026-08-12T17:25:37.244+00:00",
  });

  const activeOnly = buildActiveCheckIns([activeCheckIn, softDeletedCheckIn]);

  assert.deepEqual(activeOnly.map((row) => row.accessGrantId), ["grant-active"]);
});

test("soft-deleted check-ins do not mark a QR as consumed", () => {
  const activeCheckIn = buildCheckInRow({
    access_grant_id: "grant-active",
    deleted_at: null,
  });
  const softDeletedCheckIn = buildCheckInRow({
    access_grant_id: "grant-soft-deleted",
    deleted_at: "2026-08-12T17:25:37.244+00:00",
  });

  const consumed = new Set(buildActiveCheckIns([activeCheckIn, softDeletedCheckIn]).map((row) => row.accessGrantId ?? row.id));

  assert.equal(isAccessGrantAlreadyConsumed("grant-soft-deleted", consumed), false);
  assert.equal(isAccessGrantAlreadyConsumed("grant-active", consumed), true);
});

test("active check-ins still block a second use", () => {
  const activeCheckIn = buildCheckInRow({
    access_grant_id: "grant-active",
    deleted_at: null,
  });

  const consumed = new Set(buildActiveCheckIns([activeCheckIn]).map((row) => row.accessGrantId ?? row.id));

  assert.equal(isAccessGrantAlreadyConsumed("grant-active", consumed), true);
  assert.equal(isAccessGrantAlreadyConsumed("grant-new", consumed), false);
});
