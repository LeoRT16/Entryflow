import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { normalizeAccreditationSectorAccessAttemptSource } from "@/features/accreditation/sector-access";
import { createSupabaseAccreditationAccessRepositories } from "@/repositories/supabase-accreditation-access-repositories";
import { createSupabaseAccreditationRepositories } from "@/repositories/supabase-accreditation-repositories";
import { createSupabaseAccreditationSectorAccessRepositories } from "@/repositories/supabase-accreditation-sector-access-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type MovementBody = { credential?: string; sectorId?: string; checkpointId?: string; movement?: string; source?: string };
type ScopeResult =
  | { ok: false; status: number; error: { code: string; message: string } }
  | { ok: true; event: { id: string; organizationId: string }; operatorProfileId: string };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

async function resolveScope(eventId: string, requirePerform: boolean): Promise<ScopeResult> {
  const authUser = await getSupabaseAuthUser();
  if (!authUser) return { ok: false, status: 401, error: { code: "unauthenticated", message: "Debés iniciar sesión." } };
  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });
  if (workspace.authState.status !== "ready") return { ok: false, status: 403, error: { code: workspace.authState.status, message: getWorkspaceAuthStateMessage(workspace.authState) } };
  const operator = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;
  if (!operator) return { ok: false, status: 403, error: { code: "forbidden", message: "No pudimos resolver tu perfil activo." } };
  const role = workspace.roles.find((item) => item.id === operator.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({ permissions: operator.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: operator.metadata });
  if (requirePerform ? !permissions.includes("checkin.perform") : !permissions.some((permission) => permission === "checkin.perform" || permission === "checkin.view")) {
    return { ok: false, status: 403, error: { code: "forbidden", message: "No tenés permiso para consultar movimientos de sector." } };
  }
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId) ?? null;
  if (!event) return { ok: false, status: 404, error: { code: "event_not_found", message: "No pudimos resolver el evento operativo." } };
  return { ok: true, event, operatorProfileId: operator.id };
}

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const scope = await resolveScope(eventId, false);
  if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  const repositories = createSupabaseAccreditationSectorAccessRepositories(getSupabaseServerClient() as never);
  const movements = await repositories.movements.listByEvent({ organizationId: scope.event.organizationId, eventId: scope.event.id });
  return NextResponse.json({ ok: true, movements });
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const scope = await resolveScope(eventId, true);
  if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  let body: MovementBody = {};
  try { body = (await request.json()) as MovementBody; } catch { body = {}; }
  const credential = text(body.credential);
  const requestedSectorReference = text(body.sectorId);
  const checkpointReference = text(body.checkpointId);
  const movement = text(body.movement);
  const source = text(body.source) || "manual_code";
  if (!credential || (!requestedSectorReference && !checkpointReference) || !["entry", "exit"].includes(movement)) {
    return NextResponse.json({ ok: false, error: { code: "missing_fields", message: "Faltan la credencial, el sector o el movimiento." } }, { status: 400 });
  }
  let normalizedSource;
  try { normalizedSource = normalizeAccreditationSectorAccessAttemptSource(source); } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_source", message: "La fuente de movimiento no es válida." } }, { status: 400 });
  }
  const client = getSupabaseServerClient() as never;
  const targetScope = { organizationId: scope.event.organizationId, eventId: scope.event.id };
  const accessRepositories = createSupabaseAccreditationAccessRepositories(client);
  const accreditationRepositories = createSupabaseAccreditationRepositories(client);
  const sectorRepositories = createSupabaseAccreditationSectorAccessRepositories(client);
  const checkpoint = checkpointReference ? await sectorRepositories.checkpoints.getById(checkpointReference) : undefined;
  const sectorReference = checkpointReference ? checkpoint?.code || checkpoint?.name || checkpointReference : requestedSectorReference;
  const sector = checkpointReference ? checkpoint ? await sectorRepositories.sectors.getById(checkpoint.sectorId) : undefined : await sectorRepositories.sectors.getById(sectorReference);
  const resolvedSector = sector && sector.organizationId === targetScope.organizationId && sector.eventId === targetScope.eventId ? sector : undefined;
  const grant = normalizedSource === "qr" ? await accessRepositories.resolveByQrToken(targetScope, credential) : await accessRepositories.resolveByAccessCode(targetScope, credential);
  const enrollment = grant ? await accreditationRepositories.enrollments.getById(grant.enrollmentId) : undefined;
  const result = await sectorRepositories.movements.record({
    ...targetScope,
    checkpointId: checkpoint?.id,
    accessGrantId: grant?.id,
    enrollmentId: enrollment?.id,
    sectorId: resolvedSector?.id,
    operatorProfileId: scope.operatorProfileId,
    movement: movement as "entry" | "exit",
    source: normalizedSource,
    credentialReference: credential,
    sectorReference,
  });
  return NextResponse.json({ ok: true, result });
}
