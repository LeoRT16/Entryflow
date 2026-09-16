import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
export async function requireDriveOrganizationManager(organizationId: string) {
  const user = await getSupabaseAuthUser(); if (!user) throw new Error("unauthenticated");
  const workspace = await loadWorkspaceBootstrap({ id: user.id, email: user.email });
  if (workspace.authState.status !== "ready" || !workspace.authState.organizationIds.includes(organizationId)) throw new Error("forbidden");
  const profile = workspace.profiles.find((p) => p.organizationId === organizationId && p.userId === workspace.currentUserId && !p.deletedAt);
  const role = profile ? workspace.roles.find((r) => r.id === profile.roleId) : null;
  if (!role?.permissions.includes("organization.manage")) throw new Error("forbidden");
  return { user, workspace };
}
