import assert from "node:assert/strict";
import test from "node:test";

import { mapUserRowToDomain, mapUserToRow } from "../lib/supabase/mappers";
import type { UserRow } from "../lib/supabase/types";

test("user rows roundtrip auth_user_id without breaking legacy null values", () => {
  const row: UserRow = {
    id: "user-1",
    auth_user_id: "auth-user-1",
    must_change_password: true,
    email: "owner@example.com",
    display_name: "Owner",
    avatar_url: null,
    metadata: null,
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    deleted_at: null,
  };

  const domain = mapUserRowToDomain(row);
  assert.equal(domain.authUserId, "auth-user-1");
  assert.equal(domain.mustChangePassword, true);

  const nextRow = mapUserToRow(domain);
  assert.equal(nextRow.auth_user_id, "auth-user-1");
  assert.equal(nextRow.must_change_password, true);

  const legacyRow = mapUserToRow({
    ...domain,
    authUserId: null,
    mustChangePassword: false,
  });
  assert.equal(legacyRow.auth_user_id, null);
  assert.equal(legacyRow.must_change_password, false);
});
