import assert from "node:assert/strict";
import test from "node:test";

import { resolveEventVenueDisplayName } from "../features/events/domain/event-venue-boundary";

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
