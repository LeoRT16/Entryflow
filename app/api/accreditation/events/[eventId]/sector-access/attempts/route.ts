import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { evaluateAccreditationSectorAccess, normalizeAccreditationSectorAccessAttemptSource } from "@/features/accreditation/sector-access";
import { createSupabaseAccreditationAccessRepositories } from "@/repositories/supabase-accreditation-access-repositories";
import { createSupabaseAccreditationRepositories } from "@/repositories/supabase-accreditation-repositories";
import { createSupabaseAccreditationSectorAccessRepositories } from "@/repositories/supabase-accreditation-sector-access-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type AttemptBody = {
  credential?: string;
  sectorId?: string;
  checkpointId?: string;
  source?: string;
};

type ScopeResult =
  | { ok: false; status: number; error: { code: string; message: string } }
  | { ok: true; workspace: Awaited<ReturnType<typeof loadWorkspaceBootstrap>>; event: { id: string; organizationId: string }; operatorProfileId: string };

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveScope(eventId: string): Promise<ScopeResult> {
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    return { ok: false, status: 401, error: { code: "unauthenticated", message: "Debés iniciar sesión." } };
  }

  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return { ok: false, status: 403, error: { code: workspace.authState.status, message: getWorkspaceAuthStateMessage(workspace.authState) } };
  }

  const operator = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;

  if (!operator) {
    return { ok: false, status: 403, error: { code: "forbidden", message: "No pudimos resolver tu perfil activo." } };
  }

  const role = workspace.roles.find((item) => item.id === operator.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({
    permissions: operator.metadata?.permissions,
    rolePermissions: role.permissions,
    roleMetadata: role.metadata,
    accountMetadata: operator.metadata,
  });

  if (!permissions.includes("checkin.perform")) {
    return { ok: false, status: 403, error: { code: "forbidden", message: "No tenés permiso para evaluar acceso por sector." } };
  }

  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId) ?? null;

  if (!event) {
    return { ok: false, status: 404, error: { code: "event_not_found", message: "No pudimos resolver el evento operativo." } };
  }

  return { ok: true, workspace, event, operatorProfileId: operator.id };
}

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const scope = await resolveScope(eventId);

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const repositories = createSupabaseAccreditationSectorAccessRepositories(getSupabaseServerClient() as never);
  const attempts = await repositories.attempts.listByEvent({ organizationId: scope.event.organizationId, eventId: scope.event.id });

  return NextResponse.json({ ok: true, attempts });
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const scope = await resolveScope(eventId);

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  let body: AttemptBody = {};

  try {
    body = (await request.json()) as AttemptBody;
  } catch {
    body = {};
  }

  const credential = getText(body.credential);
  const checkpointReference = getText(body.checkpointId);
  const requestedSectorReference = getText(body.sectorId);
  const source = getText(body.source) || "manual_code";

  if (!credential || (!requestedSectorReference && !checkpointReference)) {
    return NextResponse.json({ ok: false, error: { code: "missing_fields", message: "Faltan la credencial y el sector." } }, { status: 400 });
  }

  let normalizedSource;

  try {
    normalizedSource = normalizeAccreditationSectorAccessAttemptSource(source);
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_source", message: "La fuente de evaluación no es válida." } }, { status: 400 });
  }

  const client = getSupabaseServerClient() as never;
  const accessRepositories = createSupabaseAccreditationAccessRepositories(client);
  const accreditationRepositories = createSupabaseAccreditationRepositories(client);
  const sectorRepositories = createSupabaseAccreditationSectorAccessRepositories(client);
  const targetScope = { organizationId: scope.event.organizationId, eventId: scope.event.id };
  const checkpoint = checkpointReference ? await sectorRepositories.checkpoints.getById(checkpointReference) : undefined;
  const sectorReference = checkpointReference ? checkpoint?.code || checkpoint?.name || checkpointReference : requestedSectorReference;
  const sector = checkpointReference ? checkpoint ? await sectorRepositories.sectors.getById(checkpoint.sectorId) : undefined : await sectorRepositories.sectors.getById(sectorReference);
  const resolvedSector = sector && sector.organizationId === targetScope.organizationId && sector.eventId === targetScope.eventId ? sector : undefined;
  const grant = normalizedSource === "qr"
    ? await accessRepositories.resolveByQrToken(targetScope, credential)
    : await accessRepositories.resolveByAccessCode(targetScope, credential);
  const enrollment = grant ? await accreditationRepositories.enrollments.getById(grant.enrollmentId) : undefined;
  const entitlements = grant ? await sectorRepositories.entitlements.listByGrant(targetScope, grant.id) : [];
  const decision = checkpointReference && (!checkpoint || checkpoint.status !== "active")
    ? { allowed: false as const, reason: "checkpoint_inactive" as const }
    : evaluateAccreditationSectorAccess({
    scope: targetScope,
    grant,
    enrollment,
    sector: resolvedSector,
    entitlements,
  });
  const attempt = await sectorRepositories.attempts.append({
    organizationId: targetScope.organizationId,
    eventId: targetScope.eventId,
    accessGrantId: grant?.id ?? null,
    enrollmentId: enrollment?.id ?? null,
    sectorId: resolvedSector?.id ?? null,
    checkpointId: checkpoint?.id ?? null,
    operatorProfileId: scope.operatorProfileId,
    source: normalizedSource,
    credentialReference: credential,
    sectorReference,
    decision: decision.allowed ? "allow" : "deny",
    denialReason: decision.reason,
  });

  return NextResponse.json({ ok: true, decision, attempt });
}
