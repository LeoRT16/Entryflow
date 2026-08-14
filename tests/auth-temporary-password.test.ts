import assert from "node:assert/strict";
import test from "node:test";

import { createOrUpdateTemporaryPasswordAuthIdentity } from "../app/api/accounts/auth-onboarding";

test("temporary password auth helper creates a confirmed auth user when none exists", async () => {
  const createCalls: Array<Record<string, unknown>> = [];
  const client = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [], nextPage: null }, error: null }),
        createUser: async (attributes: Record<string, unknown>) => {
          createCalls.push(attributes);
          return { data: { user: { id: "auth-new" } }, error: null };
        },
        updateUserById: async () => ({ data: { user: null }, error: null }),
      },
    },
  } as never;

  const result = await createOrUpdateTemporaryPasswordAuthIdentity(client, {
    email: "guest@example.com",
    password: "temporary-123",
  });

  assert.equal(result.data.mode, "created");
  assert.equal(result.data.user?.id, "auth-new");
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0]?.email, "guest@example.com");
  assert.equal(createCalls[0]?.password, "temporary-123");
  assert.equal(createCalls[0]?.email_confirm, true);
});

test("temporary password auth helper updates an existing auth user instead of duplicating it", async () => {
  const updateCalls: Array<{ uid: string; attributes: Record<string, unknown> }> = [];
  const client = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: "auth-existing",
                email: "guest@example.com",
                email_confirmed_at: null,
                confirmed_at: null,
                invited_at: null,
                last_sign_in_at: null,
              },
            ],
            nextPage: null,
          },
          error: null,
        }),
        createUser: async () => ({ data: { user: null }, error: null }),
        updateUserById: async (uid: string, attributes: Record<string, unknown>) => {
          updateCalls.push({ uid, attributes });
          return { data: { user: { id: uid } }, error: null };
        },
      },
    },
  } as never;

  const result = await createOrUpdateTemporaryPasswordAuthIdentity(client, {
    email: "guest@example.com",
    password: "temporary-123",
  });

  assert.equal(result.data.mode, "updated");
  assert.equal(result.data.user?.id, "auth-existing");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.uid, "auth-existing");
  assert.equal(updateCalls[0]?.attributes.password, "temporary-123");
  assert.equal(updateCalls[0]?.attributes.email_confirm, true);
});
