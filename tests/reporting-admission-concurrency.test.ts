import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20261109000000_reporting_admission_concurrency_finalization_fix.sql", "utf8");

test("admission/reporting correction preserves processing leases and guards terminal events", () => {
  assert.match(sql, /status=case when public\.reporting_outbox\.status='processing' then public\.reporting_outbox\.status else 'pending' end/);
  assert.match(sql, /locked_at=case when public\.reporting_outbox\.status='processing'/);
  assert.match(sql, /active_sync_run_id=case when public\.reporting_outbox\.status='processing'/);
  assert.match(sql, /ev\.status in \('finished','cancelled'\)/);
  assert.match(sql, /create trigger guests_admission_event_open/);
  assert.match(sql, /function public\.enforce_admission_event_open\(\)/);
  assert.match(sql, /checkin_event_terminal/);
  assert.match(sql, /grant execute on function public\.persist_completed_checkin_atomic/);
});
