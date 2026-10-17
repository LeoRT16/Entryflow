import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import type { Event as PlatformEvent } from "@/features/domain/types";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";

type FinalReportPermission = "event.view" | "event.edit";

export type FinalReportAuthorization =
  | { event: PlatformEvent }
  | { code: "unauthorized" | "finalization_forbidden" };

/**
 * Resolves permission in the event's owning organization. The bootstrap's
 * current organization is UI context, not an authorization boundary.
 */
export function authorizeFinalReportEvent(
  workspace: WorkspaceBootstrap,
  eventId: string,
  permission: FinalReportPermission,
): FinalReportAuthorization {
  if (workspace.authState.status !== "ready") return { code: "unauthorized" };

  const event = workspace.events.find((candidate) => candidate.id === eventId);
  if (!event) return { code: "finalization_forbidden" };

  if (workspace.isPlatformRoot) return { event };

  const profile = workspace.profiles.find(
    (candidate) => candidate.userId === workspace.currentUserId && candidate.organizationId === event.organizationId && !candidate.deletedAt,
  );
  if (!profile) return { code: "finalization_forbidden" };

  const role = workspace.roles.find((candidate) => candidate.id === profile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({
    permissions: profile.metadata?.permissions,
    rolePermissions: role.permissions,
    roleSlug: role.slug,
    roleMetadata: role.metadata,
    accountMetadata: profile.metadata,
  });
  return permissions.includes(permission) ? { event } : { code: "finalization_forbidden" };
}
