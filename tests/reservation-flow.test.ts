import assert from "node:assert/strict";
import test from "node:test";

import { buildReservationFlowTotals } from "../features/reservations/components/reservation-flow";

test("reservation flow metrics reuse the canonical occupancy snapshot", () => {
  const totals = buildReservationFlowTotals({
    checkedInGuests: 13,
    pendingGuests: 12,
    capacityRemaining: 34,
    occupancyPercent: 39,
  });

  assert.equal(totals.occupancyPercent, 39);
  assert.equal(totals.checkedInGuests, 13);
  assert.equal(totals.pendingGuests, 12);
  assert.equal(totals.capacityRemaining, 34);
});
