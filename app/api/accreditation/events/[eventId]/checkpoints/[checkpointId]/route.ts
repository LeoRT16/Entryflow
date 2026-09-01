import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAccreditationSectorAccessRepositories } from "@/repositories/supabase-accreditation-sector-access-repositories";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

async function authorize(eventId: string) {
  const user = await getSupabaseAuthUser(); if (!user) return null;
  const workspace = await loadWorkspaceBootstrap({ id: user.id, email: user.email });
  if (workspace.authState.status !== "ready") return null;
  const profile = workspace.profiles.find((item) => item.id === workspace.currentProfileId && !item.deletedAt); if (!profile) return null;
  const role = workspace.roles.find((item) => item.id === profile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({ permissions: profile.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile.metadata });
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId);
  return event && (permissions.includes("event.edit") || permissions.includes("settings.manage")) ? event : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string; checkpointId: string }> }) {
  const { eventId, checkpointId } = await context.params; const event = await authorize(eventId);
  if (!event) return NextResponse.json({ ok: false, error: { code: "forbidden", message: "No tenés permiso para configurar checkpoints." } }, { status: 403 });
  const body = await request.json().catch(() => ({})); const repositories = createSupabaseAccreditationSectorAccessRepositories(getSupabaseServerClient() as never);
  const checkpoint = await repositories.checkpoints.update(checkpointId, { name: typeof body.name === "string" ? body.name : undefined, code: typeof body.code === "string" ? body.code : undefined, status: body.status });
  return NextResponse.json({ ok: true, checkpoint });
}

export async function DELETE(_request: Request, context: { params: Promise<{ eventId: string; checkpointId: string }> }) {
  const { eventId, checkpointId } = await context.params; const event = await authorize(eventId);
  if (!event) return NextResponse.json({ ok: false, error: { code: "forbidden", message: "No tenés permiso para configurar checkpoints." } }, { status: 403 });
  const repositories = createSupabaseAccreditationSectorAccessRepositories(getSupabaseServerClient() as never);
  return NextResponse.json({ ok: true, checkpoint: await repositories.checkpoints.deactivate(checkpointId) });
}
