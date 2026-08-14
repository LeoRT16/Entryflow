"use server";

import { redirect } from "next/navigation";

import {
  linkPublicUserByEmailToAuthIdentity,
  setPublicUserMustChangePassword,
} from "@/app/api/accounts/auth-onboarding";
import { sanitizeRedirectTarget } from "@/app/login/redirect-target";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type SetupPasswordActionState = {
  message?: string;
  fieldErrors?: {
    password?: string;
    confirmPassword?: string;
  };
};

export async function setupPasswordAction(_state: SetupPasswordActionState, formData: FormData): Promise<SetupPasswordActionState> {
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

  const authClient = await createSupabaseAuthServerClient();

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

  const { error: updateError } = await authClient.auth.updateUser({ password });

  if (updateError) {
    return {
      message: "No pudimos guardar tu contraseña. Intentá nuevamente.",
    };
  }

  const publicClient = getSupabaseServerClient();

  if (!publicClient) {
    return {
      message: "No pudimos vincular tu acceso al equipo.",
    };
  }

  const repositories = createSupabaseWorkspaceRepositories(publicClient);
  const publicUser =
    (await repositories.users.list()).find((row) => row.authUserId === user.id && !row.deletedAt)
    ?? await repositories.users.getByEmail(email);

  if (!publicUser) {
    return {
      message: "No encontramos tu miembro de EntryFlow para completar el acceso.",
    };
  }

  if (publicUser.authUserId && publicUser.authUserId !== user.id) {
    return {
      message: "Esta cuenta ya está vinculada a otro acceso.",
    };
  }

  if (!publicUser.authUserId) {
    const linkedUser = await linkPublicUserByEmailToAuthIdentity(publicClient, email, user.id);

    if (!linkedUser) {
      return {
        message: "No pudimos vincular tu acceso al miembro de EntryFlow.",
      };
    }
  }

  const clearedUser = await setPublicUserMustChangePassword(publicClient, publicUser.id, false);

  if (!clearedUser) {
    return {
      message: "No pudimos completar el cambio de contraseña.",
    };
  }

  redirect(next);
}
