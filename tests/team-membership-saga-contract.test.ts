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

test("metadata corrective migration matches the canonical profiles schema", () => {
  const correction = readFileSync("supabase/migrations/20261026000000_team_membership_authority_metadata_fix.sql", "utf8");
  assert.doesNotMatch(correction, /profiles\.attributes|profiles\.status|target\.status|insert into profiles\([^)]*attributes|insert into profiles\([^)]*status/i);
  assert.match(correction, /metadata->'attributes'->>'status'/);
  assert.match(correction, /'\{area\}'/);
  assert.match(correction, /'\{status\}'/);
  assert.match(correction, /upsert_organization_membership_atomic/);
  assert.match(correction, /mutate_organization_membership_atomic/);
});

test("membership authority does not persist temporary passwords", () => {
  assert.doesNotMatch(migration, /password|tempPassword|temporary/i);
});

test("invite membership RPC diagnostics stay server-side and sanitized", () => {
  const inviteRoute = readFileSync("app/api/accounts/invite/route.ts", "utf8");
  assert.match(inviteRoute, /\[accounts\/invite:membership-rpc-error\]/);
  assert.match(inviteRoute, /membership_persist_failed/);
  assert.doesNotMatch(inviteRoute, /console\.error\([^\n]*tempPassword/);
  assert.doesNotMatch(inviteRoute, /console\.error\([^\n]*(authorization|access_token|refresh_token|service_role)/i);
  assert.doesNotMatch(inviteRoute, /console\.error\([^\n]*body/);
});

test("membership mutations use the authenticated server client, not the service client", () => {
  const inviteRoute = readFileSync("app/api/accounts/invite/route.ts", "utf8");
  const accountRoute = readFileSync("app/api/accounts/[profileId]/route.ts", "utf8");
  assert.match(inviteRoute, /const authenticatedClient = await dependencies\.createAuthClient\(\)/);
  assert.match(inviteRoute, /rpcClient\.rpc\("upsert_organization_membership_atomic"/);
  assert.match(accountRoute, /const authenticatedClient = await dependencies\.createAuthClient\(\)/);
  assert.match(accountRoute, /authenticatedClient\.rpc\("mutate_organization_membership_atomic"/);
  assert.doesNotMatch(accountRoute, /client\.rpc\("mutate_organization_membership_atomic"/);
});
