import { getPermissionLabel, getRolePresetBySlug } from "@/features/accounts/domain/accounts-domain";
import type { AccountRoleSlug, OrganizationAccount } from "@/features/accounts/types";

export type OrganizationMemberRoleSummary = {
  slug: AccountRoleSlug;
  name: string;
  description: string;
  capabilityLabels: string[];
};

export type OrganizationMemberRow = {
  id: string;
  displayName: string;
  userEmail: string;
  roleSlug: AccountRoleSlug;
  roleName: string;
  roleDescription: string;
  area: string;
  status: "active" | "inactive";
  isOwner: boolean;
  protectedOwner: boolean;
  permissionCount: number;
  permissionSummary: string;
  capabilityLabels: string[];
  canDeactivate: boolean;
  deactivationHint?: string;
};

export type OrganizationMembersModel = {
  organizationId: string;
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  ownerMembers: number;
  canManageAccounts: boolean;
  canManagePermissions: boolean;
  readOnly: boolean;
  empty: boolean;
  members: OrganizationMemberRow[];
  roleSummaries: OrganizationMemberRoleSummary[];
};

function getRoleSummary(roleSlug: AccountRoleSlug): OrganizationMemberRoleSummary {
  const preset = getRolePresetBySlug(roleSlug);
  const capabilityLabels = preset.permissions.map((permission) => getPermissionLabel(permission));

  return {
    slug: roleSlug,
    name: preset.name,
    description: preset.description ?? "",
    capabilityLabels,
  };
}

function summarizeCapabilities(capabilityLabels: string[]) {
  if (!capabilityLabels.length) {
    return "Sin permisos asignados.";
  }

  const visible = capabilityLabels.slice(0, 3);
  const extraCount = capabilityLabels.length - visible.length;

  return extraCount > 0 ? `${visible.join(" · ")} +${extraCount}` : visible.join(" · ");
}

export function buildOrganizationMembersModel({
  accounts,
  organizationId,
  canManageAccounts,
  canManagePermissions,
}: {
  accounts: OrganizationAccount[];
  organizationId: string;
  canManageAccounts: boolean;
  canManagePermissions: boolean;
}): OrganizationMembersModel {
  const members = accounts
    .filter((account) => account.organizationId === organizationId && account.id !== "bootstrap-account")
    .sort((left, right) => {
      if (left.isOwner !== right.isOwner) {
        return left.isOwner ? -1 : 1;
      }

      if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
      }

      return left.displayName.localeCompare(right.displayName);
    });

  const ownerMembers = members.filter((account) => account.isOwner).length;
  const activeMembers = members.filter((account) => account.status === "active").length;
  const inactiveMembers = members.filter((account) => account.status === "inactive").length;
  const activeOwnerMembers = members.filter((account) => account.isOwner && account.status === "active").length;

  return {
    organizationId,
    totalMembers: members.length,
    activeMembers,
    inactiveMembers,
    ownerMembers,
    canManageAccounts,
    canManagePermissions,
    readOnly: !canManageAccounts,
    empty: members.length === 0,
    members: members.map((account) => {
      const roleSummary = getRoleSummary(account.roleSlug);
      const permissionSummary = summarizeCapabilities(roleSummary.capabilityLabels);
      const protectedOwner = account.isOwner && account.status === "active" && activeOwnerMembers <= 1;

      return {
        id: account.id,
        displayName: account.displayName,
        userEmail: account.userEmail,
        roleSlug: account.roleSlug,
        roleName: account.roleName,
        roleDescription: roleSummary.description,
        area: account.attributes.area ?? "",
        status: account.status,
        isOwner: account.isOwner,
        protectedOwner,
        permissionCount: account.permissions.length,
        permissionSummary,
        capabilityLabels: roleSummary.capabilityLabels,
        canDeactivate: account.status === "active" ? !protectedOwner : true,
        deactivationHint: protectedOwner ? "El último Owner activo no puede desactivarse." : undefined,
      };
    }),
    roleSummaries: (["owner", "administrator", "reception", "door"] as AccountRoleSlug[]).map((slug) => getRoleSummary(slug)),
  };
}

export function getRoleMvpIntent(roleSlug: AccountRoleSlug) {
  const summary = getRoleSummary(roleSlug);

  return {
    ...summary,
    intent:
      roleSlug === "owner"
        ? "Control total de la organización."
        : roleSlug === "administrator"
          ? "Acceso administrativo amplio sin gestión de permisos de nivel propietario."
          : roleSlug === "reception"
            ? "Operación de recepción, reservas e ingreso."
            : roleSlug === "door"
              ? "Operación centrada en admisión y check-in."
              : "Rol fijo de la organización.",
  };
}
