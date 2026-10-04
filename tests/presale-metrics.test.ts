import assert from "node:assert/strict";
import test from "node:test";

import { buildReservationMetrics } from "../features/reservations/domain/reservation-domain";
import { buildGuestDraftsFromGuests } from "../features/reservations/domain/reservation-draft";

const reservation = (overrides: Record<string, unknown> = {}) => ({
  id: "r-1", reservationType: "Preventa", tableCapacity: 0, commercialSnapshot: { saleType: "presale", quantity: 8 },
  updatedAt: "2026-10-01T00:00:00Z", ...overrides,
}) as unknown as Parameters<typeof buildReservationMetrics>[0];

const guest = (id: string, admissionStatus = "Pendiente") => ({ id, reservationId: "r-1", reservationStatus: "Confirmed", admissionStatus }) as unknown as Parameters<typeof buildReservationMetrics>[1][number];

test("presale metrics separate purchased, assigned, unassigned and admission state", () => {
  const metrics = buildReservationMetrics(reservation(), [guest("g-1"), guest("g-2")], []);
  assert.deepEqual({ purchased: metrics.purchasedAccesses, assigned: metrics.assignedAccesses, unassigned: metrics.unassignedAccesses, pending: metrics.pendingGuests, admitted: metrics.checkedInGuests }, { purchased: 8, assigned: 2, unassigned: 6, pending: 2, admitted: 0 });
  assert.equal(metrics.capacityRemaining, 6);
});

test("physical reservation metrics retain table capacity semantics", () => {
  const metrics = buildReservationMetrics(reservation({ reservationType: "Mesa", tableCapacity: 4, commercialSnapshot: undefined }), [guest("g-1")], []);
  assert.equal(metrics.capacityRemaining, 3);
  assert.equal(metrics.unassignedAccesses, 0);
});

test("partial presale edit hydrates only materialized guests", () => {
  const drafts = buildGuestDraftsFromGuests([guest("g-1"), guest("g-2")]);
  assert.equal(drafts.length, 2);
  assert.equal((reservation().commercialSnapshot as { quantity: number }).quantity, 8);
});
