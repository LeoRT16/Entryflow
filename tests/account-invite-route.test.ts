import assert from "node:assert/strict";
import test from "node:test";

import { handleInvite } from "../app/api/accounts/invite/route";
import { resolveWorkspaceRole } from "../app/api/accounts/invite/helpers";
import type { AccountRolePreset } from "../features/accounts/types";
import type { WorkspaceBootstrap } from "../services/workspace-loader";

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

function buildWorkspace(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  return {
    authState: {
      status: "ready",
      authUserId: "auth-owner",
      authUserEmail: "owner@example.com",
      publicUserId: "user-owner",
      organizationIds: ["org-a", "org-b"],
    },
    currentUserId: "user-owner",
    users: [
      {
        id: "user-owner",
        authUserId: "auth-owner",
        email: "owner@example.com",
        displayName: "Owner",
        mustChangePassword: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "user-member-b",
        authUserId: "auth-member-b",
        email: "member-b@example.com",
        displayName: "Member B",
        mustChangePassword: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    profiles: [
      {
        id: "profile-owner-a",
        organizationId: "org-a",
        userId: "user-owner",
        roleId: "role-owner",
        displayName: "Owner",
        attributes: { permissions: ["accounts.manage"], status: "active" },
        status: "active",
        metadata: { permissions: ["accounts.manage"], attributes: { status: "active" } },
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "profile-owner-b",
        organizationId: "org-b",
        userId: "user-owner",
        roleId: "role-reception",
        displayName: "Owner - B",
        attributes: { permissions: [], status: "active" },
        status: "active",
        metadata: { permissions: [], attributes: { status: "active" } },
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [
      {
        id: "role-owner",
        slug: "owner",
        name: "Owner",
        permissions: ["accounts.manage"],
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
        description: null,
        metadata: null,
      },
      {
        id: "role-reception",
        slug: "reception",
        name: "Recepción",
        permissions: ["accounts.view"],
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
        description: null,
        metadata: null,
      },
    ] as never,
    organizations: [
      {
        id: "org-a",
        name: "Org A",
        slug: "org-a",
        status: "active",
        timezone: "America/La_Paz",
        branding: {},
        settings: {},
        metadata: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "org-b",
        name: "Org B",
        slug: "org-b",
        status: "active",
        timezone: "America/La_Paz",
        branding: {},
        settings: {},
        metadata: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ] as never,
    venues: [],
    sectors: [],
    resources: [],
    venueLayouts: [],
    venueLayoutSectors: [],
    venueLayoutResources: [],
    eventLayouts: [],
    eventLayoutSectors: [],
    eventLayoutResources: [],
    events: [],
    guests: [],
    reservations: [],
    tables: [],
    checkIns: [],
    attempts: [],
    timelineEvents: [],
    whatsappDeliveryAttempts: [],
    currentOrganizationId: "org-a",
    currentEventId: "event-a",
    currentProfileId: "profile-owner-a",
    ...overrides,
  } as WorkspaceBootstrap;
}

function buildInviteRequest(organizationId: string, email = "member@example.com") {
  return new Request("http://localhost/api/accounts/invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      displayName: "Team Member",
      organizationId,
      roleSlug: "reception",
      area: "Entrada",
      permissions: ["accounts.view"],
      tempPassword: "temporary-123",
      confirmTempPassword: "temporary-123",
    }),
  });
}

function buildInviteDependencies(workspace: WorkspaceBootstrap) {
  const client = {
    auth: {
      admin: {
        updateUserById: async (uid: string) => {
          calls.updateUserById += 1;
          return {
            data: { user: { id: uid } },
            error: null,
          };
        },
      },
    },
  } as never;

  const calls = {
    getClient: 0,
    createRepositories: 0,
    getByEmail: 0,
    createUser: 0,
    updateUser: 0,
    getByOrganizationAndUser: 0,
    createMembership: 0,
    updateMembership: 0,
    findAuthIdentityByEmail: 0,
    updateUserById: 0,
    createOrUpdateTemporaryPasswordAuthIdentity: 0,
    linkPublicUserToAuthIdentity: 0,
    setPublicUserMustChangePassword: 0,
  };

  const repositories = {
    users: {
      getByEmail: async (email: string) => {
        calls.getByEmail += 1;
        return workspace.users.find((user) => user.email === email) ?? null;
      },
      update: async (id: string, user: Record<string, unknown>) => {
        calls.updateUser += 1;
        const nextUser = workspace.users.find((item) => item.id === id);
        if (!nextUser) {
          return null;
        }
        Object.assign(nextUser, user);
        return nextUser as never;
      },
      create: async (user: Record<string, unknown>) => {
        calls.createUser += 1;
        const nextUser = {
          id: String(user.id ?? "user-created"),
          authUserId: (user.authUserId as string | null | undefined) ?? null,
          email: String(user.email ?? ""),
          displayName: String(user.displayName ?? ""),
          mustChangePassword: Boolean(user.mustChangePassword),
          createdAt: String(user.createdAt ?? "2026-08-13T00:00:00.000Z"),
          updatedAt: String(user.updatedAt ?? "2026-08-13T00:00:00.000Z"),
          deletedAt: null,
        };
        workspace.users.push(nextUser as never);
        return nextUser as never;
      },
    },
    profiles: {
      getByOrganizationAndUser: async (organizationId: string, userId: string) => {
        calls.getByOrganizationAndUser += 1;
        return workspace.profiles.find((profile) => profile.organizationId === organizationId && profile.userId === userId) ?? null;
      },
      update: async (id: string, membership: Record<string, unknown>) => {
        calls.updateMembership += 1;
        const nextMembership = workspace.profiles.find((item) => item.id === id);
        if (!nextMembership) {
          return null;
        }
        Object.assign(nextMembership, membership);
        return nextMembership as never;
      },
      create: async (membership: Record<string, unknown>) => {
        calls.createMembership += 1;
        workspace.profiles.push(membership as never);
        return membership as never;
      },
    },
  } as never;

  return {
    calls,
    dependencies: {
      getAuthUser: async () => ({ id: "auth-owner", email: "owner@example.com" } as never),
      loadWorkspace: async () => workspace,
      getClient: () => {
        calls.getClient += 1;
        return client;
      },
      createRepositories: (client: unknown) => {
        void client;
        calls.createRepositories += 1;
        return repositories;
      },
      findAuthIdentityByEmail: async (_client: unknown, email: string) => {
        calls.findAuthIdentityByEmail += 1;
        if (email === "member-b@example.com") {
          return { id: "auth-member-b", email } as never;
        }
        if (email === "member@example.com") {
          return { id: "auth-member", email } as never;
        }
        return null;
      },
      createOrUpdateTemporaryPasswordAuthIdentity: async () => {
        calls.createOrUpdateTemporaryPasswordAuthIdentity += 1;
        return { data: { user: { id: "auth-created" } }, error: null } as never;
      },
      linkPublicUserToAuthIdentity: async (_client: unknown, userId: string, authUserId: string) => {
        calls.linkPublicUserToAuthIdentity += 1;
        const user = workspace.users.find((item) => item.id === userId);
        if (user) {
          user.authUserId = authUserId;
        }
        return user ?? null;
      },
      setPublicUserMustChangePassword: async (_client: unknown, userId: string, mustChangePassword: boolean) => {
        calls.setPublicUserMustChangePassword += 1;
        const user = workspace.users.find((item) => item.id === userId);
        if (user) {
          user.mustChangePassword = mustChangePassword;
        }
        return user ?? null;
      },
    },
  };
}

test("invite route rejects a forged organization and leaves the active organization untouched", async () => {
  const workspace = buildWorkspace();
  const { dependencies, calls } = buildInviteDependencies(workspace);

  const response = await handleInvite(buildInviteRequest("org-b"), dependencies);
  const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };

  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.code, "forbidden");
  assert.equal(calls.getClient, 0);
  assert.equal(calls.createRepositories, 0);
  assert.equal(calls.getByEmail, 0);
  assert.equal(calls.createUser, 0);
  assert.equal(calls.updateUser, 0);
  assert.equal(calls.getByOrganizationAndUser, 0);
  assert.equal(calls.createMembership, 0);
  assert.equal(calls.updateMembership, 0);
});

test("invite route accepts the active organization and persists the member there", async () => {
  const workspace = buildWorkspace();
  const { dependencies, calls } = buildInviteDependencies(workspace);

  const response = await handleInvite(buildInviteRequest("org-a", "member-b@example.com"), dependencies);
  const payload = (await response.json()) as {
    ok?: boolean;
    account?: { organizationId?: string };
    profile?: { organizationId?: string };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.account?.organizationId, "org-a");
  assert.equal(payload.profile?.organizationId, "org-a");
  assert.equal(calls.getClient, 1);
  assert.equal(calls.createRepositories, 1);
  assert.equal(calls.getByEmail, 1);
  assert.equal(calls.updateUser, 1);
  assert.equal(calls.getByOrganizationAndUser, 1);
  assert.equal(calls.createMembership, 1);
  assert.equal(calls.updateMembership, 0);
  assert.equal(calls.findAuthIdentityByEmail, 1);
  assert.equal(calls.setPublicUserMustChangePassword, 1);
  assert.equal(calls.updateUserById, 1);
  assert.equal(calls.linkPublicUserToAuthIdentity, 0);
  assert.equal(calls.createOrUpdateTemporaryPasswordAuthIdentity, 0);
});
