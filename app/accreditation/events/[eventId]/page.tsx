import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import Topbar from "@/components/topbar";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import AccreditationEventProfileCard from "@/features/accreditation/participants/components/accreditation-event-profile-card";
import AccreditationParticipantBoard from "@/features/accreditation/participants/components/accreditation-participant-board";
import { buildAccreditationParticipantOperationalReadModel } from "@/features/accreditation/participants";
import { isAccreditationPhase2EventType } from "@/features/accreditation/events";
import { createSupabaseAccreditationAccessRepositories } from "@/repositories/supabase-accreditation-access-repositories";
import { createSupabaseAccreditationCheckInRepositories } from "@/repositories/supabase-accreditation-checkin-repositories";
import { createSupabaseAccreditationInvitationDeliveryRepositories } from "@/repositories/supabase-accreditation-invitation-repositories";
import { createSupabaseAccreditationRepositories } from "@/repositories/supabase-accreditation-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type PageParams = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { eventId } = await params;

  return {
    title: `Acreditación · Evento ${eventId}`,
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

export default async function AccreditationEventPage({ params }: PageParams) {
  const { eventId } = await params;
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    redirect(`/login?next=/accreditation/events/${eventId}`);
  }

  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return (
      <WorkspaceNotice
        title="No pudimos abrir el evento"
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

  const canManageParticipants = permissions.includes("event.edit") || permissions.includes("settings.manage");
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId) ?? null;

  if (!event) {
    return (
      <WorkspaceNotice
        title="Evento no encontrado"
        description="No pudimos resolver el evento dentro de tu organización activa."
      />
    );
  }

  if (!isAccreditationPhase2EventType(event.eventType)) {
    return (
      <WorkspaceNotice
        title="Este evento no pertenece a la Fase 2"
        description="La vista de perfil y participantes solo está disponible para eventos de tipo Concierto, Conferencia, Seminario o Taller."
      />
    );
  }

  const client = getSupabaseServerClient() as never;
  const enrollmentRepositories = createSupabaseAccreditationRepositories(client);
  const accessRepositories = createSupabaseAccreditationAccessRepositories(client);
  const checkInRepositories = createSupabaseAccreditationCheckInRepositories(client);
  const deliveryRepositories = createSupabaseAccreditationInvitationDeliveryRepositories(client);

  const scope = {
    organizationId: event.organizationId,
    eventId: event.id,
  };

  const [enrollments, categories, accessGrants, deliveryAttempts, checkIns] = await Promise.all([
    enrollmentRepositories.enrollments.list(scope),
    enrollmentRepositories.categories.list(scope),
    accessRepositories.list(scope),
    deliveryRepositories.listByEvent(scope),
    checkInRepositories.listByEvent(scope),
  ]);

  const model = buildAccreditationParticipantOperationalReadModel({
    event,
    canEdit: canManageParticipants,
    canCancel: canManageParticipants,
    enrollments,
    categories,
    accessGrants,
    deliveryAttempts,
    checkIns,
    profiles: workspace.profiles,
  });

  if (!model) {
    return (
      <WorkspaceNotice
        title="Este evento no puede abrirse como Fase 2"
        description="No pudimos construir el perfil operacional de participantes para este evento."
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-0">
      <Topbar
        eyebrow="Acreditación"
        title="Perfil y participantes"
        description="Operación individual para Concierto, Conferencia, Seminario y Taller sin usar Guest ni Reservation."
        primaryAction={{
          label: "Ver programa",
          href: `/accreditation/events/${event.id}/program`,
        }}
        secondaryAction={{
          label: "Volver a acreditación",
          href: "/accreditation",
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/accreditation/events/${event.id}/access`}
          className="surface-interactive inline-flex h-11 items-center justify-center px-4 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          Abrir sectores y entitlements
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>{event.eventType}</span>
        <span>·</span>
        <span>{event.operationalModel}</span>
      </div>

      <AccreditationEventProfileCard profile={model.eventProfile} />
      <AccreditationParticipantBoard
        eventId={event.id}
        categories={categories}
        model={model}
        canManageParticipants={canManageParticipants}
      />
    </main>
  );
}
