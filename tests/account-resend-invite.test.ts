import assert from "node:assert/strict";
import test from "node:test";

import type { AuthIdentity, TemporaryPasswordAuthResult } from "../app/api/accounts/auth-onboarding";
import { handleResendInvite } from "../app/api/accounts/resend-invite/handler";
import type { WorkspaceBootstrap } from "../services/workspace-loader";

function buildWorkspace(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  return {
    authState: {
      status: "ready",
      authUserId: "auth-owner",
      authUserEmail: "owner@example.com",
      publicUserId: "user-owner",
      organizationIds: ["org-1"],
    },
    currentUserId: "user-owner",
    users: [],
    profiles: [],
    roles: [],
    organizations: [],
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
    currentOrganizationId: "org-1",
    currentEventId: "event-1",
    currentProfileId: "profile-owner",
    ...overrides,
  };
}

function buildRequest(memberId = "profile-guest", tempPassword = "temporary-123") {
  return new Request("http://localhost/api/accounts/resend-invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      memberId,
      tempPassword,
      confirmTempPassword: tempPassword,
    }),
  });
}

function buildDependencies({
  workspace,
  authIdentity,
  updateResult,
  createResult,
}: {
  workspace: WorkspaceBootstrap;
  authIdentity: AuthIdentity | null;
  updateResult?: { data: { user: { id: string } | null }; error: Error | null };
  createResult?: TemporaryPasswordAuthResult;
}) {
  const updateCalls: Array<{ uid: string; attributes: Record<string, unknown> }> = [];
  const createCalls: Array<{ email: string; password: string }> = [];
  const linkCalls: Array<{ userId: string; authUserId: string }> = [];
  const flagCalls: Array<{ userId: string; mustChangePassword: boolean }> = [];

  return {
    dependencies: {
      getAuthUser: async () => ({ id: "auth-owner", email: "owner@example.com" } as never),
      loadWorkspace: async () => workspace,
      getClient: () =>
        ({
          auth: {
            admin: {
              updateUserById: async (uid: string, attributes: Record<string, unknown>) => {
                updateCalls.push({ uid, attributes });
                return updateResult ?? { data: { user: { id: uid } }, error: null };
              },
            },
          },
        } as never),
      findAuthIdentityByEmail: async () => authIdentity,
      createOrUpdateTemporaryPasswordAuthIdentity: async (_client: unknown, params: { email: string; password: string }) => {
        createCalls.push(params);
        return createResult ?? { data: { user: { id: "auth-new-guest" }, mode: "created" }, error: null };
      },
      linkPublicUserToAuthIdentity: async (_client: unknown, userId: string, authUserId: string) => {
        linkCalls.push({ userId, authUserId });
        const nextUser = workspace.users.find((user) => user.id === userId);
        if (nextUser) {
          nextUser.authUserId = authUserId;
          return nextUser;
        }
        return null;
      },
      setPublicUserMustChangePassword: async (_client: unknown, userId: string, mustChangePassword: boolean) => {
        flagCalls.push({ userId, mustChangePassword });
        const nextUser = workspace.users.find((user) => user.id === userId);
        if (nextUser) {
          nextUser.mustChangePassword = mustChangePassword;
          return nextUser;
        }
        return null;
      },
    },
    updateCalls,
    createCalls,
    linkCalls,
    flagCalls,
  };
}

test("reset temporary password creates and links a fresh auth identity when none exists", async () => {
  const workspace = buildWorkspace({
    profiles: [
      {
        id: "profile-owner",
        organizationId: "org-1",
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
        id: "profile-guest",
        organizationId: "org-1",
        userId: "user-guest",
        roleId: "role-reception",
        displayName: "Guest",
        attributes: { permissions: [], status: "active" },
        status: "active",
        metadata: { permissions: [], attributes: { status: "active" } },
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
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
        id: "user-guest",
        authUserId: null,
        email: "guest@example.com",
        displayName: "Guest",
        mustChangePassword: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [
      { id: "role-owner", slug: "owner", name: "Owner", permissions: ["accounts.manage"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
      { id: "role-reception", slug: "reception", name: "Recepción", permissions: ["reservation.view"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
    ] as never,
    organizations: [
      { id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {}, metadata: null, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null },
    ] as never,
  });

  const beforeProfiles = JSON.stringify(workspace.profiles);
  const { dependencies, createCalls, linkCalls, flagCalls, updateCalls } = buildDependencies({
    workspace,
    authIdentity: null,
  });

  const response = await handleResendInvite(buildRequest(), dependencies);
  const payload = (await response.json()) as { ok?: boolean; authUserId?: string | null; mode?: string };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "reset");
  assert.equal(payload.authUserId, "auth-new-guest");
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0]?.email, "guest@example.com");
  assert.equal(createCalls[0]?.password, "temporary-123");
  assert.equal(updateCalls.length, 0);
  assert.equal(linkCalls.length, 1);
  assert.equal(linkCalls[0]?.authUserId, "auth-new-guest");
  assert.equal(flagCalls.length, 1);
  assert.equal(flagCalls[0]?.mustChangePassword, true);
  assert.equal(workspace.users.find((user) => user.id === "user-guest")?.authUserId, "auth-new-guest");
  assert.equal(workspace.users.find((user) => user.id === "user-guest")?.mustChangePassword, true);
  assert.equal(JSON.stringify(workspace.profiles), beforeProfiles);
});

test("reset temporary password updates an existing auth identity and keeps the member unique", async () => {
  const workspace = buildWorkspace({
    profiles: [
      {
        id: "profile-owner",
        organizationId: "org-1",
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
        id: "profile-guest",
        organizationId: "org-1",
        userId: "user-guest",
        roleId: "role-reception",
        displayName: "Guest",
        attributes: { permissions: [], status: "active" },
        status: "active",
        metadata: { permissions: [], attributes: { status: "active" } },
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
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
        id: "user-guest",
        authUserId: null,
        email: "guest@example.com",
        displayName: "Guest",
        mustChangePassword: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [
      { id: "role-owner", slug: "owner", name: "Owner", permissions: ["accounts.manage"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
      { id: "role-reception", slug: "reception", name: "Recepción", permissions: ["reservation.view"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
    ] as never,
    organizations: [
      { id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {}, metadata: null, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null },
    ] as never,
  });

  const { dependencies, updateCalls, linkCalls, flagCalls } = buildDependencies({
    workspace,
    authIdentity: {
      id: "auth-guest",
      email: "guest@example.com",
      email_confirmed_at: "2026-08-13T21:51:23.609074Z",
      confirmed_at: "2026-08-13T21:51:23.609074Z",
      invited_at: "2026-08-13T21:50:20.98511Z",
      last_sign_in_at: "2026-08-13T21:51:23.615896Z",
    },
  });

  const response = await handleResendInvite(buildRequest(), dependencies);
  const payload = (await response.json()) as { ok?: boolean; authUserId?: string | null; mode?: string };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "reset");
  assert.equal(payload.authUserId, "auth-guest");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.uid, "auth-guest");
  assert.equal(linkCalls.length, 1);
  assert.equal(linkCalls[0]?.authUserId, "auth-guest");
  assert.equal(flagCalls.length, 1);
  assert.equal(flagCalls[0]?.mustChangePassword, true);
  assert.equal(workspace.users.find((user) => user.id === "user-guest")?.authUserId, "auth-guest");
  assert.equal(workspace.users.find((user) => user.id === "user-guest")?.mustChangePassword, true);
});

test("reset temporary password is denied when the auth identity is owned by another member", async () => {
  const workspace = buildWorkspace({
    profiles: [
      {
        id: "profile-owner",
        organizationId: "org-1",
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
        id: "profile-guest",
        organizationId: "org-1",
        userId: "user-guest",
        roleId: "role-reception",
        displayName: "Guest",
        attributes: { permissions: [], status: "active" },
        status: "active",
        metadata: { permissions: [], attributes: { status: "active" } },
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
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
        id: "user-guest",
        authUserId: null,
        email: "guest@example.com",
        displayName: "Guest",
        mustChangePassword: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "user-other",
        authUserId: "auth-guest",
        email: "other@example.com",
        displayName: "Other",
        mustChangePassword: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [
      { id: "role-owner", slug: "owner", name: "Owner", permissions: ["accounts.manage"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
      { id: "role-reception", slug: "reception", name: "Recepción", permissions: ["reservation.view"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
    ] as never,
    organizations: [
      { id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {}, metadata: null, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null },
    ] as never,
  });

  const { dependencies, updateCalls, createCalls, linkCalls, flagCalls } = buildDependencies({
    workspace,
    authIdentity: {
      id: "auth-guest",
      email: "guest@example.com",
      email_confirmed_at: "2026-08-13T21:51:23.609074Z",
      confirmed_at: "2026-08-13T21:51:23.609074Z",
      invited_at: "2026-08-13T21:50:20.98511Z",
      last_sign_in_at: "2026-08-13T21:51:23.615896Z",
    },
  });

  const response = await handleResendInvite(buildRequest(), dependencies);

  assert.equal(response.status, 409);
  assert.equal(updateCalls.length, 0);
  assert.equal(createCalls.length, 0);
  assert.equal(linkCalls.length, 0);
  assert.equal(flagCalls.length, 0);
});

test("reset temporary password is denied when the auth identity email does not match the member", async () => {
  const workspace = buildWorkspace({
    profiles: [
      {
        id: "profile-owner",
        organizationId: "org-1",
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
        id: "profile-guest",
        organizationId: "org-1",
        userId: "user-guest",
        roleId: "role-reception",
        displayName: "Guest",
        attributes: { permissions: [], status: "active" },
        status: "active",
        metadata: { permissions: [], attributes: { status: "active" } },
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
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
        id: "user-guest",
        authUserId: null,
        email: "guest@example.com",
        displayName: "Guest",
        mustChangePassword: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [
      { id: "role-owner", slug: "owner", name: "Owner", permissions: ["accounts.manage"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
      { id: "role-reception", slug: "reception", name: "Recepción", permissions: ["reservation.view"], createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null, description: null, metadata: null },
    ] as never,
    organizations: [
      { id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {}, metadata: null, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", deletedAt: null },
    ] as never,
  });

  const { dependencies, updateCalls, createCalls, linkCalls, flagCalls } = buildDependencies({
    workspace,
    authIdentity: {
      id: "auth-guest",
      email: "other@example.com",
      email_confirmed_at: "2026-08-13T21:51:23.609074Z",
      confirmed_at: "2026-08-13T21:51:23.609074Z",
      invited_at: "2026-08-13T21:50:20.98511Z",
      last_sign_in_at: "2026-08-13T21:51:23.615896Z",
    },
  });

  const response = await handleResendInvite(buildRequest(), dependencies);

  assert.equal(response.status, 409);
  assert.equal(updateCalls.length, 0);
  assert.equal(createCalls.length, 0);
  assert.equal(linkCalls.length, 0);
  assert.equal(flagCalls.length, 0);
});

test("unauthenticated caller is rejected", async () => {
  const response = await handleResendInvite(buildRequest(), {
    getAuthUser: async () => null,
    loadWorkspace: async () => buildWorkspace(),
    getClient: () => null,
    findAuthIdentityByEmail: async () => null,
    createOrUpdateTemporaryPasswordAuthIdentity: async () => ({ data: { user: null, mode: "created" }, error: null }),
    linkPublicUserToAuthIdentity: async () => null,
    setPublicUserMustChangePassword: async () => null,
  });

  assert.equal(response.status, 401);
});
