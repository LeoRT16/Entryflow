import { getRolePresetBySlug } from "@/features/accounts/domain/accounts-domain";
import type { AccountRolePreset, OrganizationMembership } from "@/features/accounts/types";
import type { Organization } from "@/features/domain/types";

export function validateOrganizationName(value: string) {
  const name = value.trim();
  if (!name) return "El nombre de la organización es obligatorio.";
  if (name.length > 100) return "El nombre de la organización no puede superar los 100 caracteres.";
  return null;
}

export type OrganizationSwitcherOption = {
  id: string;
  name: string;
  roleName: string;
  status: Organization["status"];
  isCurrent: boolean;
};

type BuildOrganizationSwitcherOptionsParams = {
  organizations: Organization[];
  profiles: OrganizationMembership[];
  roles: AccountRolePreset[];
  currentUserId: string;
  currentOrganizationId: string;
};

export function buildOrganizationSwitcherOptions({
  organizations,
  profiles,
  roles,
  currentUserId,
  currentOrganizationId,
}: BuildOrganizationSwitcherOptionsParams): OrganizationSwitcherOption[] {
  const accessibleProfiles = currentUserId
    ? profiles.filter((profile) => profile.userId === currentUserId && !profile.deletedAt)
    : profiles.filter((profile) => !profile.deletedAt);

  return organizations
    .filter((organization) => accessibleProfiles.some((profile) => profile.organizationId === organization.id))
    .map((organization) => {
      const membership = accessibleProfiles.find((profile) => profile.organizationId === organization.id);
      const role = roles.find((item) => item.id === membership?.roleId) ?? getRolePresetBySlug("administrator");

      return {
        id: organization.id,
        name: organization.name,
        roleName: role.name,
        status: organization.status,
        isCurrent: organization.id === currentOrganizationId,
      };
    })
    .sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || left.name.localeCompare(right.name));
}
