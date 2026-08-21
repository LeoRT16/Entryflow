import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthBrandHeader from "@/components/auth/auth-brand-header";
import { sanitizeRedirectTarget } from "@/app/login/redirect-target";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";

import SetupPasswordForm from "./setup-password-form";

export const metadata: Metadata = {
  title: "Cambiar contraseña",
};

function getNextTarget(next: string | string[] | undefined) {
  const value = Array.isArray(next) ? next[0] : next;
  return sanitizeRedirectTarget(value ?? "/");
}

export default async function SetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const next = getNextTarget(resolvedSearchParams.next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_34%),linear-gradient(180deg,_#0b0f14_0%,_#080b10_100%)] px-4 py-10 text-[color:var(--foreground)]">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
        <AuthBrandHeader
          description="Terminá de convertir tu acceso temporal en una contraseña permanente para entrar al equipo."
          showAttribution={false}
        />

        <div className="mt-6">
          <SetupPasswordForm next={next} email={authUser.email ?? "Tu correo"} />
        </div>
      </section>
    </main>
  );
}
