import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSetupPasswordResolution,
  setupPasswordAction,
} from "../app/auth/setup-password/actions";

function buildRepositories({
  users,
  profiles,
  organizations,
}: {
  users: Array<{
    id: string;
    email: string;
    authUserId: string | null;
    deletedAt: string | null;
    mustChangePassword?: boolean;
  }>;
  profiles: Array<{
    id: string;
    userId: string;
    organizationId: string;
    deletedAt: string | null;
  }>;
  organizations: Array<{
    id: string;
    status: "active" | "paused" | "archived";
  }>;
}) {
  return {
    users: {
      list: async () => users.map((user) => ({ ...user })),
      getByEmail: async () => undefined,
      getById: async () => undefined,
      create: async () => {
        throw new Error("not used");
      },
      update: async () => {
        throw new Error("not used");
      },
      upsert: async () => {
        throw new Error("not used");
      },
      delete: async () => false,
    },
    profiles: {
      getByUser: async (userId: string) => profiles.filter((profile) => profile.userId === userId).map((profile) => ({ ...profile })),
      getByOrganization: async () => [],
      getByOrganizationAndUser: async () => undefined,
      list: async () => [],
      getById: async () => undefined,
      findById: async () => undefined,
      create: async () => {
        throw new Error("not used");
      },
      upsert: async () => {
        throw new Error("not used");
      },
      update: async () => {
        throw new Error("not used");
      },
      delete: async () => false,
    },
    organizations: {
      list: async () => organizations.map((organization) => ({ ...organization } as never)),
      getById: async () => undefined,
      findById: async () => undefined,
      create: async () => {
        throw new Error("not used");
      },
      upsert: async () => {
        throw new Error("not used");
      },
      update: async () => {
        throw new Error("not used");
      },
      delete: async () => false,
    },
  } as never;
}

test("setup-password resolves the canonical public user and keeps memberships intact", async () => {
  const users: Array<{
    id: string;
    email: string;
    authUserId: string | null;
    deletedAt: string | null;
    mustChangePassword?: boolean;
  }> = [
    {
      id: "user-owner",
      email: "owner@example.com",
      authUserId: null,
      deletedAt: null,
      mustChangePassword: true,
    },
  ];
  const profiles = [
    { id: "profile-a", userId: "user-owner", organizationId: "org-a", deletedAt: null },
    { id: "profile-b", userId: "user-owner", organizationId: "org-b", deletedAt: null },
  ];
  const organizations = [
    { id: "org-a", status: "active" as const },
    { id: "org-b", status: "active" as const },
  ];

  const resolution = await resolveSetupPasswordResolution(buildRepositories({ users, profiles, organizations }), {
    id: "auth-owner",
    email: "owner@example.com",
  });

  assert.ok(resolution);
  assert.equal(resolution?.publicUser.id, "user-owner");
  assert.equal(resolution?.activeMemberships.length, 2);

  const redirectCalls: string[] = [];
  const authUpdates: Array<Record<string, unknown>> = [];
  const linkCalls: Array<{ userId: string; authUserId: string }> = [];
  const mustChangeCalls: Array<{ userId: string; mustChangePassword: boolean }> = [];

  const formData = new FormData();
  formData.set("password", "temporary-123");
  formData.set("confirmPassword", "temporary-123");
  formData.set("next", "/users");

  const result = await setupPasswordAction(
    {},
    formData,
    {
      createAuthClient: async () =>
        ({
          auth: {
            getUser: async () => ({
              data: {
                user: {
                  id: "auth-owner",
                  email: "owner@example.com",
                },
              },
              error: null,
            }),
            updateUser: async (attributes: Record<string, unknown>) => {
              authUpdates.push(attributes);
              return { error: null };
            },
          },
      } as never),
      getPublicClient: () => ({}) as never,
      createRepositories: () =>
        buildRepositories({
          users,
          profiles,
          organizations,
        }),
      linkPublicUserToAuthIdentity: async (_client: unknown, userId: string, authUserId: string) => {
        linkCalls.push({ userId, authUserId });
        const user = users.find((row) => row.id === userId);
        if (user) {
          user.authUserId = authUserId;
        }
        return user ?? null;
      },
      setPublicUserMustChangePassword: async (_client: unknown, userId: string, mustChangePassword: boolean) => {
        mustChangeCalls.push({ userId, mustChangePassword });
        const user = users.find((row) => row.id === userId);
        if (user) {
          user.mustChangePassword = mustChangePassword;
        }
        return user ?? null;
      },
      redirect: (target: string) => {
        redirectCalls.push(target);
      },
    } as unknown as NonNullable<Parameters<typeof setupPasswordAction>[2]>,
  );

  assert.equal(result, undefined);
  assert.deepEqual(redirectCalls, ["/users"]);
  assert.equal(authUpdates.length, 1);
  assert.deepEqual(authUpdates[0], { password: "temporary-123" });
  assert.deepEqual(linkCalls, [{ userId: "user-owner", authUserId: "auth-owner" }]);
  assert.deepEqual(mustChangeCalls, [{ userId: "user-owner", mustChangePassword: false }]);
  assert.equal(users.find((row) => row.id === "user-owner")?.mustChangePassword, false);
  assert.deepEqual(
    profiles,
    [
      { id: "profile-a", userId: "user-owner", organizationId: "org-a", deletedAt: null },
      { id: "profile-b", userId: "user-owner", organizationId: "org-b", deletedAt: null },
    ],
  );
});

test("setup-password rejects ambiguous email matches instead of targeting another public user", async () => {
  const resolution = await resolveSetupPasswordResolution(
    buildRepositories({
      users: [
        { id: "user-target", email: "owner@example.com", authUserId: null, deletedAt: null },
        { id: "user-other", email: "owner@example.com", authUserId: "auth-other", deletedAt: null },
      ],
      profiles: [{ id: "profile-target", userId: "user-target", organizationId: "org-a", deletedAt: null }],
      organizations: [{ id: "org-a", status: "active" }],
    }),
    { id: "auth-owner", email: "owner@example.com" },
  );

  assert.equal(resolution, null);
});

test("setup-password rejects a public user already linked to another auth identity", async () => {
  const resolution = await resolveSetupPasswordResolution(
    buildRepositories({
      users: [{ id: "user-target", email: "owner@example.com", authUserId: "auth-other", deletedAt: null }],
      profiles: [{ id: "profile-target", userId: "user-target", organizationId: "org-a", deletedAt: null }],
      organizations: [{ id: "org-a", status: "active" }],
    }),
    { id: "auth-owner", email: "owner@example.com" },
  );

  assert.equal(resolution, null);
});

test("setup-password rejects deleted public users", async () => {
  const resolution = await resolveSetupPasswordResolution(
    buildRepositories({
      users: [{ id: "user-target", email: "owner@example.com", authUserId: "auth-owner", deletedAt: "2026-08-13T00:00:00.000Z" }],
      profiles: [{ id: "profile-target", userId: "user-target", organizationId: "org-a", deletedAt: null }],
      organizations: [{ id: "org-a", status: "active" }],
    }),
    { id: "auth-owner", email: "owner@example.com" },
  );

  assert.equal(resolution, null);
});

test("setup-password rejects users whose memberships are only deleted or inactive", async () => {
  const resolution = await resolveSetupPasswordResolution(
    buildRepositories({
      users: [{ id: "user-target", email: "owner@example.com", authUserId: null, deletedAt: null }],
      profiles: [
        { id: "profile-deleted", userId: "user-target", organizationId: "org-a", deletedAt: "2026-08-13T00:00:00.000Z" },
        { id: "profile-inactive-org", userId: "user-target", organizationId: "org-b", deletedAt: null },
      ],
      organizations: [
        { id: "org-a", status: "active" },
        { id: "org-b", status: "paused" },
      ],
    }),
    { id: "auth-owner", email: "owner@example.com" },
  );

  assert.equal(resolution, null);
});
