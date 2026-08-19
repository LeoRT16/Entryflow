import { NextResponse } from "next/server";

import {
  createOrUpdateTemporaryPasswordAuthIdentity,
  findAuthIdentityByEmail,
  linkPublicUserToAuthIdentity,
  setPublicUserMustChangePassword,
} from "@/app/api/accounts/auth-onboarding";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
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

  if (!currentProfile) {
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

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const effectivePermissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  if (!effectivePermissions.includes("accounts.manage")) {
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

  if (organizationId !== currentOrganizationId) {
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

  if (roleSlug === "owner" && currentRole.slug !== "owner") {
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

  try {
    const existingUser = await repositories.users.getByEmail(email);
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

    const existingMembership = await repositories.profiles.getByOrganizationAndUser(currentOrganizationId, persistedUser.id);
    const membershipPayload = {
      id: existingMembership?.id ?? createUuid(),
      organizationId: currentOrganizationId,
      userId: persistedUser.id,
      roleId: targetRole.id,
      displayName,
      attributes: {
        area,
        status: "active" as const,
        permissions: desiredPermissions,
      },
      metadata: {
        ...(existingMembership?.metadata ?? {}),
        attributes: {
          ...(existingMembership?.attributes ?? {}),
          area,
          status: "active" as const,
        },
        permissions: desiredPermissions,
        permissionsSource,
      },
      status: "active" as const,
      createdAt: existingMembership?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    };

    const nextMembership = existingMembership
      ? await repositories.profiles.update(existingMembership.id, membershipPayload)
      : await repositories.profiles.create(membershipPayload);

    if (!nextMembership) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "membership_persist_failed",
            message: "No pudimos guardar la membresía del miembro.",
          },
        },
        { status: 500 },
      );
    }
    persistedMembership = nextMembership;
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
  const currentPersistedMembership = persistedMembership;

  if (!currentPersistedUser || !currentPersistedMembership) {
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
  });
}

export async function POST(request: Request) {
  return handleInvite(request);
}
