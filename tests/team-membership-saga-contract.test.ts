import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/accounts/invite/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261025000000_team_membership_authority.sql", "utf8");

test("team invite has one membership authority and preserves identities on failure", () => {
  assert.match(route, /rpc\("upsert_organization_membership_atomic"/);
  assert.doesNotMatch(route, /repositories\.profiles\.(create|update)/);
  assert.doesNotMatch(route, /auth\.admin\.deleteUser/);
  assert.match(route, /membership_persist_failed/);
  assert.match(route, /membershipResult/);
});

test("membership authority covers lifecycle convergence and exactly-once activity branches", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_organization_id::text \|\| ':' \|\| p_user_id::text/);
  assert.match(migration, /member\.added/);
  assert.match(migration, /member\.restored/);
  assert.match(migration, /member\.reactivated/);
  assert.match(migration, /member\.updated/);
  assert.match(migration, /where user_id=p_user_id and organization_id=p_organization_id/);
  assert.match(migration, /if not is_platform_root\(\)/);
});

test("membership authority does not persist temporary passwords", () => {
  assert.doesNotMatch(migration, /password|tempPassword|temporary/i);
});
