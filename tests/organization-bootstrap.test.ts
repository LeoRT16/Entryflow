import assert from "node:assert/strict";
import test from "node:test";

import { handleOrganizationBootstrap } from "../app/api/organizations/route";
import type { AccountRolePreset } from "../features/accounts/types";
import type { Organization } from "../features/domain/types";
import type { WorkspaceBootstrap } from "../services/workspace-loader";

type TestAuthUser = {
  id: string;
  email?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
};

type TestProfile = {
  id?: string;
  organizationId?: string;
  userId?: string;
  roleId?: string;
  deletedAt?: string | null;
  [key: string]: unknown;
};

type TestOrganization = Organization & { deletedAt?: string | null };

type TestRepositoryState = {
  users: unknown[];
  profiles: TestProfile[];
  organizations: TestOrganization[];
  roles: Array<{ slug?: string; [key: string]: unknown }>;
};

function buildWorkspace(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  const ownerRole: AccountRolePreset = {
    id: "role-owner-db",
    slug: "owner",
    name: "Owner",
    permissions: ["organization.view", "organization.manage"],
  };

  const administratorRole: AccountRolePreset = {
    id: "role-admin-db",
    slug: "administrator",
    name: "Administrator",
    permissions: ["organization.view", "organization.manage"],
  };

  return {
    authState: {
      status: "ready",
      authUserId: "auth-user-1",
      authUserEmail: "owner@example.com",
      publicUserId: "user-1",
      organizationIds: ["org-a"],
    },
    currentUserId: "user-1",
    users: [
      {
        id: "user-1",
        authUserId: "auth-user-1",
        email: "owner@example.com",
        displayName: "Leo",
        mustChangePassword: false,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        deletedAt: null,
      },
    ],
    profiles: [
      {
        id: "profile-a",
        organizationId: "org-a",
        userId: "user-1",
        roleId: administratorRole.id,
        displayName: "Leo",
        attributes: { status: "active", permissions: ["organization.view", "organization.manage"] },
        status: "active",
        metadata: { attributes: { status: "active", permissions: ["organization.view", "organization.manage"] } },
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [
      {
        ...ownerRole,
        description: null,
        metadata: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        deletedAt: null,
      },
      {
        ...administratorRole,
        description: null,
        metadata: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        deletedAt: null,
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
        settings: { timezone: "America/La_Paz" },
        metadata: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
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
    currentEventId: "",
    currentProfileId: "profile-a",
    ...overrides,
  } as WorkspaceBootstrap;
}

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/organizations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function buildDependencies(workspace: WorkspaceBootstrap, options?: { authUser?: { id: string; email: string } | null; failProfileCreate?: boolean }) {
  const state: TestRepositoryState = {
    users: structuredClone(workspace.users),
    profiles: structuredClone(workspace.profiles),
    organizations: structuredClone(workspace.organizations) as TestOrganization[],
    roles: structuredClone(workspace.roles),
  };
  const hasAuthUserOverride = options !== undefined && Object.prototype.hasOwnProperty.call(options, "authUser");
  const authState = workspace.authState.status === "ready" ? workspace.authState : null;

  const buildAuthUser = (userId: string, email: string | null): TestAuthUser => ({
    id: userId,
    email: email ?? undefined,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-08-20T10:00:00.000Z",
  });

  const dependencies = {
    getAuthUser: async () =>
      hasAuthUserOverride
        ? options?.authUser
          ? buildAuthUser(options.authUser.id, options.authUser.email)
          : null
        : authState
          ? buildAuthUser(authState.authUserId, authState.authUserEmail)
          : null,
    loadWorkspace: async () => structuredClone(workspace),
    getClient: () => ({}) as never,
    createRepositories: () =>
      ({
        users: {
          list: async () => state.users as never,
        },
        roles: {
          getBySlug: async (slug: string) => state.roles.find((role: { slug?: string }) => role.slug === slug) ?? null,
        },
        profiles: {
          getByOrganizationAndUser: async (organizationId: string, userId: string) =>
            state.profiles.find(
              (profile: { organizationId?: string; userId?: string; deletedAt?: string | null }) =>
                profile.organizationId === organizationId && profile.userId === userId && !profile.deletedAt,
            ) ?? null,
          create: async (profile: Record<string, unknown>) => {
            if (options?.failProfileCreate) {
              throw new Error("profile-create-failed");
            }

            const nextProfile = {
              id: String(profile.id ?? `profile-${state.profiles.length + 1}`),
              organizationId: String(profile.organizationId ?? ""),
              userId: String(profile.userId ?? ""),
              roleId: String(profile.roleId ?? ""),
              displayName: String(profile.displayName ?? ""),
              attributes: (profile.attributes as Record<string, unknown>) ?? {},
              status: String(profile.status ?? "active"),
              metadata: (profile.metadata as Record<string, unknown>) ?? null,
              createdAt: String(profile.createdAt ?? "2026-08-20T10:00:00.000Z"),
              updatedAt: String(profile.updatedAt ?? "2026-08-20T10:00:00.000Z"),
              deletedAt: null,
            };
            state.profiles.push(nextProfile as never);
            return nextProfile as never;
          },
          update: async (id: string, profile: Record<string, unknown>) => {
            const current = state.profiles.find((item: { id?: string }) => item.id === id);
            if (!current) {
              return null;
            }
            Object.assign(current, profile);
            return current as never;
          },
        },
        organizations: {
          getById: async (id: string) =>
            state.organizations.find((organization: { id?: string; deletedAt?: string | null }) => organization.id === id && !organization.deletedAt) ?? null,
          getBySlug: async (slug: string) =>
            state.organizations.find((organization: { slug?: string }) => organization.slug === slug) ?? null,
          create: async (organization: Partial<Organization>) => {
            const nextOrganization = {
              id: String(organization.id ?? `org-${state.organizations.length + 1}`),
              name: String(organization.name ?? ""),
              slug: String(organization.slug ?? ""),
              status: (organization.status as Organization["status"]) ?? "active",
              timezone: String(organization.timezone ?? "America/La_Paz"),
              branding: (organization.branding as Organization["branding"]) ?? {},
              settings: (organization.settings as Organization["settings"]) ?? {},
              metadata: (organization.metadata as Record<string, unknown> | undefined) ?? null,
              createdAt: "2026-08-20T10:00:00.000Z",
              updatedAt: "2026-08-20T10:00:00.000Z",
              deletedAt: null,
            };
            state.organizations.push(nextOrganization as never);
            return nextOrganization as never;
          },
          update: async (id: string, organization: Partial<Organization>) => {
            const current = state.organizations.find((item: { id?: string }) => item.id === id);
            if (!current) {
              return null;
            }
            Object.assign(current, organization);
            return current as never;
          },
          delete: async (id: string) => {
            const current = state.organizations.find((item: { id?: string; deletedAt?: string | null }) => item.id === id);
            if (!current) {
              return false;
            }
            current.deletedAt = "2026-08-20T10:00:01.000Z";
            return true;
          },
        },
      }) as never,
  };

  return { dependencies, state };
}

test("trusted organization bootstrap creates a new organization and owner membership", async () => {
  const workspace = buildWorkspace();
  const { dependencies, state } = buildDependencies(workspace);

  const response = await handleOrganizationBootstrap(
    buildRequest({
      id: "client-generated-id",
      name: "La Rota Carlota",
      slug: "la-rota-carlota",
      timezone: "America/La_Paz",
      creatorUserId: "forged-user",
      ownerRoleId: "forged-role",
    }),
    dependencies,
  );

  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    ok: boolean;
    created: boolean;
    organization: Organization & { deletedAt?: string | null };
    profile: TestProfile;
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.created, true);
  assert.equal(state.users.length, 1);
  assert.equal(state.organizations.length, 2);
  assert.equal(state.profiles.length, 2);
  assert.equal(payload.organization.name, "La Rota Carlota");
  assert.equal(payload.organization.slug, "la-rota-carlota");
  assert.equal(payload.profile.id, state.profiles[1]?.id);
  assert.equal(payload.profile.userId, "user-1");
  assert.equal(payload.profile.roleId, "role-owner-db");
  assert.equal(payload.profile.organizationId, payload.organization.id);
  assert.equal(state.profiles[1]?.userId, "user-1");
  assert.equal(state.profiles[1]?.roleId, "role-owner-db");
  assert.equal(state.profiles[1]?.organizationId, payload.organization.id);
  assert.equal(state.profiles[1]?.status, "active");
  assert.equal(state.profiles[0]?.roleId, "role-admin-db");
});

test("trusted organization bootstrap rejects unauthenticated requests", async () => {
  const workspace = buildWorkspace();
  const { dependencies } = buildDependencies(workspace, { authUser: null });

  const response = await handleOrganizationBootstrap(
    buildRequest({
      name: "Nueva organización",
      timezone: "America/La_Paz",
    }),
    dependencies,
  );

  assert.equal(response.status, 401);
});

test("trusted organization bootstrap updates only the current organization", async () => {
  const workspace = buildWorkspace();
  const { dependencies, state } = buildDependencies(workspace);

  const response = await handleOrganizationBootstrap(
    buildRequest({
      id: "org-a",
      name: "Org A renovada",
      slug: "org-a-renovada",
      timezone: "America/Argentina/Buenos_Aires",
    }),
    dependencies,
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    ok: boolean;
    created: boolean;
    organization: Organization & { deletedAt?: string | null };
    profile: TestProfile;
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.created, false);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.organizations[0]?.name, "Org A renovada");
  assert.equal(state.profiles.length, 1);
  assert.equal(payload.profile.id, "profile-a");
});

test("trusted organization bootstrap rejects cross-organization edits", async () => {
  const workspace = buildWorkspace({
    organizations: [
      ...buildWorkspace().organizations,
      {
        id: "org-b",
        name: "Org B",
        slug: "org-b",
        status: "active",
        timezone: "America/La_Paz",
        branding: {},
        settings: { timezone: "America/La_Paz" },
        metadata: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        deletedAt: null,
      },
    ] as never,
  });
  const { dependencies, state } = buildDependencies(workspace);

  const response = await handleOrganizationBootstrap(
    buildRequest({
      id: "org-b",
      name: "Org B nueva",
      timezone: "America/La_Paz",
    }),
    dependencies,
  );

  assert.equal(response.status, 403);
  assert.equal(state.organizations.length, 2);
  assert.equal(state.organizations[1]?.name, "Org B");
});

test("trusted organization bootstrap rolls back the organization if owner membership creation fails", async () => {
  const workspace = buildWorkspace();
  const { dependencies, state } = buildDependencies(workspace, { failProfileCreate: true });

  const response = await handleOrganizationBootstrap(
    buildRequest({
      name: "Org temporal",
      timezone: "America/La_Paz",
    }),
    dependencies,
  );

  assert.equal(response.status, 500);
  assert.equal(state.organizations.length, 2);
  assert.equal(state.organizations[1]?.deletedAt, "2026-08-20T10:00:01.000Z");
  assert.equal(state.profiles.length, 1);
});

test("trusted organization bootstrap resolves slug collisions for new organizations", async () => {
  const workspace = buildWorkspace({
    organizations: [
      ...buildWorkspace().organizations,
      {
        id: "org-duplicate",
        name: "Nueva organización",
        slug: "nueva-organizacion",
        status: "active",
        timezone: "America/La_Paz",
        branding: {},
        settings: { timezone: "America/La_Paz" },
        metadata: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        deletedAt: null,
      },
    ] as never,
  });
  const { dependencies, state } = buildDependencies(workspace);

  const response = await handleOrganizationBootstrap(
    buildRequest({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Nueva organización",
      timezone: "America/La_Paz",
    }),
    dependencies,
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    ok: boolean;
    created: boolean;
    organization: Organization & { deletedAt?: string | null };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.created, true);
  assert.equal(payload.organization.slug, "nueva-organizacion-11111111");
  assert.equal(state.organizations.at(-1)?.slug, "nueva-organizacion-11111111");
  assert.equal(state.organizations[2]?.slug, "nueva-organizacion-11111111");
});
