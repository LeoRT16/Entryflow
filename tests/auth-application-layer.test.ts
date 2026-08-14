import assert from "node:assert/strict";
import test from "node:test";

import { buildPostAuthRedirect } from "../app/auth/callback/helpers";
import { sanitizeRedirectTarget } from "../app/login/redirect-target";
import { buildPostLoginRedirect } from "../app/login/login-redirect";
import {
  pickCurrentOrganizationIdForUser,
  pickCurrentProfileIdForUser,
} from "../services/workspace-loader";
import type { OrganizationRow, ProfileRow } from "../lib/supabase/types";

function buildOrganizationRow(overrides: Partial<OrganizationRow>): OrganizationRow {
  return {
    id: overrides.id ?? "org-1",
    name: overrides.name ?? "Organización",
    slug: overrides.slug ?? "organizacion",
    status: overrides.status ?? "active",
    timezone: overrides.timezone ?? "America/La_Paz",
    branding: overrides.branding ?? {},
    settings: overrides.settings ?? {},
    metadata: overrides.metadata ?? null,
    created_at: overrides.created_at ?? "2026-08-13T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-08-13T00:00:00.000Z",
    deleted_at: overrides.deleted_at ?? null,
  };
}

function buildProfileRow(overrides: Partial<ProfileRow>): ProfileRow {
  return {
    id: overrides.id ?? "profile-1",
    user_id: overrides.user_id ?? "user-1",
    organization_id: overrides.organization_id ?? "org-1",
    role_id: overrides.role_id ?? "role-owner",
    display_name: overrides.display_name ?? "Owner",
    metadata: overrides.metadata ?? null,
    created_at: overrides.created_at ?? "2026-08-13T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-08-13T00:00:00.000Z",
    deleted_at: overrides.deleted_at ?? null,
  };
}

test("login redirect target rejects external URLs and keeps internal routes", () => {
  assert.equal(sanitizeRedirectTarget("/users"), "/users");
  assert.equal(sanitizeRedirectTarget("   /settings?tab=team  "), "/settings?tab=team");
  assert.equal(sanitizeRedirectTarget("https://example.com"), "/");
  assert.equal(sanitizeRedirectTarget("//evil.example"), "/");
  assert.equal(sanitizeRedirectTarget(null), "/");
});

test("auth callback sends invite and recovery links to the password setup screen", () => {
  const inviteRedirect = buildPostAuthRedirect("http://localhost:3000", "/users", "invite");
  const recoveryRedirect = buildPostAuthRedirect("http://localhost:3000", "/operations", "recovery");
  const loginRedirect = buildPostAuthRedirect("http://localhost:3000", "/timeline", "magiclink");

  assert.equal(inviteRedirect.pathname, "/auth/setup-password");
  assert.equal(inviteRedirect.searchParams.get("next"), "/users");
  assert.equal(recoveryRedirect.pathname, "/auth/setup-password");
  assert.equal(recoveryRedirect.searchParams.get("next"), "/operations");
  assert.equal(loginRedirect.pathname, "/timeline");
});

test("first login with a temporary password redirects immediately to password setup", () => {
  assert.equal(
    buildPostLoginRedirect("/users", {
      status: "must-change-password",
      authUserId: "auth-user",
      authUserEmail: "guest@example.com",
      publicUserId: "user-guest",
    }),
    "/auth/setup-password?next=%2Fusers",
  );

  assert.equal(
    buildPostLoginRedirect("/users", {
      status: "ready",
      authUserId: "auth-user",
      authUserEmail: "guest@example.com",
      publicUserId: "user-guest",
      organizationIds: ["org-1"],
    }),
    "/users",
  );
});

test("workspace selection ignores foreign organization and foreign profile ids", () => {
  const organizations = [
    buildOrganizationRow({ id: "org-1", updated_at: "2026-08-12T10:00:00.000Z" }),
    buildOrganizationRow({ id: "org-2", updated_at: "2026-08-13T10:00:00.000Z" }),
  ];

  const profiles = [
    buildProfileRow({ id: "profile-owned", user_id: "user-1", organization_id: "org-1" }),
    buildProfileRow({ id: "profile-other-org", user_id: "user-1", organization_id: "org-2" }),
    buildProfileRow({ id: "profile-foreign", user_id: "user-2", organization_id: "org-2" }),
  ];

  assert.equal(pickCurrentOrganizationIdForUser(organizations, profiles, "user-1"), "org-2");
  assert.equal(pickCurrentProfileIdForUser(profiles, "org-2", "user-1"), "profile-other-org");
  assert.equal(pickCurrentProfileIdForUser(profiles, "org-1", "user-1"), "profile-owned");
  assert.equal(pickCurrentProfileIdForUser(profiles, "org-2", "user-3"), "");
});
