"use client";

import { useActionState } from "react";

import { setupPasswordAction, type SetupPasswordActionState } from "@/app/auth/setup-password/actions";

function PasswordField({
  label,
  name,
  placeholder,
  error,
  autoComplete,
}: {
  label: string;
  name: "password" | "confirmPassword";
  placeholder: string;
  error?: string;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        name={name}
        type="password"
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </label>
  );
}

export default function SetupPasswordForm({ next, email }: { next: string; email: string }) {
  const [state, action, pending] = useActionState<SetupPasswordActionState, FormData>(setupPasswordAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/8 px-4 py-3 text-sm leading-6 text-cyan-50">
        <p className="font-medium text-white">Correo de acceso</p>
        <p className="mt-1 text-cyan-100/80">{email}</p>
      </div>

      <PasswordField
        label="Nueva contraseña"
        name="password"
        placeholder="Creá una contraseña segura"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />

      <PasswordField
        label="Confirmar contraseña"
        name="confirmPassword"
        placeholder="Repetí la contraseña"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      <p className="text-xs leading-5 text-slate-400">
        Esta pantalla convierte tu acceso temporal en una contraseña personal antes de entrar al equipo.
      </p>

      {state.message ? <p className="text-sm leading-6 text-slate-300">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar contraseña"}
      </button>
    </form>
  );
}
