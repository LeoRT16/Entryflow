import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { AccreditationSectorAccessValidationError } from "@/features/accreditation/sector-access";
import { createSupabaseAccreditationSectorAccessRepositories } from "@/repositories/supabase-accreditation-sector-access-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type SectorMutationBody = {
  name?: string;
  code?: string;
  description?: string;
  status?: "active" | "inactive";
  capacity?: number | string | null;
  sortOrder?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

type RouteDependencies = {
  getAuthUser?: typeof getSupabaseAuthUser;
  loadWorkspace?: typeof loadWorkspaceBootstrap;
  getClient?: typeof getSupabaseServerClient;
  createRepositories?: typeof createSupabaseAccreditationSectorAccessRepositories;
};

function readBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {};
  }

  return body as SectorMutationBody;
}

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRequestNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = typeof value === "string" ? Number(value) : value;

  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "23505",
  );
}

async function resolveSectorScope(params: {
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
      error: { code: "forbidden", message: "No tenés permiso para gestionar sectores." },
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

async function handlePATCH(
  request: Request,
  context: { params: Promise<{ eventId: string; sectorId: string }> },
  dependencies: RouteDependencies = {},
) {
  const { eventId, sectorId } = await context.params;
  let body: SectorMutationBody = {};

  try {
    body = readBody(await request.json());
  } catch {
    body = {};
  }

  const scope = await resolveSectorScope({ eventId, dependencies });

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const client = (dependencies.getClient ?? getSupabaseServerClient)() as never;
  const repositories = (dependencies.createRepositories ?? createSupabaseAccreditationSectorAccessRepositories)(client);
  const current = await repositories.sectors.getById(sectorId);

  if (!current || current.organizationId !== scope.event.organizationId || current.eventId !== scope.event.id) {
    return NextResponse.json(
      { ok: false, error: { code: "sector_not_found", message: "No pudimos resolver el sector." } },
      { status: 404 },
    );
  }

  try {
    const sector = await repositories.sectors.update(sectorId, {
      name: body.name === undefined ? undefined : getRequestString(body.name),
      code: body.code === undefined ? undefined : getRequestString(body.code),
      description: body.description === undefined ? undefined : getRequestString(body.description) || null,
      status: body.status,
      capacity: body.capacity === undefined ? undefined : getRequestNumber(body.capacity) ?? null,
      sortOrder: body.sortOrder === undefined ? undefined : getRequestNumber(body.sortOrder) ?? 0,
      metadata: body.metadata ?? null,
    });

    return NextResponse.json({ ok: true, sector });
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
            code: "sector_conflict",
            message: "Ya existe un sector con ese código para este evento.",
          },
        },
        { status: 409 },
      );
    }

    throw error;
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string; sectorId: string }> }) {
  return handlePATCH(request, context);
}

async function handleDELETE(
  _request: Request,
  context: { params: Promise<{ eventId: string; sectorId: string }> },
  dependencies: RouteDependencies = {},
) {
  const { eventId, sectorId } = await context.params;
  const scope = await resolveSectorScope({ eventId, dependencies });

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const client = (dependencies.getClient ?? getSupabaseServerClient)() as never;
  const repositories = (dependencies.createRepositories ?? createSupabaseAccreditationSectorAccessRepositories)(client);
  const current = await repositories.sectors.getById(sectorId);

  if (!current || current.organizationId !== scope.event.organizationId || current.eventId !== scope.event.id) {
    return NextResponse.json(
      { ok: false, error: { code: "sector_not_found", message: "No pudimos resolver el sector." } },
      { status: 404 },
    );
  }

  const sector = await repositories.sectors.deactivate(sectorId);

  return NextResponse.json({ ok: true, sector });
}

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string; sectorId: string }> }) {
  return handleDELETE(request, context);
}
