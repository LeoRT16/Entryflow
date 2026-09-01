import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { AccreditationSectorAccessValidationError } from "@/features/accreditation/sector-access";
import { createSupabaseAccreditationAccessRepositories } from "@/repositories/supabase-accreditation-access-repositories";
import { createSupabaseAccreditationSectorAccessRepositories } from "@/repositories/supabase-accreditation-sector-access-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type AccessMutationBody = {
  sectorId?: string;
  entitlementId?: string;
};

type RouteDependencies = {
  getAuthUser?: typeof getSupabaseAuthUser;
  loadWorkspace?: typeof loadWorkspaceBootstrap;
  getClient?: typeof getSupabaseServerClient;
  createAccessRepositories?: typeof createSupabaseAccreditationAccessRepositories;
  createSectorRepositories?: typeof createSupabaseAccreditationSectorAccessRepositories;
};

function readBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {};
  }

  return body as AccessMutationBody;
}

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveAccessScope(params: {
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

  if (!permissions.includes("access.issue")) {
    return {
      ok: false as const,
      status: 403,
      error: { code: "forbidden", message: "No tenés permiso para asignar entitlements." },
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

  return {
    ok: true as const,
    workspace,
    event,
  };
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "23505",
  );
}

async function handlePOST(
  request: Request,
  context: { params: Promise<{ eventId: string; enrollmentId: string }> },
  dependencies: RouteDependencies = {},
) {
  const { eventId, enrollmentId } = await context.params;
  let body: AccessMutationBody = {};

  try {
    body = readBody(await request.json());
  } catch {
    body = {};
  }

  const scope = await resolveAccessScope({ eventId, dependencies });

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const sectorId = getRequestString(body.sectorId);

  if (!sectorId) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_fields", message: "Falta el sector para asignar acceso." } },
      { status: 400 },
    );
  }

  const client = (dependencies.getClient ?? getSupabaseServerClient)() as never;
  const accessRepositories = (dependencies.createAccessRepositories ?? createSupabaseAccreditationAccessRepositories)(client);
  const sectorRepositories = (dependencies.createSectorRepositories ?? createSupabaseAccreditationSectorAccessRepositories)(client);
  const grant = await accessRepositories.getByEnrollment({ organizationId: scope.event.organizationId, eventId: scope.event.id }, enrollmentId);
  const sector = await sectorRepositories.sectors.getById(sectorId);

  if (!grant) {
    return NextResponse.json(
      { ok: false, error: { code: "grant_not_found", message: "Todavía no existe una credencial para esta inscripción." } },
      { status: 404 },
    );
  }

  if (!sector || sector.organizationId !== scope.event.organizationId || sector.eventId !== scope.event.id) {
    return NextResponse.json(
      { ok: false, error: { code: "sector_not_found", message: "No pudimos resolver el sector." } },
      { status: 404 },
    );
  }

  try {
    const entitlement = await sectorRepositories.entitlements.assign({
      organizationId: scope.event.organizationId,
      eventId: scope.event.id,
      accessGrantId: grant.id,
      sectorId: sector.id,
    });

    return NextResponse.json({ ok: true, entitlement });
  } catch (error) {
    if (error instanceof AccreditationSectorAccessValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 400 },
      );
    }

    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "entitlement_conflict",
            message: "Ese acceso ya estaba asignado.",
          },
        },
        { status: 409 },
      );
    }

    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string; enrollmentId: string }> }) {
  return handlePOST(request, context);
}

async function handleDELETE(
  request: Request,
  context: { params: Promise<{ eventId: string; enrollmentId: string }> },
  dependencies: RouteDependencies = {},
) {
  const { eventId, enrollmentId } = await context.params;
  let body: AccessMutationBody = {};

  try {
    body = readBody(await request.json());
  } catch {
    body = {};
  }

  const scope = await resolveAccessScope({ eventId, dependencies });

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const entitlementId = getRequestString(body.entitlementId);

  if (!entitlementId) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_fields", message: "Falta el entitlement para revocar acceso." } },
      { status: 400 },
    );
  }

  const client = (dependencies.getClient ?? getSupabaseServerClient)() as never;
  const accessRepositories = (dependencies.createAccessRepositories ?? createSupabaseAccreditationAccessRepositories)(client);
  const sectorRepositories = (dependencies.createSectorRepositories ?? createSupabaseAccreditationSectorAccessRepositories)(client);
  const grant = await accessRepositories.getByEnrollment({ organizationId: scope.event.organizationId, eventId: scope.event.id }, enrollmentId);
  const entitlement = await sectorRepositories.entitlements.getById(entitlementId);

  if (!grant || !entitlement || entitlement.organizationId !== scope.event.organizationId || entitlement.eventId !== scope.event.id || entitlement.accessGrantId !== grant.id) {
    return NextResponse.json(
      { ok: false, error: { code: "entitlement_not_found", message: "No pudimos resolver el entitlement." } },
      { status: 404 },
    );
  }

  try {
    const revoked = await sectorRepositories.entitlements.revoke(entitlementId);
    return NextResponse.json({ ok: true, entitlement: revoked });
  } catch (error) {
    if (error instanceof AccreditationSectorAccessValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 400 },
      );
    }

    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "entitlement_conflict",
            message: "No se pudo actualizar el entitlement.",
          },
        },
        { status: 409 },
      );
    }

    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string; enrollmentId: string }> }) {
  return handleDELETE(request, context);
}
