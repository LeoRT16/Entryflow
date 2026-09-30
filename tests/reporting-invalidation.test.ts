import assert from "node:assert/strict";
import test from "node:test";
import { ReportingInvalidationError } from "@/features/reporting/sync/errors";
import { requestReportingSyncAfterSuccess } from "@/features/reporting/sync/request-after-success";

const eventId = "event-reporting-test";

test("reporting invalidation resolves when the durable request succeeds", async () => {
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: async () => ({ data: [{ writer_mode: "oauth_user", sheet_schema_version: 2 }], error: null }),
          }),
        }),
      }),
    }),
    rpc: async () => ({ data: [{ outbox_id: "outbox-1", destination_id: "destination-1", requested_sequence: 1 }], error: null }),
  } as never;

  await assert.doesNotReject(() => requestReportingSyncAfterSuccess(client, eventId));
});

test("reporting invalidation exposes a typed error and preserves the cause", async () => {
  const cause = new Error("dispatcher unavailable");
  let observed: unknown;
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: async () => ({ data: [{ writer_mode: "oauth_user", sheet_schema_version: 2 }], error: null }),
          }),
        }),
      }),
    }),
    rpc: async () => ({ data: null, error: cause }),
  } as never;

  await assert.rejects(
    () => requestReportingSyncAfterSuccess(client, eventId, (error) => { observed = error; }),
    (error: unknown) => error instanceof ReportingInvalidationError
      && error.code === "reporting_invalidation_failed"
      && error.eventId === eventId
      && error.cause === cause,
  );
  assert.equal(observed, cause);
});
