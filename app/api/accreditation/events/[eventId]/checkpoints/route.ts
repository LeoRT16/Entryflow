import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAccreditationSectorAccessRepositories } from "@/repositories/supabase-accreditation-sector-access-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

async function scope(eventId: string) {
  const user = await getSupabaseAuthUser();
  if (!user) return { ok: false as const, status: 401, error: { code: "unauthenticated", message: "Debés iniciar sesión." } };
  const workspace = await loadWorkspaceBootstrap({ id: user.id, email: user.email });
  if (workspace.authState.status !== "ready") return { ok: false as const, status: 403, error: { code: workspace.authState.status, message: getWorkspaceAuthStateMessage(workspace.authState) } };
  const profile = workspace.profiles.find((item) => item.id === workspace.currentProfileId && !item.deletedAt);
  const role = profile ? workspace.roles.find((item) => item.id === profile.roleId) ?? getRolePresetBySlug("administrator") : null;
  const permissions = profile && role ? resolveAccountPermissions({ permissions: profile.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile.metadata }) : [];
  if (!permissions.includes("event.edit") && !permissions.includes("settings.manage")) return { ok: false as const, status: 403, error: { code: "forbidden", message: "No tenés permiso para configurar checkpoints." } };
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId);
  if (!event) return { ok: false as const, status: 404, error: { code: "event_not_found", message: "Evento no encontrado." } };
  return { ok: true as const, event };
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params; const resolved = await scope(eventId);
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  const body = await request.json().catch(() => ({}));
  const client = getSupabaseServerClient() as never;
  const repositories = createSupabaseAccreditationSectorAccessRepositories(client);
  const checkpoint = await repositories.checkpoints.create({ organizationId: resolved.event.organizationId, eventId, sectorId: typeof body.sectorId === "string" ? body.sectorId.trim() : "", name: typeof body.name === "string" ? body.name : "", code: typeof body.code === "string" ? body.code : null, status: body.status });
  return NextResponse.json({ ok: true, checkpoint });
}
