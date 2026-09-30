import assert from "node:assert/strict";
import test from "node:test";
import { findWorkspaceUserRow } from "../services/workspace-loader";

const row = (id: string, auth_user_id: string | null) => ({ id, auth_user_id, deleted_at: null });

test("workspace loader resolves the configured durable user id as well as auth id", () => {
  const users = [row("workspace-user", "auth-user")];
  assert.equal(findWorkspaceUserRow(users, "auth-user")?.id, "workspace-user");
  assert.equal(findWorkspaceUserRow(users, "workspace-user")?.id, "workspace-user");
});

test("workspace loader does not resolve a deleted user by either identity", () => {
  const users = [{ ...row("workspace-user", "auth-user"), deleted_at: "2026-01-01T00:00:00Z" }];
  assert.equal(findWorkspaceUserRow(users, "auth-user"), null);
  assert.equal(findWorkspaceUserRow(users, "workspace-user"), null);
});
