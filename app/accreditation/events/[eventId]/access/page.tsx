import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Topbar from "@/components/topbar";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import AccreditationSectorAccessBoard from "@/features/accreditation/sector-access/components/accreditation-sector-access-board";
import AccreditationSectorAccessEvaluationPanel from "@/features/accreditation/sector-access/components/accreditation-sector-access-evaluation-panel";
import AccreditationSectorAccessMovementPanel from "@/features/accreditation/sector-access/components/accreditation-sector-access-movement-panel";
import { createSupabaseAccreditationAccessRepositories } from "@/repositories/supabase-accreditation-access-repositories";
import { createSupabaseAccreditationRepositories } from "@/repositories/supabase-accreditation-repositories";
import { createSupabaseAccreditationSectorAccessRepositories } from "@/repositories/supabase-accreditation-sector-access-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type PageParams = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { eventId } = await params;

  return {
    title: `Acreditación · Sectores ${eventId}`,
  };
}

function WorkspaceNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-0">
      <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Acreditación</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">{description}</p>
      </div>
    </section>
  );
}

export default async function AccreditationSectorAccessPage({ params }: PageParams) {
  const { eventId } = await params;
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    redirect(`/login?next=/accreditation/events/${eventId}/access`);
  }

  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return (
      <WorkspaceNotice
        title="No pudimos abrir los sectores"
        description={getWorkspaceAuthStateMessage(workspace.authState)}
      />
    );
  }

  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;

  if (!currentProfile) {
    return (
      <WorkspaceNotice
        title="No encontramos tu perfil activo"
        description="Revisá que tu cuenta tenga una membresía activa en esta organización."
      />
    );
  }

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  const canManageSectors = permissions.includes("event.edit") || permissions.includes("settings.manage");
  const canAssignEntitlements = permissions.includes("access.issue");
  const canEvaluateSectorAccess = permissions.includes("checkin.perform");
  const canViewSectorAccessHistory = canEvaluateSectorAccess || permissions.includes("checkin.view");
  const currentEvent = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId) ?? null;

  if (!currentEvent) {
    return (
      <WorkspaceNotice
        title="Evento no encontrado"
        description="No pudimos resolver el evento dentro de tu organización activa."
      />
    );
  }

  const client = getSupabaseServerClient() as never;
  const enrollmentRepositories = createSupabaseAccreditationRepositories(client);
  const accessRepositories = createSupabaseAccreditationAccessRepositories(client);
  const sectorAccessRepositories = createSupabaseAccreditationSectorAccessRepositories(client);

  const scope = {
    organizationId: currentEvent.organizationId,
    eventId: currentEvent.id,
  };

  const [enrollments, accessGrants, sectors, entitlements, attempts, movements] = await Promise.all([
    enrollmentRepositories.enrollments.list(scope),
    accessRepositories.list(scope),
    sectorAccessRepositories.sectors.listByEvent(scope),
    sectorAccessRepositories.entitlements.listByEvent(scope),
    canViewSectorAccessHistory ? sectorAccessRepositories.attempts.listByEvent(scope) : Promise.resolve([]),
    canViewSectorAccessHistory ? sectorAccessRepositories.movements.listByEvent(scope) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-0">
      <Topbar
        eyebrow="Acreditación"
        title="Sectores y entitlements"
        description="Configuración de acceso por sector para una credencial estable sin duplicar check-in."
        primaryAction={{
          label: "Volver al evento",
          href: `/accreditation/events/${currentEvent.id}`,
        }}
        secondaryAction={{
          label: "Ver programa",
          href: `/accreditation/events/${currentEvent.id}/program`,
        }}
      />

      <section className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>{currentEvent.eventType}</span>
        <span>·</span>
        <span>{currentEvent.operationalModel}</span>
        <span>·</span>
        <span>{currentEvent.timezone}</span>
      </section>

      <AccreditationSectorAccessEvaluationPanel
        eventId={currentEvent.id}
        sectors={sectors}
        attempts={attempts}
        canEvaluate={canEvaluateSectorAccess}
      />

      <AccreditationSectorAccessMovementPanel
        eventId={currentEvent.id}
        sectors={sectors}
        movements={movements}
        canOperate={canEvaluateSectorAccess}
      />

      <AccreditationSectorAccessBoard
        eventId={currentEvent.id}
        eventName={currentEvent.name}
        canManageSectors={canManageSectors}
        canAssignEntitlements={canAssignEntitlements}
        sectors={sectors}
        enrollments={enrollments}
        accessGrants={accessGrants}
        entitlements={entitlements}
      />
    </main>
  );
}
