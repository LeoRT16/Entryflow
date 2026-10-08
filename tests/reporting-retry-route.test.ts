import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("terminal retry route exposes only the server-authoritative action", () => {
  const route = readFileSync("app/api/reporting/retry/route.ts", "utf8");
  assert.match(route, /retry_reporting_terminal_work/);
  assert.match(route, /outboxId/);
  assert.doesNotMatch(route, /request_reporting_sync/);
});
