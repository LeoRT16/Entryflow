import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20261108000000_reporting_admission_invalidation.sql", "utf8");
const service = fs.readFileSync("services/workspace-service.tsx", "utf8");

test("admission reporting invalidation is backend-owned and covers admission plus reversal", () => {
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /request_reporting_sync_internal\(new\.event_id\)/);
  assert.match(sql, /old\.admission_status = 'Ingresó'/);
  assert.match(sql, /after update of admission_status, check_in_time, check_in_method on public\.guests/);
  assert.match(sql, /revoke all on function public\.invalidate_reporting_after_admission_change\(\) from public, anon, authenticated/);
  assert.doesNotMatch(service, /upsertPersistedTimelineEvent\(bundle\.timelineEntry\);\s*await requestReportingAfterSuccess\(currentEvent\.id\);/);
});
