import test from "node:test";
import assert from "node:assert/strict";
import { authorizeReportingCronRequest } from "../lib/reporting/cron-auth";
import { hasReportingRuntimeConfig } from "../lib/reporting/runtime-config";

test("reporting cron auth fails closed without CRON_SECRET", () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try { assert.equal(authorizeReportingCronRequest(new Request("http://localhost")), false); }
  finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});

test("reporting cron auth accepts only the official bearer secret", () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    assert.equal(authorizeReportingCronRequest(new Request("http://localhost", { headers: { authorization: "Bearer test-cron-secret" } })), true);
    assert.equal(authorizeReportingCronRequest(new Request("http://localhost", { headers: { authorization: "Bearer wrong" } })), false);
    assert.equal(authorizeReportingCronRequest(new Request("http://localhost", { headers: { "x-reporting-worker-secret": "test-cron-secret" } })), false);
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});

test("reporting runtime config fails closed when a server secret is absent", () => {
  assert.equal(hasReportingRuntimeConfig({
    SUPABASE_SERVICE_ROLE_KEY: "service",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.test",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key",
    REPORTING_WORKSPACE_USER_ID: "user",
  }), true);
  assert.equal(hasReportingRuntimeConfig({}), false);
});
