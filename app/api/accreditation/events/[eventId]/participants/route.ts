import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { isAccreditationPhase2EventType, mergeAccreditationParticipantMetadata, resolveAccreditationParticipantProfile } from "@/features/accreditation/participants";
import { createSupabaseAccreditationRepositories } from "@/repositories/supabase-accreditation-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type ParticipantMutationBody = {
  name?: string;
  email?: string;
  phone?: string;
  categoryId?: string;
  company?: string;
  jobTitle?: string;
  badgeName?: string;
  participantRole?: string;
};

type RouteDependencies = {
  getAuthUser?: typeof getSupabaseAuthUser;
  loadWorkspace?: typeof loadWorkspaceBootstrap;
  getClient?: typeof getSupabaseServerClient;
  createEnrollmentRepositories?: typeof createSupabaseAccreditationRepositories;
};

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildParticipantMetadata(body: ParticipantMutationBody) {
  return mergeAccreditationParticipantMetadata(undefined, {
    company: body.company,
    jobTitle: body.jobTitle,
    badgeName: body.badgeName,
    participantRole: body.participantRole,
  });
}

async function resolveEventScope(params: {
  eventId: string;
  dependencies: RouteDependencies;
}) {
  const getAuthUser = params.dependencies.getAuthUser ?? getSupabaseAuthUser;
  const loadWorkspace = params.dependencies.loadWorkspace ?? loadWorkspaceBootstrap;
  const authUser = await getAuthUser();

  if (!authUser) {
    return { ok: false as const, status: 401, error: { code: "unauthenticated", message: "Debés iniciar sesión." } };
  }

  const workspace = await loadWorkspace({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return {
      ok: false as const,
      status: 403,
      error: { code: workspace.authState.status, message: getWorkspaceAuthStateMessage(workspace.authState) },
    };
  }

  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;

  if (!currentProfile) {
    return {
      ok: false as const,
      status: 403,
      error: { code: "forbidden", message: "No pudimos resolver tu perfil activo." },
    };
  }

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  if (!permissions.includes("event.edit") && !permissions.includes("settings.manage")) {
    return {
      ok: false as const,
      status: 403,
      error: { code: "forbidden", message: "No tenés permiso para gestionar participantes." },
    };
  }

  const event = workspace.events.find((item) => item.id === params.eventId && item.organizationId === workspace.currentOrganizationId) ?? null;

  if (!event) {
    return {
      ok: false as const,
      status: 404,
      error: { code: "event_not_found", message: "No pudimos resolver el evento operativo." },
    };
  }

  if (!isAccreditationPhase2EventType(event.eventType)) {
    return {
      ok: false as const,
      status: 400,
      error: { code: "unsupported_event_type", message: "Este evento no forma parte de la Fase 2." },
    };
  }

  return {
    ok: true as const,
    workspace,
    event,
    currentProfile,
    permissions,
  };
}

function readBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {};
  }

  return body as ParticipantMutationBody;
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }, dependencies: RouteDependencies = {}) {
  const { eventId } = await context.params;
  let body: ParticipantMutationBody = {};

  try {
    body = readBody(await request.json());
  } catch {
    body = {};
  }

  const scope = await resolveEventScope({ eventId, dependencies });

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const name = getRequestString(body.name);

  if (!name) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_fields", message: "Falta el nombre del participante." } },
      { status: 400 },
    );
  }

  const client = (dependencies.getClient ?? getSupabaseServerClient)() as never;
  const repositories = (dependencies.createEnrollmentRepositories ?? createSupabaseAccreditationRepositories)(client);

  const enrollment = await repositories.enrollments.create({
    organizationId: scope.event.organizationId,
    eventId: scope.event.id,
    name,
    email: getRequestString(body.email) || null,
    phone: getRequestString(body.phone) || null,
    categoryId: getRequestString(body.categoryId) || null,
    metadata: buildParticipantMetadata(body),
  });

  return NextResponse.json({
    ok: true,
    enrollmentId: enrollment.id,
    status: enrollment.status,
    participant: {
      id: enrollment.id,
      name: enrollment.name,
      email: enrollment.email ?? null,
      phone: enrollment.phone ?? null,
      categoryId: enrollment.categoryId ?? null,
      metadata: resolveAccreditationParticipantProfile(enrollment.metadata),
    },
  });
}
