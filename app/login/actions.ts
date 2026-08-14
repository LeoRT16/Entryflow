"use server";

import { redirect } from "next/navigation";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { sanitizeRedirectTarget } from "@/app/login/redirect-target";
import { buildPostLoginRedirect } from "@/app/login/login-redirect";

export type LoginActionState = {
  message?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
};

export async function loginAction(_state: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeRedirectTarget(String(formData.get("next") ?? ""));

  const fieldErrors: LoginActionState["fieldErrors"] = {};

  if (!email) {
    fieldErrors.email = "Ingresá tu correo.";
  }

  if (!password) {
    fieldErrors.password = "Ingresá tu contraseña.";
  }

  if (fieldErrors.email || fieldErrors.password) {
    return {
      message: "Revisá los campos antes de continuar.",
      fieldErrors,
    };
  }

  const client = await createSupabaseAuthServerClient();

  if (!client) {
    return {
      message: "No pudimos preparar la sesión de acceso.",
    };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      message: "Correo o contraseña inválidos.",
    };
  }

  const signedInUser = data.user;
  const workspace = await loadWorkspaceBootstrap(
    signedInUser
      ? {
          id: signedInUser.id,
          email: signedInUser.email,
        }
      : undefined,
  );

  redirect(buildPostLoginRedirect(next, workspace.authState));
}
