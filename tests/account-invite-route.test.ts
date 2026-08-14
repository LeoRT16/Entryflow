import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkspaceRole } from "../app/api/accounts/invite/helpers";
import type { AccountRolePreset } from "../features/accounts/types";

test("invite flow resolves the database role row instead of the fixed preset uuid", () => {
  const roles: AccountRolePreset[] = [
    {
      id: "db-role-owner",
      slug: "owner",
      name: "Owner",
      permissions: [],
    },
    {
      id: "db-role-reception",
      slug: "reception",
      name: "Recepción",
      permissions: ["accounts.view"],
    },
  ];

  const resolved = resolveWorkspaceRole(roles, "reception");

  assert.ok(resolved);
  assert.equal(resolved?.id, "db-role-reception");
  assert.equal(resolved?.slug, "reception");
});

test("invite flow rejects unknown roles", () => {
  const resolved = resolveWorkspaceRole([], "reception");

  assert.equal(resolved, null);
});
