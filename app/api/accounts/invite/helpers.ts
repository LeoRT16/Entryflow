import type { AccountRolePreset } from "@/features/accounts/types";

export function resolveWorkspaceRole(workspaceRoles: AccountRolePreset[], roleSlug: string) {
  return workspaceRoles.find((role) => role.slug === roleSlug) ?? null;
}
