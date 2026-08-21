import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildOrganizationSwitcherOptions } from "../features/settings/domain/organization-settings";
import type { AccountRolePreset } from "../features/accounts/types";
import type { Organization } from "../features/domain/types";

const settingsPageSource = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
const workspaceServiceSource = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");

function buildOrganization(overrides: Partial<Organization>): Organization {
  return {
    id: overrides.id ?? "org-a",
    name: overrides.name ?? "Org A",
    slug: overrides.slug ?? "org-a",
    status: overrides.status ?? "active",
    timezone: overrides.timezone ?? "America/La_Paz",
    branding: overrides.branding ?? {},
    settings: overrides.settings ?? { timezone: overrides.timezone ?? "America/La_Paz" },
    metadata: overrides.metadata ?? undefined,
  };
}

const ownerRole: AccountRolePreset = {
  id: "role-owner",
  slug: "owner",
  name: "Owner",
  permissions: ["organization.view", "organization.manage"],
};

const administratorRole: AccountRolePreset = {
  id: "role-admin",
  slug: "administrator",
  name: "Administrator",
  permissions: ["organization.view", "organization.manage"],
};

test("settings page wires organization selector and create modal", () => {
  assert.match(settingsPageSource, /OrganizationCreationModal/);
  assert.match(settingsPageSource, /buildOrganizationSwitcherOptions/);
  assert.match(settingsPageSource, /setCurrentOrganizationId/);
  assert.match(settingsPageSource, /Rol actual:/);
  assert.match(settingsPageSource, /\+ Crear organización/);
  assert.match(settingsPageSource, /currentOrganization\.id/);
});

test("workspace service organization save uses the trusted server endpoint", () => {
  assert.match(workspaceServiceSource, /fetch\("\/api\/organizations"/);
  assert.match(workspaceServiceSource, /saveOrganizationOnServer/);
  assert.doesNotMatch(workspaceServiceSource, /repositories\.organizations\.upsert\(value as Organization\)/);
});

test("organization switcher only lists memberships for the current user", () => {
  const options = buildOrganizationSwitcherOptions({
    organizations: [
      buildOrganization({ id: "org-a", name: "Org A" }),
      buildOrganization({ id: "org-b", name: "Org B" }),
      buildOrganization({ id: "org-c", name: "Org C" }),
    ],
    profiles: [
      {
        id: "profile-a",
        organizationId: "org-a",
        userId: "user-1",
        roleId: ownerRole.id,
        displayName: "Leo",
        attributes: {},
        status: "active",
        createdAt: "2026-08-21T10:00:00.000Z",
        updatedAt: "2026-08-21T10:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "profile-b",
        organizationId: "org-b",
        userId: "user-1",
        roleId: administratorRole.id,
        displayName: "Leo",
        attributes: {},
        status: "active",
        createdAt: "2026-08-21T10:00:00.000Z",
        updatedAt: "2026-08-21T10:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "profile-c",
        organizationId: "org-c",
        userId: "user-2",
        roleId: administratorRole.id,
        displayName: "Another",
        attributes: {},
        status: "active",
        createdAt: "2026-08-21T10:00:00.000Z",
        updatedAt: "2026-08-21T10:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [ownerRole, administratorRole],
    currentUserId: "user-1",
    currentOrganizationId: "org-b",
  });

  assert.deepEqual(
    options.map((option) => option.id),
    ["org-b", "org-a"],
  );
  assert.equal(options[0]?.isCurrent, true);
  assert.equal(options[0]?.roleName, "Administrator");
  assert.equal(options[1]?.roleName, "Owner");
  assert.equal(options.some((option) => option.id === "org-c"), false);
});
