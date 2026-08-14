import { NextResponse } from "next/server";

import {
  createOrUpdateTemporaryPasswordAuthIdentity,
  findAuthIdentityByEmail,
  linkPublicUserToAuthIdentity,
  setPublicUserMustChangePassword,
} from "@/app/api/accounts/auth-onboarding";
import { getRolePresetBySlug, normalizeAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import type { OrganizationAccount } from "@/features/accounts/types";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ResendInviteBody = {
  memberId?: string;
  tempPassword?: string;
  confirmTempPassword?: string;
};

type SupabaseInviteClient = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

type ResendInviteDependencies = {
  getAuthUser: typeof getSupabaseAuthUser;
  loadWorkspace: (authUser: { id: string; email?: string | null }) => Promise<WorkspaceBootstrap>;
  getClient: () => SupabaseInviteClient | null;
  findAuthIdentityByEmail: typeof findAuthIdentityByEmail;
  linkPublicUserToAuthIdentity: typeof linkPublicUserToAuthIdentity;
  createOrUpdateTemporaryPasswordAuthIdentity: typeof createOrUpdateTemporaryPasswordAuthIdentity;
  setPublicUserMustChangePassword: typeof setPublicUserMustChangePassword;
};

const defaultDependencies: ResendInviteDependencies = {
  getAuthUser: getSupabaseAuthUser,
  loadWorkspace: loadWorkspaceBootstrap,
  getClient: getSupabaseServerClient,
  findAuthIdentityByEmail,
  linkPublicUserToAuthIdentity,
  createOrUpdateTemporaryPasswordAuthIdentity,
  setPublicUserMustChangePassword,
};

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildOrganizationAccount(workspace: WorkspaceBootstrap, memberId: string) {
  const membership = workspace.profiles.find((profile) => profile.id === memberId && !profile.deletedAt) ?? null;
  if (!membership) {
    return null;
  }

  const user = workspace.users.find((item) => item.id === membership.userId && !item.deletedAt) ?? null;
  if (!user) {
    return null;
  }

  const role = workspace.roles.find((item) => item.id === membership.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = normalizeAccountPermissions(membership.metadata?.permissions, role.permissions);

  const account: OrganizationAccount = {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: user.id,
    authUserId: user.authUserId ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
    userEmail: user.email,
    userDisplayName: user.displayName,
    displayName: membership.displayName,
    roleId: role.id,
    roleSlug: role.slug,
    roleName: role.name,
    rolePermissions: role.permissions,
    permissions: permissions.length ? permissions : role.permissions,
    attributes: {
      ...membership.attributes,
      permissions: permissions.length ? permissions : role.permissions,
    },
    status: membership.status,
    isOwner: role.slug === "owner",
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
    deletedAt: membership.deletedAt,
    metadata: membership.metadata,
  };

  return { membership, user, account };
}

export async function handleResendInvite(request: Request, dependencies: ResendInviteDependencies = defaultDependencies) {
  const authUser = await dependencies.getAuthUser();

  if (!authUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "Debés iniciar sesión para restablecer contraseñas temporales.",
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
  const effectivePermissions = normalizeAccountPermissions(currentProfile.metadata?.permissions, currentRole.permissions);

  if (!effectivePermissions.includes("accounts.manage")) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No tenés permiso para restablecer contraseñas temporales.",
        },
      },
      { status: 403 },
    );
  }

  let body: ResendInviteBody;

  try {
    body = (await request.json()) as ResendInviteBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "La solicitud de reenvío no es válida.",
        },
      },
      { status: 400 },
    );
  }

  const memberId = getRequestString(body.memberId);

  if (!memberId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_fields",
          message: "Falta el miembro a restablecer.",
        },
      },
      { status: 400 },
    );
  }

  const selected = buildOrganizationAccount(workspace, memberId);

  if (!selected || selected.membership.organizationId !== workspace.currentOrganizationId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "not_found",
          message: "No pudimos encontrar ese miembro en la organización activa.",
        },
      },
      { status: 404 },
    );
  }

  if (selected.membership.deletedAt || selected.membership.status !== "active") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "inactive_member",
          message: "Solo podés restablecer contraseñas temporales a miembros activos.",
        },
      },
      { status: 409 },
    );
  }

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

  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "supabase_unavailable",
          message: "No pudimos preparar el restablecimiento.",
        },
      },
      { status: 503 },
    );
  }

  const authIdentity = await dependencies.findAuthIdentityByEmail(client, selected.user.email);

  if (authIdentity && authIdentity.email && authIdentity.email.trim().toLowerCase() !== selected.user.email.trim().toLowerCase()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "email_mismatch",
          message: "La identidad de acceso no coincide con el miembro seleccionado.",
        },
      },
      { status: 409 },
    );
  }

  if (authIdentity) {
    const conflictingUser = workspace.users.find((row) => row.id !== selected.user.id && row.authUserId === authIdentity.id && !row.deletedAt) ?? null;

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
  }

  let resolvedAuthUserId = selected.user.authUserId ?? authIdentity?.id ?? null;

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
            message: error instanceof Error && error.message ? error.message : "No pudimos actualizar la identidad de acceso.",
          },
        },
        { status: 500 },
      );
    }
  } else {
    const authResult = await dependencies.createOrUpdateTemporaryPasswordAuthIdentity(client, {
      email: selected.user.email,
      password: tempPassword,
    });

    if (authResult.error || !authResult.data.user) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "auth_create_failed",
            message: authResult.error instanceof Error && authResult.error.message ? authResult.error.message : "No pudimos crear la identidad de acceso.",
          },
        },
        { status: 500 },
      );
    }

    resolvedAuthUserId = authResult.data.user.id;
  }

  if (resolvedAuthUserId && selected.user.authUserId !== resolvedAuthUserId) {
    const linkedUser = await dependencies.linkPublicUserToAuthIdentity(client, selected.user.id, resolvedAuthUserId);
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

    selected.user.authUserId = linkedUser.authUserId ?? resolvedAuthUserId;
  }

  const updatedUser = await dependencies.setPublicUserMustChangePassword(client, selected.user.id, true);
  if (updatedUser) {
    selected.user.mustChangePassword = updatedUser.mustChangePassword ?? true;
  }

  return NextResponse.json({
    ok: true,
    memberId: selected.membership.id,
    email: selected.user.email,
    authUserId: selected.user.authUserId ?? resolvedAuthUserId ?? null,
    mode: "reset",
  });
}
