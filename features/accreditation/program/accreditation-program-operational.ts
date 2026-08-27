import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { isAccreditationPhase2EventType } from "@/features/accreditation/events";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

export type AccreditationProgramScopeDependencies = {
  getAuthUser?: typeof getSupabaseAuthUser;
  loadWorkspace?: typeof loadWorkspaceBootstrap;
};

export type AccreditationProgramScopeResult =
  | {
      ok: true;
      workspace: Awaited<ReturnType<typeof loadWorkspaceBootstrap>>;
      event: Awaited<ReturnType<typeof loadWorkspaceBootstrap>>["events"][number];
      currentProfile: NonNullable<Awaited<ReturnType<typeof loadWorkspaceBootstrap>>["profiles"][number]>;
      permissions: string[];
      canManageProgram: boolean;
    }
  | {
      ok: false;
      status: number;
      error: { code: string; message: string };
    };

export async function resolveAccreditationProgramScope(params: {
  eventId: string;
  dependencies?: AccreditationProgramScopeDependencies;
}): Promise<AccreditationProgramScopeResult> {
  const getAuthUser = params.dependencies?.getAuthUser ?? getSupabaseAuthUser;
  const loadWorkspace = params.dependencies?.loadWorkspace ?? loadWorkspaceBootstrap;
  const authUser = await getAuthUser();

  if (!authUser) {
    return { ok: false, status: 401, error: { code: "unauthenticated", message: "Debés iniciar sesión." } };
  }

  const workspace = await loadWorkspace({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return {
      ok: false,
      status: 403,
      error: { code: workspace.authState.status, message: getWorkspaceAuthStateMessage(workspace.authState) },
    };
  }

  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;

  if (!currentProfile) {
    return { ok: false, status: 403, error: { code: "forbidden", message: "No pudimos resolver tu perfil activo." } };
  }

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  if (!permissions.includes("event.edit") && !permissions.includes("settings.manage")) {
    return {
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "No tenés permiso para gestionar el programa." },
    };
  }

  const event = workspace.events.find((item) => item.id === params.eventId && item.organizationId === workspace.currentOrganizationId) ?? null;

  if (!event) {
    return {
      ok: false,
      status: 404,
      error: { code: "event_not_found", message: "No pudimos resolver el evento operativo." },
    };
  }

  if (!isAccreditationPhase2EventType(event.eventType)) {
    return {
      ok: false,
      status: 400,
      error: { code: "unsupported_event_type", message: "Este evento no forma parte de la Fase 2." },
    };
  }

  return {
    ok: true,
    workspace,
    event,
    currentProfile,
    permissions,
    canManageProgram: permissions.includes("event.edit") || permissions.includes("settings.manage"),
  };
}
