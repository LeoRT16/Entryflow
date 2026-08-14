"use client";

import { useActionState } from "react";

import { loginAction, type LoginActionState } from "@/app/login/actions";

function Field({
  label,
  name,
  type,
  placeholder,
  error,
}: {
  label: string;
  name: string;
  type: string;
  placeholder: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={name}
        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </label>
  );
}

export default function LoginForm({ next, noticeMessage }: { next: string; noticeMessage?: string | null }) {
  const [state, action, pending] = useActionState<LoginActionState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Correo" name="email" type="email" placeholder="tu@correo.com" error={state.fieldErrors?.email} />
      <Field label="Contraseña" name="password" type="password" placeholder="••••••••" error={state.fieldErrors?.password} />

      {noticeMessage ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          {noticeMessage}
        </div>
      ) : null}

      {state.message ? <p className="text-sm leading-6 text-slate-300">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Ingresando..." : "Entrar"}
      </button>
    </form>
  );
}
