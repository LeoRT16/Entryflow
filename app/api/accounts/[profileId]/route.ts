import { NextResponse } from "next/server";

import { canonicalizeAccountPermissionsForPersistence, getCriticalSelfMutationBlockReason, getRolePresetBySlug, hasSameAccountPermissionSet, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { resolveWorkspaceRole } from "@/app/api/accounts/invite/helpers";
import type { AccountPermissionKey, AccountRolePreset, AccountUser, OrganizationAccount, OrganizationMembership } from "@/features/accounts/types";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { nowIso } from "@/lib/supabase/helpers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";

type AccountMutationBody = {
  email?: string;
  userEmail?: string;
  displayName?: string;
  userDisplayName?: string;
  area?: string;
  status?: "active" | "inactive";
  roleSlug?: string;
  permissions?: string[];
};

type AccountMutationResponse = {
  ok: true;
  user: AccountUser;
  profile: OrganizationMembership;
  account: OrganizationAccount;
};

type AccountMutationDependencies = {
  getAuthUser: typeof getSupabaseAuthUser;
  loadWorkspace: typeof loadWorkspaceBootstrap;
  getClient: typeof getSupabaseServerClient;
  createRepositories: typeof createSupabaseWorkspaceRepositories;
};

function createDependencies(): AccountMutationDependencies {
  return {
    getAuthUser: getSupabaseAuthUser,
    loadWorkspace: loadWorkspaceBootstrap,
    getClient: getSupabaseServerClient,
    createRepositories: createSupabaseWorkspaceRepositories,
  };
}

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildOrganizationAccount(
  user: AccountUser,
  profile: OrganizationMembership,
  role: AccountRolePreset,
): OrganizationAccount {
  const permissions = resolveAccountPermissions({
    permissions: profile.metadata?.permissions,
    rolePermissions: role.permissions,
    roleMetadata: role.metadata,
    accountMetadata: profile.metadata,
  });

  return {
    id: profile.id,
    organizationId: profile.organizationId,
    userId: user.id,
    authUserId: user.authUserId ?? null,
    authIdentityExists: user.authIdentityExists ?? Boolean(user.authUserId),
    mustChangePassword: user.mustChangePassword ?? false,
    userEmail: user.email,
    userDisplayName: user.displayName,
    displayName: profile.displayName,
    roleId: role.id,
    roleSlug: role.slug,
    roleName: role.name,
    rolePermissions: role.permissions,
    permissions: permissions.length ? permissions : role.permissions,
    attributes: {
      ...profile.attributes,
      permissions: permissions.length ? permissions : role.permissions,
    },
    status: profile.status,
    isOwner: role.slug === "owner",
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    deletedAt: profile.deletedAt,
    metadata: profile.metadata,
  };
}

function buildCurrentAccount(currentProfile: OrganizationMembership, currentUser: AccountUser, currentRole: AccountRolePreset) {
  return buildOrganizationAccount(currentUser, currentProfile, currentRole);
}

function safeMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizeMutationBody(body: AccountMutationBody) {
  return {
    email: getRequestString(body.email || body.userEmail),
    displayName: getRequestString(body.displayName || body.userDisplayName),
    userDisplayName: getRequestString(body.userDisplayName || body.displayName),
    area: getRequestString(body.area),
    status: body.status === "inactive" ? "inactive" : body.status === "active" ? "active" : undefined,
    roleSlug: getRequestString(body.roleSlug),
    permissions: Array.isArray(body.permissions) ? body.permissions.filter((permission): permission is AccountPermissionKey => typeof permission === "string") : undefined,
  };
}

async function loadActorContext(workspace: WorkspaceBootstrap) {
  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && profile.organizationId === workspace.currentOrganizationId && !profile.deletedAt) ?? null;
  if (!currentProfile) {
    return null;
  }

  const currentUser = workspace.users.find((user) => user.id === currentProfile.userId && !user.deletedAt) ?? null;
  if (!currentUser) {
    return null;
  }

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const currentPermissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  return {
    currentProfile,
    currentUser,
    currentRole,
    currentAccount: buildCurrentAccount(currentProfile, currentUser, currentRole),
    currentPermissions,
  };
}

function buildAccountResponse(user: AccountUser, profile: OrganizationMembership, role: AccountRolePreset): AccountMutationResponse {
  return {
    ok: true,
    user,
    profile,
    account: buildOrganizationAccount(user, profile, role),
  };
}

async function mutateAccount(request: Request, context: { params: Promise<{ profileId: string }> }, dependencies = createDependencies()) {
  const authUser = await dependencies.getAuthUser();
  if (!authUser) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthenticated", message: "Debés iniciar sesión para editar miembros." } },
      { status: 401 },
    );
  }

  const workspace = await dependencies.loadWorkspace({ id: authUser.id, email: authUser.email });
  if (workspace.authState.status !== "ready") {
    return NextResponse.json(
      { ok: false, error: { code: workspace.authState.status, message: getWorkspaceAuthStateMessage(workspace.authState) } },
      { status: 403 },
    );
  }

  const actorContext = await loadActorContext(workspace);
  if (!actorContext) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "No pudimos resolver tu cuenta activa." } },
      { status: 403 },
    );
  }

  if (!actorContext.currentPermissions.includes("accounts.manage")) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "No tenés permiso para editar miembros." } },
      { status: 403 },
    );
  }

  const { profileId } = await context.params;
  const targetProfile = workspace.profiles.find((profile) => profile.id === profileId && !profile.deletedAt) ?? null;

  if (!targetProfile || targetProfile.organizationId !== workspace.currentOrganizationId) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "No pudimos encontrar ese miembro en la organización activa." } },
      { status: 404 },
    );
  }

  const targetUser = workspace.users.find((user) => user.id === targetProfile.userId && !user.deletedAt) ?? null;
  if (!targetUser) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "No pudimos resolver el usuario del miembro." } },
      { status: 404 },
    );
  }

  const existingRole = workspace.roles.find((role) => role.id === targetProfile.roleId) ?? getRolePresetBySlug("administrator");
  let body: AccountMutationBody;

  try {
    body = (await request.json()) as AccountMutationBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_request", message: "La solicitud de cuenta no es válida." } },
      { status: 400 },
    );
  }

  const normalized = normalizeMutationBody(body);
  const requestedRoleSlug = normalized.roleSlug || existingRole.slug;
  const targetRole = resolveWorkspaceRole(workspace.roles, requestedRoleSlug) ?? existingRole;
  if (normalized.roleSlug && !resolveWorkspaceRole(workspace.roles, normalized.roleSlug)) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_role", message: "El rol seleccionado no está disponible en la organización activa." } },
      { status: 400 },
    );
  }

  if (targetRole.slug === "owner" && actorContext.currentRole.slug !== "owner") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Solo un Owner puede asignar el rol Owner." } },
      { status: 403 },
    );
  }

  const existingPermissions = resolveAccountPermissions({
    permissions: targetProfile.metadata?.permissions,
    rolePermissions: existingRole.permissions,
    roleMetadata: existingRole.metadata,
    accountMetadata: targetProfile.metadata,
  });

  const requestedPermissions =
    normalized.permissions !== undefined
      ? canonicalizeAccountPermissionsForPersistence({
          permissions: normalized.permissions,
          rolePermissions: targetRole.permissions,
        })
      : undefined;

  if (requestedPermissions && !actorContext.currentPermissions.includes("permissions.manage")) {
    const sameAsExisting = hasSameAccountPermissionSet(requestedPermissions, existingPermissions);
    const sameAsTargetRole = hasSameAccountPermissionSet(requestedPermissions, targetRole.permissions);

    if (!sameAsExisting && !sameAsTargetRole) {
      return NextResponse.json(
        { ok: false, error: { code: "forbidden", message: "No tenés permiso para modificar los permisos de este miembro." } },
        { status: 403 },
      );
    }
  }

  const desiredPermissions =
    requestedPermissions ??
    (requestedRoleSlug !== existingRole.slug ? targetRole.permissions : existingPermissions);

  const requestedStatus: "active" | "inactive" =
    normalized.status === "inactive" || normalized.status === "active"
      ? normalized.status
      : targetProfile.status === "inactive"
        ? "inactive"
        : "active";
  const nextDisplayName = normalized.displayName || normalized.userDisplayName || targetProfile.displayName;
  const nextUserDisplayName = normalized.userDisplayName || normalized.displayName || targetUser.displayName;
  const nextEmail = normalized.email || targetUser.email;
  const area = normalized.area || (targetProfile.attributes.area ?? "");

  const selfProtectionError = getCriticalSelfMutationBlockReason({
    currentAccount: actorContext.currentAccount,
    targetAccountId: targetProfile.id,
    targetUserId: targetUser.id,
    nextStatus: requestedStatus,
    nextRoleSlug: targetRole.slug,
    nextPermissions: desiredPermissions,
  });

  if (selfProtectionError) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: selfProtectionError } },
      { status: 403 },
    );
  }

  const activeOwnerCount = workspace.profiles.filter((profile) => {
    const profileRole = workspace.roles.find((role) => role.id === profile.roleId);
    return profile.organizationId === workspace.currentOrganizationId && profile.deletedAt === null && profile.status === "active" && profileRole?.slug === "owner";
  }).length;

  const targetRoleIsOwner = targetRole.slug === "owner";

  if (targetRoleIsOwner && requestedStatus === "inactive" && activeOwnerCount <= 1) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "No puedes desactivar el único Owner activo." } },
      { status: 403 },
    );
  }

  if (targetRole.slug !== existingRole.slug && existingRole.slug === "owner" && requestedRoleSlug !== "owner" && activeOwnerCount <= 1) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "No puedes retirar el único Owner activo de la organización." } },
      { status: 403 },
    );
  }

  const client = dependencies.getClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: { code: "supabase_unavailable", message: "No pudimos preparar la cuenta." } },
      { status: 503 },
    );
  }

  const repositories = dependencies.createRepositories(client);

  try {
    const persistedUser = await repositories.users.update(targetUser.id, {
      ...targetUser,
      email: nextEmail,
      displayName: nextUserDisplayName,
    });

    if (!persistedUser) {
      return NextResponse.json(
        { ok: false, error: { code: "user_update_failed", message: "No pudimos guardar el usuario del miembro." } },
        { status: 500 },
      );
    }

    const permissionsSource = hasSameAccountPermissionSet(desiredPermissions, targetRole.permissions) ? "preset" : "custom";
    const persistedProfile = await repositories.profiles.update(targetProfile.id, {
      ...targetProfile,
      roleId: targetRole.id,
      displayName: nextDisplayName,
      attributes: {
        ...targetProfile.attributes,
        area,
        status: requestedStatus,
        permissions: desiredPermissions,
      },
      metadata: {
        ...(targetProfile.metadata ?? {}),
        attributes: {
          ...(targetProfile.attributes ?? {}),
          area,
          status: requestedStatus,
        },
        permissions: desiredPermissions,
        permissionsSource,
      },
      deletedAt: targetProfile.deletedAt ?? null,
    });

    if (!persistedProfile) {
      return NextResponse.json(
        { ok: false, error: { code: "profile_update_failed", message: "No pudimos guardar la membresía del miembro." } },
        { status: 500 },
      );
    }

    return NextResponse.json(buildAccountResponse(persistedUser, persistedProfile, targetRole));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "mutation_failed", message: safeMessage(error, "No pudimos guardar al miembro.") } },
      { status: 500 },
    );
  }
}

async function deleteAccount(request: Request, context: { params: Promise<{ profileId: string }> }, dependencies = createDependencies()) {
  const authUser = await dependencies.getAuthUser();
  if (!authUser) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthenticated", message: "Debés iniciar sesión para eliminar miembros." } },
      { status: 401 },
    );
  }

  const workspace = await dependencies.loadWorkspace({ id: authUser.id, email: authUser.email });
  if (workspace.authState.status !== "ready") {
    return NextResponse.json(
      { ok: false, error: { code: workspace.authState.status, message: getWorkspaceAuthStateMessage(workspace.authState) } },
      { status: 403 },
    );
  }

  const actorContext = await loadActorContext(workspace);
  if (!actorContext) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "No pudimos resolver tu cuenta activa." } },
      { status: 403 },
    );
  }

  if (!actorContext.currentPermissions.includes("accounts.manage")) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "No tenés permiso para eliminar miembros." } },
      { status: 403 },
    );
  }

  const { profileId } = await context.params;
  const targetProfile = workspace.profiles.find((profile) => profile.id === profileId && !profile.deletedAt) ?? null;
  if (!targetProfile || targetProfile.organizationId !== workspace.currentOrganizationId) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "No pudimos encontrar ese miembro en la organización activa." } },
      { status: 404 },
    );
  }

  const targetUser = workspace.users.find((user) => user.id === targetProfile.userId && !user.deletedAt) ?? null;
  if (!targetUser) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "No pudimos resolver el usuario del miembro." } },
      { status: 404 },
    );
  }

  const targetRole = workspace.roles.find((role) => role.id === targetProfile.roleId) ?? getRolePresetBySlug("administrator");
  const selfProtectionError = getCriticalSelfMutationBlockReason({
    currentAccount: actorContext.currentAccount,
    targetAccountId: targetProfile.id,
    targetUserId: targetUser.id,
    nextStatus: "inactive",
    nextRoleSlug: targetRole.slug,
    nextPermissions: actorContext.currentPermissions,
    action: "delete",
  });

  if (selfProtectionError) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: selfProtectionError } },
      { status: 403 },
    );
  }

  const activeOwnerCount = workspace.profiles.filter((profile) => {
    const profileRole = workspace.roles.find((role) => role.id === profile.roleId);
    return profile.organizationId === workspace.currentOrganizationId && profile.deletedAt === null && profile.status === "active" && profileRole?.slug === "owner";
  }).length;

  if (targetRole.slug === "owner" && activeOwnerCount <= 1) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "No puedes eliminar el único Owner activo." } },
      { status: 403 },
    );
  }

  const client = dependencies.getClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: { code: "supabase_unavailable", message: "No pudimos preparar la eliminación." } },
      { status: 503 },
    );
  }

  const repositories = dependencies.createRepositories(client);
  const removedAt = nowIso();

  try {
    const persistedProfile = await repositories.profiles.update(targetProfile.id, {
      ...targetProfile,
      deletedAt: removedAt,
      attributes: {
        ...targetProfile.attributes,
        status: "inactive",
      },
      metadata: {
        ...(targetProfile.metadata ?? {}),
        attributes: {
          ...(targetProfile.attributes ?? {}),
          status: "inactive",
        },
        removed: true,
        removedAt,
      },
    });

    if (!persistedProfile) {
      return NextResponse.json(
        { ok: false, error: { code: "profile_delete_failed", message: "No pudimos eliminar la membresía del miembro." } },
        { status: 500 },
      );
    }

    return NextResponse.json(buildAccountResponse(targetUser, persistedProfile, targetRole));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "mutation_failed", message: safeMessage(error, "No pudimos eliminar al miembro.") } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ profileId: string }> }) {
  return mutateAccount(request, context);
}

export async function DELETE(request: Request, context: { params: Promise<{ profileId: string }> }) {
  return deleteAccount(request, context);
}

export { mutateAccount as handleAccountMutation, deleteAccount as handleAccountDeletion };
