import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const archive = readFileSync("app/api/events/[eventId]/archive/route.ts", "utf8");
const history = readFileSync("app/api/events/[eventId]/history/route.ts", "utf8");
const finalReport = readFileSync("app/api/reporting/final-report/route.ts", "utf8");
const retry = readFileSync("app/api/reporting/retry/route.ts", "utf8");

test("archive and restore are organization-scoped and permission-checked", () => {
  assert.match(archive, /getSupabaseAuthUser/);
  assert.match(archive, /event\.delete/);
  assert.match(archive, /organization_id/);
  assert.match(archive, /event_must_be_finished/);
  assert.match(archive, /deleted_at/);
  assert.match(archive, /workspace\.isPlatformRoot \? lookup : lookup\.eq\("organization_id",workspace\.currentOrganizationId\)/);
});

test("historical access requires event.view and excludes live workspace scope", () => {
  assert.match(history, /event\.view/);
  assert.match(history, /currentOrganizationId/);
  assert.match(history, /event\.deleted_at/);
  assert.match(history, /readOnly:true/);
});

test("final report API protects reads and mutations", () => {
  assert.match(finalReport, /event\.view/);
  assert.match(finalReport, /event\.edit/);
  assert.match(finalReport, /workspace\.events/);
  assert.match(finalReport, /organizationId/);
});

test("reporting retry resolves event ownership before invoking the RPC", () => {
  assert.match(retry, /reporting_outbox/);
  assert.match(retry, /canAccess/);
  assert.match(retry, /event\.edit/);
});
