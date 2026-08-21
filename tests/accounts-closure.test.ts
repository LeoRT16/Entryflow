import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCriticalSelfMutationBlockReason } from "../features/accounts/domain/accounts-domain";
import { mapProfileRowToDomain, mapProfileToRow } from "../lib/supabase/mappers";

test("critical self mutations are blocked before account writes", () => {
  const ownerAccount = {
    id: "profile-owner",
    userId: "user-owner",
    isOwner: true,
    permissions: ["accounts.manage", "permissions.manage"],
  } as const;

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: ownerAccount,
      targetAccountId: ownerAccount.id,
      nextStatus: "inactive",
      nextRoleSlug: "owner",
      nextPermissions: [...ownerAccount.permissions],
    }),
    "No podés desactivarte a vos mismo.",
  );

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: ownerAccount,
      targetAccountId: ownerAccount.id,
      nextStatus: "active",
      nextRoleSlug: "administrator",
      nextPermissions: ["accounts.manage"],
    }),
    "No podés quitarte el rol Owner de tu propia cuenta.",
  );

  const adminAccount = {
    id: "profile-admin",
    userId: "user-admin",
    isOwner: false,
    permissions: ["accounts.manage", "permissions.manage"],
  } as const;

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: adminAccount,
      targetAccountId: adminAccount.id,
      nextStatus: "active",
      nextRoleSlug: "administrator",
      nextPermissions: ["permissions.manage"],
    }),
    "No podés quitarte accounts.manage de tu propia cuenta.",
  );

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: adminAccount,
      targetAccountId: adminAccount.id,
      nextStatus: "active",
      nextRoleSlug: "administrator",
      nextPermissions: ["accounts.manage"],
    }),
    "No podés quitarte permissions.manage de tu propia cuenta.",
  );

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: adminAccount,
      targetAccountId: "profile-alt",
      targetUserId: adminAccount.userId,
      nextStatus: "inactive",
      nextRoleSlug: "administrator",
      nextPermissions: ["accounts.manage", "permissions.manage"],
    }),
    "No podés desactivarte a vos mismo.",
  );

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: adminAccount,
      targetAccountId: "profile-other",
      targetUserId: "user-other",
      nextStatus: "inactive",
      nextRoleSlug: "administrator",
      nextPermissions: ["accounts.manage", "permissions.manage"],
    }),
    null,
  );

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: adminAccount,
      targetAccountId: adminAccount.id,
      targetUserId: adminAccount.userId,
      nextStatus: "inactive",
      nextRoleSlug: "administrator",
      nextPermissions: ["accounts.manage", "permissions.manage"],
      action: "delete",
    }),
    "No podés eliminar tu propia cuenta.",
  );

  assert.equal(
    getCriticalSelfMutationBlockReason({
      currentAccount: ownerAccount,
      targetAccountId: ownerAccount.id,
      targetUserId: ownerAccount.userId,
      nextStatus: "active",
      nextRoleSlug: "owner",
      nextPermissions: [...ownerAccount.permissions],
    }),
    null,
  );
});

test("inactive membership status is persisted through the profile mapper", () => {
  const domainProfile = mapProfileRowToDomain({
    id: "profile-inactive",
    user_id: "user-inactive",
    organization_id: "org-1",
    role_id: "role-reception",
    display_name: "Miembro Inactivo",
    metadata: {
      attributes: {
        status: "inactive",
        area: "Puerta",
      },
    },
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    deleted_at: null,
  });

  assert.equal(domainProfile.status, "inactive");
  assert.equal(domainProfile.deletedAt, null);

  const row = mapProfileToRow({
    ...domainProfile,
    status: "inactive",
    attributes: {
      ...domainProfile.attributes,
      status: "inactive",
    },
  });

  const rowMetadata = row.metadata as { attributes?: { status?: string; area?: string } } | null;

  assert.equal(rowMetadata?.attributes?.status, "inactive");
  assert.equal(rowMetadata?.attributes?.area, "Puerta");
});

test("the proposed RLS migration scopes users, profiles, roles, and organizations by membership", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260820000001_users_roles_permissions_closure.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /create or replace function public\.current_app_user_id\(\)/);
  assert.match(migration, /create or replace function public\.current_organization_ids\(\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /drop policy if exists "Allow all access" on public\.organizations/);
  assert.match(migration, /drop policy if exists "Allow all access" on public\.roles/);
  assert.match(migration, /drop policy if exists "Allow all access" on public\.users/);
  assert.match(migration, /drop policy if exists "Allow all access" on public\.profiles/);
  assert.match(migration, /drop policy if exists "Tenant-scoped organization read" on public\.organizations/);
  assert.match(migration, /drop policy if exists "Tenant-scoped role read" on public\.roles/);
  assert.match(migration, /drop policy if exists "Tenant-scoped user read" on public\.users/);
  assert.match(migration, /drop policy if exists "Tenant-scoped profile read" on public\.profiles/);
  assert.match(migration, /create policy "Tenant-scoped organization read"/);
  assert.match(migration, /create policy "Tenant-scoped user read"/);
  assert.match(migration, /create policy "Tenant-scoped profile read"/);
  assert.match(migration, /create policy "Tenant-scoped role read"/);
  assert.equal(/for (insert|update|delete)\b/i.test(migration), false);
  assert.match(migration, /organizations\.id = any\(public\.current_organization_ids\(\)\)/);
  assert.match(migration, /profiles\.organization_id = any\(public\.current_organization_ids\(\)\)/);
  assert.match(migration, /exists \(\s*select 1\s*from public\.profiles as p\s*where p\.user_id = users\.id/);
  assert.equal(migration.includes("join public.profiles as viewer_profile"), false);
  assert.equal(migration.includes("public.users as viewer"), false);
});
