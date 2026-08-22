import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import type { Organization } from "@/features/domain/types";
import { createUuid, nowIso } from "@/lib/supabase/helpers";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { buildSlugFromName } from "@/lib/slug";

type OrganizationRequestBody = {
  id?: string;
  name?: string;
  slug?: string;
  timezone?: string;
  status?: Organization["status"];
  branding?: Organization["branding"];
  settings?: Organization["settings"];
  metadata?: Organization["metadata"];
};

type OrgRouteDependencies = {
  getAuthUser: typeof getSupabaseAuthUser;
  loadWorkspace: typeof loadWorkspaceBootstrap;
  getClient: typeof getSupabaseServerClient;
  createRepositories: typeof createSupabaseWorkspaceRepositories;
};

function createOrgRouteDependencies(): OrgRouteDependencies {
  return {
    getAuthUser: getSupabaseAuthUser,
    loadWorkspace: loadWorkspaceBootstrap,
    getClient: getSupabaseServerClient,
    createRepositories: createSupabaseWorkspaceRepositories,
  };
}

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRequestObject<T extends Record<string, unknown>>(value: unknown): T | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : undefined;
}

function normalizeOrganizationInput(body: OrganizationRequestBody) {
  const name = getRequestString(body.name);
  const timezone = getRequestString(body.timezone);
  const slug = getRequestString(body.slug) || buildSlugFromName(name);

  return {
    id: getRequestString(body.id) || createUuid(),
    name,
    slug: slug || "nueva-organizacion",
    timezone,
    status: body.status === "paused" || body.status === "archived" ? body.status : "active",
    branding: getRequestObject<Organization["branding"]>(body.branding) ?? {},
    settings: getRequestObject<Organization["settings"]>(body.settings) ?? { timezone },
    metadata: getRequestObject<Record<string, unknown>>(body.metadata),
  } satisfies Organization;
}

async function resolveCreateOrganizationSlug(
  repositories: ReturnType<typeof createSupabaseWorkspaceRepositories>,
  organization: Organization,
) {
  const existingOrganization = await repositories.organizations.getBySlug(organization.slug);

  if (!existingOrganization || existingOrganization.id === organization.id) {
    return organization;
  }

  return {
    ...organization,
    slug: `${organization.slug}-${organization.id.slice(0, 8)}`,
  };
}

export async function handleOrganizationBootstrap(request: Request, dependencies = createOrgRouteDependencies()) {
  const authUser = await dependencies.getAuthUser();

  if (!authUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "Debés iniciar sesión para crear o editar organizaciones.",
        },
      },
      { status: 401 },
    );
  }

  const workspace = await dependencies.loadWorkspace({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: workspace.authState.status,
          message: getWorkspaceAuthStateMessage(workspace.authState),
        },
      },
      { status: 403 },
    );
  }

  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;

  if (!currentProfile) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No pudimos resolver tu perfil activo.",
        },
      },
      { status: 403 },
    );
  }

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const currentPermissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  if (!currentPermissions.includes("organization.manage")) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No tenés permiso para crear o editar organizaciones.",
        },
      },
      { status: 403 },
    );
  }

  let body: OrganizationRequestBody;

  try {
    body = (await request.json()) as OrganizationRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "La solicitud de organización no es válida.",
        },
      },
      { status: 400 },
    );
  }

  const name = getRequestString(body.name);
  const timezone = getRequestString(body.timezone);
  const requestedId = getRequestString(body.id);

  if (!name || !timezone) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_fields",
          message: "Faltan datos para guardar la organización.",
        },
      },
      { status: 400 },
    );
  }

  const client = dependencies.getClient();

  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "supabase_unavailable",
          message: "No pudimos preparar la organización.",
        },
      },
      { status: 503 },
    );
  }

  const repositories = dependencies.createRepositories(client);
  const existingOrganization = requestedId ? await repositories.organizations.getById(requestedId) : undefined;
  const nextOrganization = normalizeOrganizationInput({
    ...body,
    id: existingOrganization?.id ?? requestedId,
    name,
    timezone,
  });

  try {
    if (existingOrganization) {
      if (existingOrganization.id !== workspace.currentOrganizationId) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "forbidden",
              message: "Solo podés editar la organización activa.",
            },
          },
          { status: 403 },
        );
      }

      const updatedOrganization = await repositories.organizations.update(existingOrganization.id, {
        ...existingOrganization,
        ...nextOrganization,
        id: existingOrganization.id,
        status: existingOrganization.status,
      });

      if (!updatedOrganization) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "organization_update_failed",
              message: "No pudimos guardar la organización.",
            },
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        created: false,
        organization: updatedOrganization,
        profile: currentProfile,
      });
    }

    const ownerRole = await repositories.roles.getBySlug("owner");

    if (!ownerRole) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "role_not_found",
            message: "No pudimos resolver el rol Owner.",
          },
        },
        { status: 500 },
      );
    }

    const organizationToCreate = await resolveCreateOrganizationSlug(repositories, {
      ...nextOrganization,
      id: nextOrganization.id,
      status: "active",
    });
    const createdOrganization = await repositories.organizations.create(organizationToCreate);

    try {
      const createdProfile = await repositories.profiles.create({
        id: createUuid(),
        organizationId: createdOrganization.id,
        userId: workspace.currentUserId,
        roleId: ownerRole.id,
        displayName: currentProfile.displayName || workspace.users.find((user) => user.id === workspace.currentUserId)?.displayName || "Owner",
        attributes: {
          status: "active",
          permissions: ownerRole.permissions,
          bootstrap: true,
        },
        metadata: {
          attributes: {
            status: "active",
            permissions: ownerRole.permissions,
            bootstrap: true,
          },
          bootstrap: true,
          permissions: ownerRole.permissions,
        },
        status: "active",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: null,
      });

      return NextResponse.json({
        ok: true,
        created: true,
        organization: createdOrganization,
        profile: createdProfile,
      });
    } catch (error) {
      await repositories.organizations.delete(createdOrganization.id).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "organization_persist_failed",
          message: error instanceof Error && error.message ? error.message : "No pudimos guardar la organización.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handleOrganizationBootstrap(request);
}
