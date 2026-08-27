import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Topbar from "@/components/topbar";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import AccreditationProgramBoard from "@/features/accreditation/program/components/accreditation-program-board";
import { buildAccreditationProgramReadModel } from "@/features/accreditation/program";
import { isAccreditationPhase2EventType } from "@/features/accreditation/events";
import { createSupabaseAccreditationProgramRepositories } from "@/repositories/supabase-accreditation-program-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type PageParams = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { eventId } = await params;

  return {
    title: `Acreditación · Programa ${eventId}`,
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

export default async function AccreditationProgramPage({ params }: PageParams) {
  const { eventId } = await params;
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    redirect(`/login?next=/accreditation/events/${eventId}/program`);
  }

  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return (
      <WorkspaceNotice
        title="No pudimos abrir el programa"
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

  const canManageProgram = permissions.includes("event.edit") || permissions.includes("settings.manage");
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
        description="El programa y las sesiones solo están disponibles para eventos de tipo Conferencia, Seminario o Taller."
      />
    );
  }

  const client = getSupabaseServerClient() as never;
  const repositories = createSupabaseAccreditationProgramRepositories(client);
  const sessions = await repositories.list({
    organizationId: event.organizationId,
    eventId: event.id,
  });

  const model = buildAccreditationProgramReadModel({
    event,
    sessions,
  });

  if (!model) {
    return (
      <WorkspaceNotice
        title="No pudimos abrir el programa"
        description="No pudimos construir la vista operacional del programa para este evento."
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-0">
      <Topbar
        eyebrow="Acreditación"
        title="Programa y sesiones"
        description="Agenda operativa para Conferencia, Seminario y Taller sin usar acceso, check-in ni RSVP."
        secondaryAction={{
          label: "Volver al perfil",
          href: `/accreditation/events/${event.id}`,
        }}
        primaryAction={{
          label: "Volver a acreditación",
          href: "/accreditation",
        }}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>{event.eventType}</span>
        <span>·</span>
        <span>{event.operationalModel}</span>
        <span>·</span>
        <span>{event.timezone}</span>
      </div>

      <section className="rounded-[1.8rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Perfil</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{model.eventProfile.eventName}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{model.eventProfile.scheduleLabel}</p>
            <p className="mt-2 text-sm text-slate-500">{model.eventProfile.venueLabel}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[28rem]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Sesiones</p>
              <p className="mt-2 text-lg font-semibold text-white">{model.summary.total}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Programadas</p>
              <p className="mt-2 text-lg font-semibold text-white">{model.summary.upcoming}</p>
            </div>
          </div>
        </div>
      </section>

      <AccreditationProgramBoard
        eventId={event.id}
        eventTimezone={event.timezone}
        model={model}
        canManageProgram={canManageProgram}
      />
    </main>
  );
}
