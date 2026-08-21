import assert from "node:assert/strict";
import test from "node:test";

import { clearInvalidSupabaseBrowserSession } from "../lib/supabase/client";

function encodeBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function buildJwt(payload: Record<string, unknown>) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

test("clearInvalidSupabaseBrowserSession signs out a browser session whose access token was issued in the future", async () => {
  let signOutCalls = 0;
  const previousWindow = globalThis.window;
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: buildJwt({
              iat: Math.floor(Date.now() / 1000) + 300,
              exp: Math.floor(Date.now() / 1000) + 3600,
              iss: "https://example.supabase.co/auth/v1",
              aud: "authenticated",
              role: "authenticated",
            }),
          },
        },
      }),
      signOut: async () => {
        signOutCalls += 1;
        return { error: null };
      },
    },
  };

  globalThis.window = {} as typeof window;

  try {
    const result = await clearInvalidSupabaseBrowserSession(client as never);

    assert.equal(result, true);
    assert.equal(signOutCalls, 1);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("clearInvalidSupabaseBrowserSession keeps a normal browser session intact", async () => {
  let signOutCalls = 0;
  const previousWindow = globalThis.window;
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: buildJwt({
              iat: Math.floor(Date.now() / 1000) - 60,
              exp: Math.floor(Date.now() / 1000) + 3600,
              iss: "https://example.supabase.co/auth/v1",
              aud: "authenticated",
              role: "authenticated",
            }),
          },
        },
      }),
      signOut: async () => {
        signOutCalls += 1;
        return { error: null };
      },
    },
  };

  globalThis.window = {} as typeof window;

  try {
    const result = await clearInvalidSupabaseBrowserSession(client as never);

    assert.equal(result, false);
    assert.equal(signOutCalls, 0);
  } finally {
    globalThis.window = previousWindow;
  }
});
