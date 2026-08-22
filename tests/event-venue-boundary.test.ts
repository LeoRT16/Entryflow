import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanonicalCurrentVenue, resolveEventVenueDisplayName } from "../features/events/domain/event-venue-boundary";

test("event venue display prefers the canonical current venue over the denormalized event label", () => {
  assert.equal(
    resolveEventVenueDisplayName({
      currentVenueName: "La Rota Carlota",
      eventVenue: "La Rota Carlota - 6 de Agosto",
    }),
    "La Rota Carlota",
  );
});

test("event venue display falls back to the event label when no canonical venue is available", () => {
  assert.equal(
    resolveEventVenueDisplayName({
      currentVenueName: "",
      eventVenue: "La Rota Carlota - 6 de Agosto",
    }),
    "La Rota Carlota - 6 de Agosto",
  );
});

test("canonical current venue resolution requires a persisted venue id and fails closed when missing", () => {
  const venues = [
    { id: "venue-a", name: "Venue A" },
    { id: "venue-b", name: "Venue B" },
  ];

  assert.equal(resolveCanonicalCurrentVenue({ currentEventVenueId: "venue-b", venues })?.id, "venue-b");
  assert.equal(resolveCanonicalCurrentVenue({ currentEventVenueId: null, venues }), null);
  assert.equal(resolveCanonicalCurrentVenue({ currentEventVenueId: "", venues }), null);
});
