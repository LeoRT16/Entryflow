import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261128000000_activate_event_final_reporting.sql", "utf8");
const route = readFileSync("app/api/events/activate/route.ts", "utf8");
const repository = readFileSync("repositories/supabase-workspace-repositories.ts", "utf8");

test("automatic activation uses the canonical durable finalization primitive", () => {
  assert.match(migration, /create or replace function public\.finalize_event_with_final_report/);
  assert.match(migration, /return public\.finalize_event_with_final_report\(p_event_id,p_report,p_expected_revision,null\)/);
  assert.match(migration, /finalized := public\.finalize_event_with_final_report\(previous_live\.id,p_previous_live_report,p_previous_live_expected_revision,target\.id\)/);
  assert.match(migration, /insert into reporting_final_snapshots/);
  assert.match(migration, /insert into reporting_final_report_jobs/);
});

test("activation rolls back instead of finishing a live event without a report", () => {
  assert.match(migration, /previous_live_final_report_required/);
  assert.match(migration, /final_report_revision_conflict/);
  assert.match(migration, /perform pg_advisory_xact_lock/);
});

test("activation prepares the same report before one RPC transaction", () => {
  assert.match(route, /loadEventReportForWorker/);
  assert.match(route, /p_previous_live_report: report/);
  assert.match(route, /p_previous_live_expected_revision: revision/);
  assert.match(repository, /fetch\("\/api\/events\/activate"/);
});

test("Drive remains out of the database transaction and jobs are idempotent", () => {
  assert.doesNotMatch(migration, /uploadFile|fetch\s*\(|http_request/i);
  assert.match(migration, /on conflict\(event_id\) do nothing/g);
});
