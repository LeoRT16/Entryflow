import assert from "node:assert/strict";
import test from "node:test";

import { handleAccountDeletion, handleAccountMutation } from "../app/api/accounts/[profileId]/route";
import type { AccountRolePreset, OrganizationMembership, AccountUser } from "../features/accounts/types";
import type { WorkspaceBootstrap } from "../services/workspace-loader";

function buildUser(overrides: Partial<AccountUser> = {}): AccountUser {
  return {
    id: "user-owner",
    authUserId: "auth-owner",
    authIdentityExists: true,
    mustChangePassword: false,
    email: "owner@example.com",
    displayName: "Owner",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function buildMembership(overrides: Partial<OrganizationMembership> & { id: string; userId: string; organizationId: string; roleId: string; displayName: string; status: "active" | "inactive" }): OrganizationMembership {
  return {
    id: overrides.id,
    organizationId: overrides.organizationId,
    userId: overrides.userId,
    roleId: overrides.roleId,
    displayName: overrides.displayName,
    attributes: {
      area: "Dirección",
      status: overrides.status,
      permissions: ["accounts.manage", "permissions.manage"],
      ...overrides.attributes,
    },
    status: overrides.status,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    deletedAt: overrides.deletedAt ?? null,
    metadata: {
      attributes: {
        area: "Dirección",
        status: overrides.status,
      },
      permissions: ["accounts.manage", "permissions.manage"],
      ...overrides.metadata,
    },
  };
}

function buildRole(overrides: Partial<AccountRolePreset> & Pick<AccountRolePreset, "id" | "slug" | "name" | "permissions">): AccountRolePreset {
  return {
    id: overrides.id,
    slug: overrides.slug,
    name: overrides.name,
    permissions: overrides.permissions,
    description: overrides.description,
    metadata: overrides.metadata,
  };
}

function buildWorkspace(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  const ownerRole = buildRole({ id: "role-owner", slug: "owner", name: "Owner", permissions: ["accounts.manage", "permissions.manage"] });
  const adminRole = buildRole({ id: "role-admin", slug: "administrator", name: "Administrador", permissions: ["accounts.manage"] });
  const receptionRole = buildRole({ id: "role-reception", slug: "reception", name: "Recepción", permissions: ["accounts.view"] });

  return {
    authState: {
      status: "ready",
      authUserId: "auth-owner",
      authUserEmail: "owner@example.com",
      publicUserId: "user-owner",
      organizationIds: ["org-a", "org-b"],
    },
    currentUserId: "user-owner",
    users: [buildUser(), buildUser({ id: "user-member", authUserId: "auth-member", email: "member@example.com", displayName: "Member" }), ...(overrides.users ?? [])],
    profiles: [
      buildMembership({ id: "profile-owner", userId: "user-owner", organizationId: "org-a", roleId: ownerRole.id, displayName: "Owner", status: "active" }),
      buildMembership({ id: "profile-member", userId: "user-member", organizationId: "org-a", roleId: receptionRole.id, displayName: "Member", status: "active" }),
      buildMembership({ id: "profile-owner-b", userId: "user-owner", organizationId: "org-b", roleId: adminRole.id, displayName: "Owner B", status: "active" }),
      ...(overrides.profiles ?? []),
    ],
    roles: [ownerRole, adminRole, receptionRole, ...(overrides.roles ?? [])],
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
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
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
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
        deletedAt: null,
      },
      ...(overrides.organizations ?? []),
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
    currentEventId: "",
    currentProfileId: "profile-owner",
    ...overrides,
  } as WorkspaceBootstrap;
}

function buildDependencies(workspace: WorkspaceBootstrap) {
  const state = {
    users: workspace.users.map((user) => ({ ...user })),
    profiles: workspace.profiles.map((profile) => ({ ...profile })),
  };

  const repositories = {
    users: {
      async update(id: string, patch: AccountUser) {
        const next = state.users.find((user) => user.id === id);
        if (!next) {
          return undefined;
        }
        Object.assign(next, patch);
        return { ...next };
      },
    },
    profiles: {
      async update(id: string, patch: OrganizationMembership) {
        const next = state.profiles.find((profile) => profile.id === id);
        if (!next) {
          return undefined;
        }
        Object.assign(next, patch);
        return { ...next };
      },
    },
  };

  return {
    getAuthUser: async () => ({ id: "auth-owner", email: "owner@example.com" }),
    loadWorkspace: async () => ({
      ...workspace,
      users: state.users.map((user) => ({ ...user })),
      profiles: state.profiles.map((profile) => ({ ...profile })),
    }),
    getClient: () => ({} as never),
    createRepositories: () => repositories as never,
    state,
  };
}

function jsonRequest(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
  return new Request("http://localhost/api/accounts/profile-owner", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("owner can edit own benign profile fields through the trusted account route", async () => {
  const workspace = buildWorkspace();
  const dependencies = buildDependencies(workspace);

  const response = await handleAccountMutation(
    jsonRequest("PATCH", {
      userEmail: "owner+updated@example.com",
      userDisplayName: "Owner Updated",
      displayName: "Owner Visible",
      area: "Dirección",
      status: "active",
      roleSlug: "owner",
      permissions: ["accounts.manage", "permissions.manage"],
    }),
    { params: Promise.resolve({ profileId: "profile-owner" }) },
    dependencies as never,
  );

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.account.displayName, "Owner Visible");
  assert.equal(payload.account.userDisplayName, "Owner Updated");
  assert.equal(payload.account.userEmail, "owner+updated@example.com");
  assert.equal(payload.profile.attributes.area, "Dirección");
  assert.equal(dependencies.state.users.find((user) => user.id === "user-owner")?.displayName, "Owner Updated");
});

test("critical self-disable remains blocked on the server route", async () => {
  const workspace = buildWorkspace();
  const dependencies = buildDependencies(workspace);

  const response = await handleAccountMutation(
    jsonRequest("PATCH", {
      status: "inactive",
      roleSlug: "owner",
      permissions: ["accounts.manage", "permissions.manage"],
    }),
    { params: Promise.resolve({ profileId: "profile-owner" }) },
    dependencies as never,
  );

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /desactivarte a vos mismo/i);
});

test("permission changes require permissions.manage while role updates stay allowed", async () => {
  const workspace = buildWorkspace();
  const dependencies = buildDependencies({
    ...workspace,
    profiles: [
      buildMembership({
        id: "profile-owner",
        userId: "user-owner",
        organizationId: "org-a",
        roleId: "role-admin",
        displayName: "Owner",
        status: "active",
        metadata: {
          permissions: ["accounts.manage"],
          attributes: {
            area: "Dirección",
            status: "active",
          },
        },
        attributes: {
          area: "Dirección",
          status: "active",
          permissions: ["accounts.manage"],
        },
      }),
      buildMembership({ id: "profile-member", userId: "user-member", organizationId: "org-a", roleId: "role-reception", displayName: "Member", status: "active" }),
    ],
    roles: [
      buildRole({ id: "role-owner", slug: "owner", name: "Owner", permissions: ["accounts.manage", "permissions.manage"] }),
      buildRole({ id: "role-admin", slug: "administrator", name: "Administrador", permissions: ["accounts.manage"] }),
      buildRole({ id: "role-reception", slug: "reception", name: "Recepción", permissions: ["accounts.view"] }),
    ],
  });

  const forbiddenResponse = await handleAccountMutation(
    jsonRequest("PATCH", {
      roleSlug: "administrator",
      permissions: ["permissions.manage"],
    }),
    { params: Promise.resolve({ profileId: "profile-member" }) },
    dependencies as never,
  );

  assert.equal(forbiddenResponse.status, 403);
  const forbiddenPayload = await forbiddenResponse.json();
  assert.equal(forbiddenPayload.ok, false);
  assert.match(forbiddenPayload.error.message, /modificar los permisos/i);

  const allowedResponse = await handleAccountMutation(
    jsonRequest("PATCH", {
      roleSlug: "administrator",
    }),
    { params: Promise.resolve({ profileId: "profile-member" }) },
    dependencies as never,
  );

  assert.equal(allowedResponse.status, 200);
  const allowedPayload = await allowedResponse.json();
  assert.equal(allowedPayload.ok, true);
  assert.equal(allowedPayload.account.roleSlug, "administrator");
});

test("other member delete persists through the trusted route and self delete stays blocked", async () => {
  const workspace = buildWorkspace();
  const dependencies = buildDependencies(workspace);

  const deleteResponse = await handleAccountDeletion(
    jsonRequest("DELETE"),
    { params: Promise.resolve({ profileId: "profile-member" }) },
    dependencies as never,
  );

  assert.equal(deleteResponse.status, 200);
  const deletePayload = await deleteResponse.json();
  assert.equal(deletePayload.ok, true);
  assert.equal(deletePayload.profile.deletedAt !== null, true);
  assert.equal(deletePayload.profile.metadata.removed, true);

  const selfDeleteResponse = await handleAccountDeletion(
    jsonRequest("DELETE"),
    { params: Promise.resolve({ profileId: "profile-owner" }) },
    dependencies as never,
  );

  assert.equal(selfDeleteResponse.status, 403);
  const selfDeletePayload = await selfDeleteResponse.json();
  assert.equal(selfDeletePayload.ok, false);
  assert.match(selfDeletePayload.error.message, /eliminar tu propia cuenta/i);
});
