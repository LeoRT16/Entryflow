"use client";

import { useState } from "react";

import PermissionGuard from "@/components/permission-guard";
import OrganizationMembersPanel from "@/features/accounts/components/organization-members-panel";
import { useCheckInStore } from "@/services/workspace-service";

function UsersContent() {
  const { currentOrganization } = useCheckInStore();
  const [newMemberRequest, setNewMemberRequest] = useState(0);

  return (
    <div className="mx-auto w-full max-w-[1140px] space-y-5 px-4 sm:px-6 lg:px-0">
      <header className="surface-panel flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="kicker">Equipo</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem]">Equipo</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
              Administra los miembros y accesos de tu organización.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setNewMemberRequest((current) => current + 1)}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            + Nuevo miembro
          </button>
        </div>
      </header>

      <OrganizationMembersPanel key={currentOrganization.id} newMemberRequest={newMemberRequest} />
    </div>
  );
}

export default function UsersPage() {
  return (
    <PermissionGuard permission="accounts.view">
      <UsersContent />
    </PermissionGuard>
  );
}
