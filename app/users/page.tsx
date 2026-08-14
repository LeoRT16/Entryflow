"use client";

import PermissionGuard from "@/components/permission-guard";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import OrganizationMembersPanel from "@/features/accounts/components/organization-members-panel";
import { useCheckInStore } from "@/services/workspace-service";

function UsersContent() {
  const { currentOrganization, accounts } = useCheckInStore();
  const organizationMembers = accounts.filter((account) => account.organizationId === currentOrganization.id && account.id !== "bootstrap-account");
  const activeMembers = organizationMembers.filter((account) => account.status === "active").length;

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Equipo"
        title="Miembros del equipo"
        description="Alta y mantenimiento de miembros con contraseña temporal, rol fijo y permisos avanzados opcionales."
        primaryAction={{ label: "Ir a ajustes", href: "/settings" }}
        secondaryAction={{ label: "Ir al dashboard", href: "/" }}
      />

      <section className="flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
        <StatusBadge variant="info">{currentOrganization.name || "Sin organización"}</StatusBadge>
        <StatusBadge variant="success">{activeMembers} miembros activos</StatusBadge>
        <StatusBadge variant="info">{organizationMembers.length} miembros totales</StatusBadge>
      </section>

      <OrganizationMembersPanel key={currentOrganization.id} />
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
