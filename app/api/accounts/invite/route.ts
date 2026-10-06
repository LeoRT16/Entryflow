import { NextResponse } from "next/server";

import {
  createOrUpdateTemporaryPasswordAuthIdentity,
  findAuthIdentityByEmail,
  linkPublicUserToAuthIdentity,
  setPublicUserMustChangePassword,
} from "@/app/api/accounts/auth-onboarding";
import { createSupabaseAuthServerClient, getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { createUuid, nowIso } from "@/lib/supabase/helpers";
import {
  canonicalizeAccountPermissionsForPersistence,
  getRolePresetBySlug,
  hasSameAccountPermissionSet,
  resolveAccountPermissions,
} from "@/features/accounts/domain/accounts-domain";
import { resolveWorkspaceRole } from "@/app/api/accounts/invite/helpers";
import type { OrganizationMembership, AccountUser } from "@/features/accounts/types";
import { resolveAccountManagementAuthority } from "@/features/accounts/server/account-authority";
import { mapProfileRowToDomain } from "@/lib/supabase/mappers";

type InviteTeamMemberBody = {
  email?: string;
  displayName?: string;
  organizationId?: string;
  roleSlug?: string;
  area?: string;
  permissions?: string[];
  tempPassword?: string;
  confirmTempPassword?: string;
};

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type InviteRouteDependencies = {
  getAuthUser: typeof getSupabaseAuthUser;
  loadWorkspace: typeof loadWorkspaceBootstrap;
  getClient: typeof getSupabaseServerClient;
  createRepositories: typeof createSupabaseWorkspaceRepositories;
  findAuthIdentityByEmail: typeof findAuthIdentityByEmail;
  createOrUpdateTemporaryPasswordAuthIdentity: typeof createOrUpdateTemporaryPasswordAuthIdentity;
  linkPublicUserToAuthIdentity: typeof linkPublicUserToAuthIdentity;
  setPublicUserMustChangePassword: typeof setPublicUserMustChangePassword;
  createAuthClient: typeof createSupabaseAuthServerClient;
};

function createInviteRouteDependencies(): InviteRouteDependencies {
  return {
    getAuthUser: getSupabaseAuthUser,
    loadWorkspace: loadWorkspaceBootstrap,
    getClient: getSupabaseServerClient,
    createRepositories: createSupabaseWorkspaceRepositories,
    findAuthIdentityByEmail,
    createOrUpdateTemporaryPasswordAuthIdentity,
    linkPublicUserToAuthIdentity,
    setPublicUserMustChangePassword,
    createAuthClient: createSupabaseAuthServerClient,
  };
}

export async function handleInvite(request: Request, dependencies = createInviteRouteDependencies()) {
  const authUser = await dependencies.getAuthUser();

  if (!authUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "Debés iniciar sesión para crear miembros.",
        },
      },
      { status: 401 },
    );
  }

  const workspace = await dependencies.loadWorkspace({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: workspace.authState.status,
          message: getWorkspaceAuthStateMessage(workspace.authState),
        },
      },
      { status: 403 },
    );
  }

  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;
  const authority = resolveAccountManagementAuthority(workspace, getRequestString(workspace.currentOrganizationId));

  if (!currentProfile && !authority.isPlatformRoot) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No pudimos resolver tu cuenta activa.",
        },
      },
      { status: 403 },
    );
  }

  const currentRole = currentProfile ? workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator") : getRolePresetBySlug("owner");
  const effectivePermissions = resolveAccountPermissions({
    permissions: currentProfile?.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile?.metadata,
  });

  if (!authority.canManageAccounts) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No tenés permiso para crear miembros.",
        },
      },
      { status: 403 },
    );
  }

  let body: InviteTeamMemberBody;

  try {
    body = (await request.json()) as InviteTeamMemberBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "La solicitud de alta no es válida.",
        },
      },
      { status: 400 },
    );
  }

  const email = getRequestString(body.email).toLowerCase();
  const displayName = getRequestString(body.displayName);
  const organizationId = getRequestString(body.organizationId);
  const roleSlug = getRequestString(body.roleSlug);
  const area = getRequestString(body.area);
  const currentOrganizationId = getRequestString(workspace.currentOrganizationId);

  if (!email || !displayName || !organizationId || !roleSlug || !currentOrganizationId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_fields",
          message: "Faltan datos para crear al miembro.",
        },
      },
      { status: 400 },
    );
  }

  const targetAuthority = resolveAccountManagementAuthority(workspace, organizationId);
  if (!targetAuthority.canManageAccounts) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No podés crear miembros en una organización distinta a la activa.",
        },
      },
      { status: 403 },
    );
  }

  if (roleSlug === "owner" && !targetAuthority.isPlatformRoot && currentRole.slug !== "owner") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "Solo un Owner puede asignar el rol Owner.",
        },
      },
      { status: 403 },
    );
  }

  const targetRole = resolveWorkspaceRole(workspace.roles, roleSlug);

  if (!targetRole) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_role",
          message: "El rol seleccionado no está disponible en la organización activa.",
        },
      },
      { status: 400 },
    );
  }

  const desiredPermissions = effectivePermissions.includes("permissions.manage")
    ? canonicalizeAccountPermissionsForPersistence({
        permissions: body.permissions,
        rolePermissions: targetRole.permissions,
      })
    : targetRole.permissions;
  const permissionsSource = hasSameAccountPermissionSet(desiredPermissions, targetRole.permissions) ? "preset" : "custom";

  const tempPassword = getRequestString(body.tempPassword);
  const confirmTempPassword = getRequestString(body.confirmTempPassword);

  if (!tempPassword || tempPassword.length < 8 || !confirmTempPassword) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_password",
          message: "Ingresá una contraseña temporal de al menos 8 caracteres y confirmala.",
        },
      },
      { status: 400 },
    );
  }

  if (confirmTempPassword !== tempPassword) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "password_mismatch",
          message: "Las contraseñas temporales no coinciden.",
        },
      },
      { status: 400 },
    );
  }

  const client = dependencies.getClient();
  const repositories = dependencies.createRepositories(client);

  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "supabase_unavailable",
          message: "No pudimos preparar el alta.",
        },
      },
      { status: 503 },
    );
  }

  let persistedUser: AccountUser | null = null;
  let persistedMembership: OrganizationMembership | null = null;
  let membershipResult: "added" | "restored" | "reactivated" | "existing" | null = null;
  let publicUserCreatedByRequest = false;
  let authIdentityCreatedByRequest = false;
  let authIdentityPreexisting = false;

  try {
    const existingUser = await repositories.users.getByEmail(email);
    publicUserCreatedByRequest = !existingUser;
    const nextUser = existingUser
      ? await repositories.users.update(existingUser.id, {
          ...existingUser,
          email,
          displayName,
        })
      : await repositories.users.create({
          id: createUuid(),
          email,
          displayName,
          avatarUrl: undefined,
          metadata: { source: "team-temporary-password" },
          deletedAt: null,
        });

    if (!nextUser) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "user_persist_failed",
            message: "No pudimos guardar el usuario del miembro.",
          },
        },
        { status: 500 },
      );
    }
    persistedUser = nextUser;

  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("invalid input syntax for type uuid")
        ? "El rol seleccionado no está disponible en la base de datos."
        : error instanceof Error && error.message
          ? error.message
          : "No pudimos guardar la membresía del miembro.";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "membership_persist_failed",
          message,
        },
      },
      { status: 500 },
    );
  }

  const currentPersistedUser = persistedUser;

  if (!currentPersistedUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "membership_persist_failed",
          message: "No pudimos resolver el miembro.",
        },
      },
      { status: 500 },
    );
  }

  const existingAuthIdentity = await dependencies.findAuthIdentityByEmail(client, email);
  authIdentityPreexisting = Boolean(existingAuthIdentity || currentPersistedUser.authUserId);

  if (existingAuthIdentity && currentPersistedUser.authUserId && currentPersistedUser.authUserId !== existingAuthIdentity.id) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "auth_identity_in_use",
          message: "La identidad de acceso ya está vinculada a otro miembro.",
        },
      },
      { status: 409 },
    );
  }

  const conflictingUser = existingAuthIdentity
    ? workspace.users.find((user) => user.id !== currentPersistedUser.id && user.authUserId === existingAuthIdentity.id && !user.deletedAt) ?? null
    : null;
  if (conflictingUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "auth_identity_in_use",
          message: "Esa identidad de acceso ya está vinculada a otro miembro.",
        },
      },
      { status: 409 },
    );
  }

  let resolvedAuthUserId = currentPersistedUser.authUserId ?? existingAuthIdentity?.id ?? null;

  if (resolvedAuthUserId) {
    const { error } = await client.auth.admin.updateUserById(resolvedAuthUserId, {
      password: tempPassword,
      email_confirm: true,
    });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "auth_update_failed",
            message: "No pudimos actualizar la identidad de acceso del miembro.",
          },
        },
        { status: 500 },
      );
    }
  } else {
    const authResult = await dependencies.createOrUpdateTemporaryPasswordAuthIdentity(client, { email, password: tempPassword });

    if (authResult.error || !authResult.data.user) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "auth_create_failed",
            message: "No pudimos crear la identidad de acceso del miembro.",
          },
        },
        { status: 500 },
      );
    }

    resolvedAuthUserId = authResult.data.user.id;
    authIdentityCreatedByRequest = authResult.data.mode === "created";
  }

  if (resolvedAuthUserId && currentPersistedUser.authUserId !== resolvedAuthUserId) {
    const linkedUser = await dependencies.linkPublicUserToAuthIdentity(client, currentPersistedUser.id, resolvedAuthUserId);
    if (!linkedUser) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "auth_link_failed",
            message: "No pudimos vincular la identidad de acceso al miembro.",
          },
        },
        { status: 500 },
      );
    }

    currentPersistedUser.authUserId = linkedUser.authUserId ?? resolvedAuthUserId;
  }

  const updatedUser = await dependencies.setPublicUserMustChangePassword(client, currentPersistedUser.id, true);

  if (updatedUser) {
    currentPersistedUser.mustChangePassword = updatedUser.mustChangePassword ?? true;
  }

  const authenticatedClient = await dependencies.createAuthClient();
  if (!authenticatedClient) {
    return NextResponse.json({ ok: false, error: { code: "supabase_unavailable", message: "No pudimos preparar el alta." } }, { status: 503 });
  }
  const rpcClient = authenticatedClient as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: unknown }> };
  const { data: membershipRow, error: membershipError } = await rpcClient.rpc("upsert_organization_membership_atomic", {
    p_user_id: currentPersistedUser.id,
    p_organization_id: organizationId,
    p_role_id: targetRole.id,
    p_display_name: displayName,
    p_area: area || null,
    p_status: "active",
    p_permissions: desiredPermissions,
    p_permissions_source: permissionsSource,
  });
  if (membershipError || !membershipRow) {
    const rpcError = membershipError && typeof membershipError === "object" ? membershipError as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    } : null;
    console.error("[accounts/invite:membership-rpc-error]", {
      rpcName: "upsert_organization_membership_atomic",
      code: typeof rpcError?.code === "string" ? rpcError.code : undefined,
      message: typeof rpcError?.message === "string" ? rpcError.message : undefined,
      details: typeof rpcError?.details === "string" ? rpcError.details : undefined,
      hint: typeof rpcError?.hint === "string" ? rpcError.hint : undefined,
      organizationId,
      roleSlug,
      roleId: targetRole.id,
      authIdentityPreexisting,
      authIdentityCreatedByRequest,
      publicUserCreatedByRequest,
      membershipAlreadyExisted: workspace.profiles.some((profile) => profile.organizationId === organizationId && profile.userId === currentPersistedUser.id),
    });
    return NextResponse.json({ ok: false, error: { code: "membership_persist_failed", message: "No pudimos guardar la membresía del miembro." } }, { status: 500 });
  }
  persistedMembership = mapProfileRowToDomain(membershipRow as Parameters<typeof mapProfileRowToDomain>[0]);
  const resultMetadata = membershipRow.metadata as { membershipResult?: string } | null;
  const rpcKind = resultMetadata?.membershipResult;
  membershipResult = rpcKind === "member.added" ? "added" : rpcKind === "member.restored" ? "restored" : rpcKind === "member.reactivated" ? "reactivated" : "existing";
  const currentPersistedMembership = persistedMembership;

  const account = {
    id: currentPersistedMembership.id,
    organizationId: currentPersistedMembership.organizationId,
    userId: currentPersistedUser.id,
    authUserId: currentPersistedUser.authUserId ?? resolvedAuthUserId ?? null,
    authIdentityExists: Boolean(resolvedAuthUserId || currentPersistedUser.authUserId),
    userEmail: currentPersistedUser.email,
    userDisplayName: currentPersistedUser.displayName,
    displayName: currentPersistedMembership.displayName,
    roleId: targetRole.id,
    roleSlug: targetRole.slug,
    roleName: targetRole.name,
    rolePermissions: targetRole.permissions,
    permissions: desiredPermissions,
    attributes: persistedMembership.attributes,
    status: "active" as const,
    isOwner: targetRole.slug === "owner",
    createdAt: currentPersistedMembership.createdAt,
    updatedAt: currentPersistedMembership.updatedAt,
    deletedAt: currentPersistedMembership.deletedAt,
    metadata: currentPersistedMembership.metadata,
  };

  return NextResponse.json({
    ok: true,
    user: persistedUser,
    profile: persistedMembership,
    account,
    membershipResult,
  });
}

export async function POST(request: Request) {
  return handleInvite(request);
}
