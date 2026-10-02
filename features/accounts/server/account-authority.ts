import type { WorkspaceBootstrap } from "@/services/workspace-loader";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";

export function resolveAccountManagementAuthority(workspace: WorkspaceBootstrap, targetOrganizationId: string) {
  if (workspace.isPlatformRoot) {
    return { isPlatformRoot: true, profile: null, organizationId: targetOrganizationId, canManageAccounts: true, canManagePermissions: true };
  }

  const profile = workspace.profiles.find(
    (candidate) => candidate.organizationId === targetOrganizationId && candidate.userId === workspace.currentUserId && !candidate.deletedAt,
  ) ?? null;
  if (!profile) return { isPlatformRoot: false, profile: null, organizationId: targetOrganizationId, canManageAccounts: false, canManagePermissions: false };

  const role = workspace.roles.find((candidate) => candidate.id === profile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({ permissions: profile.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile.metadata });
  const isOwner = role.slug === "owner";
  return { isPlatformRoot: false, profile, organizationId: targetOrganizationId, canManageAccounts: isOwner && permissions.includes("accounts.manage"), canManagePermissions: isOwner && permissions.includes("permissions.manage") };
}
