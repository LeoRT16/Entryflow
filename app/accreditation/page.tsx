import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import Topbar from "@/components/topbar";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import AccreditationInvitationBoard from "@/features/accreditation/invitations/components/accreditation-invitation-board";
import { buildAccreditationInvitationOperationalReadModel } from "@/features/accreditation/invitations/domain/accreditation-invitation-operational";
import { getOperationalModelLabel, getEventTypeLabel } from "@/features/events/domain/event-blueprints";
import { isAccreditationPhase2EventType } from "@/features/accreditation/events";
import { createSupabaseAccreditationAccessRepositories } from "@/repositories/supabase-accreditation-access-repositories";
import { createSupabaseAccreditationInvitationDeliveryRepositories } from "@/repositories/supabase-accreditation-invitation-repositories";
import { createSupabaseAccreditationRepositories } from "@/repositories/supabase-accreditation-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

export const metadata: Metadata = {
  title: "Acreditación",
};

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

export default async function AccreditationPage() {
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    redirect("/login?next=/accreditation");
  }

  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return (
      <WorkspaceNotice
        title="No pudimos abrir la acreditación"
        description={getWorkspaceAuthStateMessage(workspace.authState)}
      />
    );
  }

  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;

  if (!currentProfile) {
    return <WorkspaceNotice title="No encontramos tu perfil activo" description="Revisá que tu cuenta tenga una membresía activa en esta organización." />;
  }

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  const canIssueAccess = permissions.includes("access.issue");
  const currentEvent =
    workspace.events.find((event) => event.id === workspace.currentEventId && event.organizationId === workspace.currentOrganizationId) ??
    workspace.events.find((event) => event.organizationId === workspace.currentOrganizationId) ??
    null;

  if (!currentEvent) {
    return <WorkspaceNotice title="No encontramos un evento activo" description="Seleccioná un evento operativo para ver inscripciones de acreditación." />;
  }

  const scopeOrganizationId = currentEvent.organizationId;
  const scopeEventId = currentEvent.id;

  const client = getSupabaseServerClient() as never;
  const enrollmentRepositories = createSupabaseAccreditationRepositories(client);
  const accessRepositories = createSupabaseAccreditationAccessRepositories(client);
  const deliveryRepositories = createSupabaseAccreditationInvitationDeliveryRepositories(client);

  let enrollments: Awaited<ReturnType<typeof enrollmentRepositories.enrollments.list>>;
  let categories: Awaited<ReturnType<typeof enrollmentRepositories.categories.list>>;
  let accessGrants: Awaited<ReturnType<typeof accessRepositories.list>>;
  let deliveryAttempts: Awaited<ReturnType<typeof deliveryRepositories.listByEvent>>;

  try {
    [enrollments, categories, accessGrants, deliveryAttempts] = await Promise.all([
      enrollmentRepositories.enrollments.list({
        organizationId: scopeOrganizationId,
        eventId: scopeEventId,
      }),
      enrollmentRepositories.categories.list({
        organizationId: scopeOrganizationId,
        eventId: scopeEventId,
      }),
      accessRepositories.list({
        organizationId: scopeOrganizationId,
        eventId: scopeEventId,
      }),
      deliveryRepositories.listByEvent({
        organizationId: scopeOrganizationId,
        eventId: scopeEventId,
      }),
    ]);
  } catch (error) {
    return (
      <WorkspaceNotice
        title="No pudimos cargar las invitaciones"
        description={error instanceof Error && error.message ? error.message : "Revisá la conexión con Supabase y reintentá."}
      />
    );
  }

  const model = buildAccreditationInvitationOperationalReadModel({
    eventName: currentEvent.name,
    venueName: currentEvent.venue,
    canIssueAccess,
    enrollments,
    categories,
    sectors: workspace.sectors.filter((sector) => sector.venueId === currentEvent.venueId),
    accessGrants,
    deliveryAttempts,
    profiles: workspace.profiles,
  });

  const phase2Events = workspace.events.filter(
    (event) => event.organizationId === workspace.currentOrganizationId && isAccreditationPhase2EventType(event.eventType),
  );

  return (
    <main className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-0">
      <Topbar
        eyebrow="Acreditación"
        title="Invitaciones operativas"
        description="Control individual de envíos, reenvíos e historial de WhatsApp para acreditaciones."
      />

      {!canIssueAccess ? (
        <section className="rounded-[1.6rem] border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-50">
          No tenés permiso para enviar o reenviar invitaciones. Podés revisar el estado, el historial y la trazabilidad.
        </section>
      ) : null}

      <AccreditationInvitationBoard model={model} />

      <section className="space-y-4 rounded-[1.8rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Fase 2</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Eventos de perfil y participantes</h2>
          </div>
          <p className="text-sm text-slate-400">Conferencia, Seminario y Taller</p>
        </div>

        {phase2Events.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {phase2Events.map((event) => (
              <Link
                key={event.id}
                href={`/accreditation/events/${event.id}`}
                className="group rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-400/25 hover:bg-white/[0.05]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold tracking-tight text-white">{event.name}</h3>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                    {getEventTypeLabel(event.eventType)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{getOperationalModelLabel(event.operationalModel)}</p>
                <p className="mt-3 text-sm text-slate-500">{event.venue} · {event.startAt}</p>
                <p className="mt-4 text-sm font-medium text-cyan-200 transition group-hover:text-cyan-100">
                  Abrir perfil y participantes
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
            No hay eventos de Conferencia, Seminario o Taller disponibles en esta organización.
          </div>
        )}
      </section>
    </main>
  );
}
