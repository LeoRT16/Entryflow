import assert from "node:assert/strict";
import test from "node:test";

import { buildOrganizationMembersModel, getRoleMvpIntent } from "../features/accounts/domain/members-directory";
import type { OrganizationAccount } from "../features/accounts/types";

function buildAccount(overrides: Partial<OrganizationAccount> = {}): OrganizationAccount {
  return {
    id: "account-1",
    organizationId: "org-1",
    userId: "user-1",
    userEmail: "member@example.com",
    userDisplayName: "Miembro Demo",
    displayName: "Miembro Demo",
    roleId: "preset-administrator",
    roleSlug: "administrator",
    roleName: "Administrador",
    rolePermissions: ["accounts.view", "accounts.manage"],
    permissions: ["accounts.view", "accounts.manage"],
    attributes: { area: "Recepción" },
    status: "active",
    isOwner: false,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    deletedAt: null,
    metadata: {},
    ...overrides,
  };
}

test("organization member model only includes visible accounts for the active organization", () => {
  const model = buildOrganizationMembersModel({
    accounts: [
      buildAccount({ id: "account-org-1", organizationId: "org-1", displayName: "Ana", userDisplayName: "Ana", userEmail: "ana@example.com", roleSlug: "reception", roleId: "preset-reception", roleName: "Recepción", rolePermissions: ["reservation.view"], permissions: ["reservation.view"] }),
      buildAccount({ id: "account-org-2", organizationId: "org-2", displayName: "Bruno", userDisplayName: "Bruno", userEmail: "bruno@example.com" }),
      buildAccount({ id: "bootstrap-account", organizationId: "org-1", displayName: "Bootstrap", userDisplayName: "Bootstrap", userEmail: "bootstrap@example.com" }),
    ],
    organizationId: "org-1",
    canManageAccounts: true,
    canManagePermissions: true,
  });

  assert.equal(model.organizationId, "org-1");
  assert.equal(model.totalMembers, 1);
  assert.equal(model.activeMembers, 1);
  assert.equal(model.inactiveMembers, 0);
  assert.equal(model.empty, false);
  assert.deepEqual(model.members.map((member) => member.id), ["account-org-1"]);
});

test("the last active owner is protected from deactivation", () => {
  const model = buildOrganizationMembersModel({
    accounts: [
      buildAccount({
        id: "owner-active",
        organizationId: "org-1",
        displayName: "Owner Activo",
        userDisplayName: "Owner Activo",
        userEmail: "owner@example.com",
        roleSlug: "owner",
        roleId: "preset-owner",
        roleName: "Owner",
        rolePermissions: ["accounts.view", "accounts.manage", "permissions.manage"],
        permissions: ["accounts.view", "accounts.manage", "permissions.manage"],
        isOwner: true,
      }),
      buildAccount({
        id: "owner-inactive",
        organizationId: "org-1",
        displayName: "Owner Inactivo",
        userDisplayName: "Owner Inactivo",
        userEmail: "owner2@example.com",
        roleSlug: "owner",
        roleId: "preset-owner",
        roleName: "Owner",
        rolePermissions: ["accounts.view", "accounts.manage", "permissions.manage"],
        permissions: ["accounts.view", "accounts.manage", "permissions.manage"],
        isOwner: true,
        status: "inactive",
      }),
    ],
    organizationId: "org-1",
    canManageAccounts: true,
    canManagePermissions: false,
  });

  const activeOwner = model.members.find((member) => member.id === "owner-active");
  const inactiveOwner = model.members.find((member) => member.id === "owner-inactive");

  assert.equal(model.ownerMembers, 2);
  assert.equal(activeOwner?.protectedOwner, true);
  assert.equal(activeOwner?.canDeactivate, false);
  assert.match(activeOwner?.deactivationHint ?? "", /último Owner activo/i);
  assert.equal(inactiveOwner?.protectedOwner, false);
  assert.equal(inactiveOwner?.canDeactivate, true);
});

test("read-only members model keeps the surface visible but non editable", () => {
  const model = buildOrganizationMembersModel({
    accounts: [
      buildAccount({ id: "member-1" }),
      buildAccount({ id: "member-2", displayName: "Inactivo", userDisplayName: "Inactivo", userEmail: "inactive@example.com", status: "inactive" }),
    ],
    organizationId: "org-1",
    canManageAccounts: false,
    canManagePermissions: false,
  });

  assert.equal(model.readOnly, true);
  assert.equal(model.canManageAccounts, false);
  assert.equal(model.canManagePermissions, false);
  assert.equal(model.activeMembers, 1);
  assert.equal(model.inactiveMembers, 1);
  assert.equal(model.members.find((member) => member.id === "member-2")?.status, "inactive");
});

test("removed members are hidden from the organization members surface", () => {
  const model = buildOrganizationMembersModel({
    accounts: [
      buildAccount({ id: "member-visible", displayName: "Visible", userDisplayName: "Visible", userEmail: "visible@example.com" }),
      buildAccount({
        id: "member-removed",
        displayName: "Removed",
        userDisplayName: "Removed",
        userEmail: "removed@example.com",
        metadata: { removed: true },
      }),
    ],
    organizationId: "org-1",
    canManageAccounts: true,
    canManagePermissions: true,
  });

  assert.deepEqual(model.members.map((member) => member.id), ["member-visible"]);
});

test("role intents stay aligned with the fixed MVP role presets", () => {
  assert.match(getRoleMvpIntent("owner").intent, /Control total/i);
  assert.match(getRoleMvpIntent("administrator").intent, /Acceso administrativo/i);
  assert.match(getRoleMvpIntent("reception").intent, /recepción, reservas e ingreso/i);
  assert.match(getRoleMvpIntent("door").intent, /admisión y check-in/i);
});
