"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { AccountPermissionKey } from "@/features/accounts/types";
import { getPermissionLabel } from "@/features/accounts/domain/accounts-domain";
import { useCheckInStore } from "@/services/workspace-service";

export default function PermissionGuard({
  permission,
  children,
  fallbackHref = "/",
}: {
  permission: AccountPermissionKey;
  children: ReactNode;
  fallbackHref?: string;
}) {
  const { can, currentAccount, status } = useCheckInStore();

  if (status === "loading") {
    return (
      <section className="flex min-h-[55vh] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
        <div className="max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Cargando contexto</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Estamos reconstruyendo tus permisos efectivos.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">Recuperando la cuenta activa antes de abrir {getPermissionLabel(permission).toLowerCase()}.</p>
        </div>
      </section>
    );
  }

  if (can(permission)) {
    return children;
  }

  const accountName = currentAccount.displayName || currentAccount.userDisplayName || "Cuenta actual";

  return (
    <section className="flex min-h-[55vh] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
      <div className="max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Permiso insuficiente</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">No tenés permiso para abrir esta vista.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          {accountName} no tiene asignado {getPermissionLabel(permission).toLowerCase()} en esta organización.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={fallbackHref}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Volver al resumen
          </Link>
          <Link
            href="/settings"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Revisar permisos
          </Link>
        </div>
      </div>
    </section>
  );
}
