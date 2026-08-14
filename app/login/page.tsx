import type { Metadata } from "next";
import { redirect } from "next/navigation";

import LoginForm from "@/app/login/login-form";
import { getLoginNoticeMessage } from "@/app/login/login-notice";
import StatusBadge from "@/components/status-badge";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

function sanitizeLoginRedirectTarget(next: string | string[] | undefined) {
  const value = Array.isArray(next) ? next[0] : next;

  if (!value || !value.trim().startsWith("/") || value.trim().startsWith("//")) {
    return "/";
  }

  return value.trim();
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authUser = await getSupabaseAuthUser();
  if (authUser) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const next = sanitizeLoginRedirectTarget(resolvedSearchParams.next);
  const noticeMessage = getLoginNoticeMessage(resolvedSearchParams);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_34%),linear-gradient(180deg,_#0b0f14_0%,_#080b10_100%)] px-4 py-10 text-[color:var(--foreground)]">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="space-y-3">
          <StatusBadge variant="info">EntryFlow</StatusBadge>
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">Acceso operativo</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Ingresá a tu equipo</h1>
          <p className="text-sm leading-6 text-slate-400">
            Usá tu correo y contraseña para abrir el workspace autorizado de EntryFlow.
          </p>
        </div>

        <div className="mt-6">
          <LoginForm next={next} noticeMessage={noticeMessage} />
        </div>
      </section>
    </main>
  );
}
