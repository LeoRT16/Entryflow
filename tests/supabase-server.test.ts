import assert from "node:assert/strict";
import test from "node:test";

import { ensureSupabaseServiceConfig } from "../lib/supabase/helpers";
import {
  getSupabaseServerClientFromEnv,
  resetSupabaseServerClientForTests,
} from "../lib/supabase/server";

function buildProcessEnv(values: Record<string, string | undefined>) {
  return {
    NODE_ENV: "test",
    ...values,
  } as unknown as NodeJS.ProcessEnv;
}

test("Supabase server config fails clearly when the service role key is missing", () => {
  assert.throws(
    () =>
      ensureSupabaseServiceConfig(
        buildProcessEnv({
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: undefined,
        }),
      ),
    {
      message: /Missing required Supabase server configuration: SUPABASE_SERVICE_ROLE_KEY\./,
    },
  );
});

test("Supabase server config fails clearly when the service role key is blank", () => {
  assert.throws(
    () =>
      ensureSupabaseServiceConfig(
        buildProcessEnv({
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "",
        }),
      ),
    {
      message: /Missing required Supabase server configuration: SUPABASE_SERVICE_ROLE_KEY\./,
    },
  );
});

test("Supabase server client can be created when server config is valid", () => {
  const config = ensureSupabaseServiceConfig(
    buildProcessEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    }),
  );

  assert.deepEqual(config, {
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role-secret",
  });

  resetSupabaseServerClientForTests();
  const client = getSupabaseServerClientFromEnv(
    buildProcessEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    }),
  );

  assert.ok(client);
  resetSupabaseServerClientForTests();
});
