"use server";

import { redirect } from "next/navigation";

import {
  linkPublicUserToAuthIdentity,
  setPublicUserMustChangePassword,
} from "@/app/api/accounts/auth-onboarding";
import { sanitizeRedirectTarget } from "@/app/login/redirect-target";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AccountUser, OrganizationMembership } from "@/features/accounts/types";
import type { Organization } from "@/features/domain/types";

export type SetupPasswordActionState = {
  message?: string;
  fieldErrors?: {
    password?: string;
    confirmPassword?: string;
  };
};

type SetupPasswordWorkspaceRepositories = Pick<
  ReturnType<typeof createSupabaseWorkspaceRepositories>,
  "users" | "profiles" | "organizations"
>;

type SetupPasswordDependencies = {
  createAuthClient: typeof createSupabaseAuthServerClient;
  getPublicClient: typeof getSupabaseServerClient;
  createRepositories: (client: NonNullable<ReturnType<typeof getSupabaseServerClient>>) => SetupPasswordWorkspaceRepositories;
  linkPublicUserToAuthIdentity: typeof linkPublicUserToAuthIdentity;
  setPublicUserMustChangePassword: typeof setPublicUserMustChangePassword;
  redirect: typeof redirect;
};

function createSetupPasswordDependencies(): SetupPasswordDependencies {
  return {
    createAuthClient: createSupabaseAuthServerClient,
    getPublicClient: getSupabaseServerClient,
    createRepositories: createSupabaseWorkspaceRepositories,
    linkPublicUserToAuthIdentity,
    setPublicUserMustChangePassword,
    redirect,
  };
}

type SetupPasswordResolution = {
  publicUser: AccountUser;
  activeMemberships: OrganizationMembership[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function resolveSetupPasswordResolution(
  repositories: SetupPasswordWorkspaceRepositories,
  authUser: { id: string; email: string },
): Promise<SetupPasswordResolution | null> {
  const normalizedEmail = normalizeEmail(authUser.email);
  const users = await repositories.users.list();
  const activeUsers = users.filter((row) => !row.deletedAt);
  const authMatches = activeUsers.filter((row) => row.authUserId === authUser.id);

  if (authMatches.length > 1) {
    return null;
  }

  const deletedConflicts = users.filter(
    (row) => Boolean(row.deletedAt) && (row.authUserId === authUser.id || normalizeEmail(row.email) === normalizedEmail),
  );

  if (deletedConflicts.length) {
    return null;
  }

  const emailMatches = activeUsers.filter((row) => normalizeEmail(row.email) === normalizedEmail);
  const publicUser = authMatches[0] ?? (emailMatches.length === 1 ? emailMatches[0] : null);

  if (!publicUser) {
    return null;
  }

  if (publicUser.authUserId && publicUser.authUserId !== authUser.id) {
    return null;
  }

  if (!publicUser.authUserId && emailMatches.length !== 1) {
    return null;
  }

  const organizations = await repositories.organizations.list();
  const activeOrganizationIds = new Set(organizations.filter((organization: Organization) => organization.status === "active").map((organization) => organization.id));
  const memberships = await repositories.profiles.getByUser(publicUser.id);
  const activeMemberships = memberships.filter((membership) => !membership.deletedAt && activeOrganizationIds.has(membership.organizationId));

  if (!activeMemberships.length) {
    return null;
  }

  return {
    publicUser,
    activeMemberships,
  };
}

export async function setupPasswordAction(
  _state: SetupPasswordActionState,
  formData: FormData,
  dependencies = createSetupPasswordDependencies(),
): Promise<SetupPasswordActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = sanitizeRedirectTarget(String(formData.get("next") ?? ""));

  const fieldErrors: SetupPasswordActionState["fieldErrors"] = {};

  if (!password) {
    fieldErrors.password = "Ingresá una contraseña.";
  } else if (password.length < 8) {
    fieldErrors.password = "Usá al menos 8 caracteres.";
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Confirmá la contraseña.";
  } else if (password && confirmPassword !== password) {
    fieldErrors.confirmPassword = "Las contraseñas no coinciden.";
  }

  if (fieldErrors.password || fieldErrors.confirmPassword) {
    return {
      message: "Revisá la contraseña antes de continuar.",
      fieldErrors,
    };
  }

  const authClient = await dependencies.createAuthClient();

  if (!authClient) {
    return {
      message: "No pudimos preparar tu sesión de acceso.",
    };
  }

  const { data: userData, error: userError } = await authClient.auth.getUser();

  if (userError || !userData.user) {
    return {
      message: "Volvé a iniciar sesión con tu contraseña temporal para terminar de activar tu acceso.",
    };
  }

  const user = userData.user;
  const email = user.email?.trim().toLowerCase() ?? "";

  if (!email) {
    return {
      message: "No pudimos resolver tu correo de acceso.",
    };
  }

  const publicClient = dependencies.getPublicClient();

  if (!publicClient) {
    return {
      message: "No pudimos vincular tu acceso al equipo.",
    };
  }

  const repositories = dependencies.createRepositories(publicClient);
  const resolution = await resolveSetupPasswordResolution(repositories, { id: user.id, email });

  if (!resolution) {
    return {
      message: "No encontramos tu miembro de EntryFlow para completar el acceso.",
    };
  }

  const { publicUser, activeMemberships } = resolution;

  if (publicUser.authUserId && publicUser.authUserId !== user.id) {
    return {
      message: "Esta cuenta ya está vinculada a otro acceso.",
    };
  }

  const { error: updateError } = await authClient.auth.updateUser({ password });

  if (updateError) {
    return {
      message: "No pudimos guardar tu contraseña. Intentá nuevamente.",
    };
  }

  if (!publicUser.authUserId) {
    const linkedUser = await dependencies.linkPublicUserToAuthIdentity(publicClient, publicUser.id, user.id);

    if (!linkedUser) {
      return {
        message: "No pudimos vincular tu acceso al miembro de EntryFlow.",
      };
    }
  }

  if (!activeMemberships.length) {
    return {
      message: "No pudimos completar el cambio de contraseña.",
    };
  }

  const clearedUser = await dependencies.setPublicUserMustChangePassword(publicClient, publicUser.id, false);

  if (!clearedUser) {
    return {
      message: "No pudimos completar el cambio de contraseña.",
    };
  }

  return dependencies.redirect(next);
}
