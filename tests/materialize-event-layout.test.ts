import assert from "node:assert/strict";
import test from "node:test";

import { materializeEventLayout } from "@/features/events/application/materialize-event-layout";

test("materializeEventLayout routes exactly once to the atomic repository RPC", async () => {
  const calls: string[] = [];
  const payload = {
    changed: true,
    event_id: "event-1",
    event_layout_id: "layout-1",
    venue_id: "venue-1",
    source_venue_layout_id: null,
    resource_count: 2,
  };
  const result = await materializeEventLayout({
    eventLayouts: {
      materializeEventLayoutAtomic: async (eventId: string) => {
        calls.push(eventId);
        return payload;
      },
    } as never,
  }, "event-1");

  assert.deepEqual(calls, ["event-1"]);
  assert.deepEqual(result, payload);
});
