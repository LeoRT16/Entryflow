import assert from "node:assert/strict";
import test from "node:test";
import { requestReportingSync, setReportingDestinationEnabled } from "../repositories/reporting-sync-repositories";

function client(destination: Record<string, unknown> | null, calls: string[]) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: async () => ({ data: destination ? [destination] : [], error: null }) }) }) }) }),
    rpc: async (name: string) => { calls.push(name); return { data: [{ outbox_id: "o", destination_id: "d", requested_sequence: 1 }], error: null }; },
  } as never;
}

test("oauth V2 destination routes only to OAuth request RPC", async () => {
  const calls: string[] = [];
  await requestReportingSync(client({ writer_mode: "oauth_user", sheet_schema_version: 2, enabled: true }, calls), "event");
  assert.deepEqual(calls, ["request_reporting_oauth_sync"]);
});

test("legacy destination routes only to legacy request RPC", async () => {
  const calls: string[] = [];
  await requestReportingSync(client({ writer_mode: "service_account", sheet_schema_version: 1, enabled: true }, calls), "event");
  assert.deepEqual(calls, ["request_reporting_sync"]);
});

test("caller cannot choose writer mode or destination id", async () => {
  const calls: string[] = [];
  await requestReportingSync(client({ writer_mode: "oauth_user", sheet_schema_version: 2, enabled: true }, calls), "event");
  assert.deepEqual(calls, ["request_reporting_oauth_sync"]);
});

test("activation uses the authenticated server activation RPC", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const fake = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return { data: [{ enabled: true }], error: null }; } } as never;
  await setReportingDestinationEnabled(fake, "event", true);
  assert.deepEqual(calls, [["set_reporting_destination_enabled", { p_event_id: "event", p_enabled: true }]]);
});
