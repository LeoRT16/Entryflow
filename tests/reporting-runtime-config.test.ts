import assert from "node:assert/strict";
import test from "node:test";
import { hasLegacyReportingRuntimeConfig, hasReportingRuntimeConfig } from "../lib/reporting/runtime-config";

const base = { SUPABASE_SERVICE_ROLE_KEY: "service" };

test("base worker capability requires only the service role key", () => {
  assert.equal(hasReportingRuntimeConfig(base), true);
  assert.equal(hasReportingRuntimeConfig({}), false);
});

test("legacy capability requires all three legacy values", () => {
  assert.equal(hasLegacyReportingRuntimeConfig({}), false);
  assert.equal(hasLegacyReportingRuntimeConfig({ GOOGLE_SERVICE_ACCOUNT_EMAIL: "email" }), false);
  assert.equal(hasLegacyReportingRuntimeConfig({ GOOGLE_SERVICE_ACCOUNT_EMAIL: "email", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key" }), false);
  assert.equal(hasLegacyReportingRuntimeConfig({ GOOGLE_SERVICE_ACCOUNT_EMAIL: "email", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key", REPORTING_WORKSPACE_USER_ID: "user" }), true);
});
