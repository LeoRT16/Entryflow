import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAccreditationTheatreRepository } from "@/repositories/supabase-accreditation-theatre-repository";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string; seatId: string }> }) {
  const { eventId, seatId } = await params;
  const authUser = await getSupabaseAuthUser();
  if (!authUser) return NextResponse.json({ ok: false, error: { message: "Debés iniciar sesión." } }, { status: 401 });
  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });
  const profile = workspace.profiles.find((item) => item.id === workspace.currentProfileId && !item.deletedAt);
  const role = profile ? workspace.roles.find((item) => item.id === profile.roleId) ?? getRolePresetBySlug("administrator") : null;
  const permissions = profile && role ? resolveAccountPermissions({ permissions: profile.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile.metadata }) : [];
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId);
  if (!profile || !event) return NextResponse.json({ ok: false, error: { message: "No pudimos resolver el evento." } }, { status: 404 });
  if (event.eventType !== "theatre") return NextResponse.json({ ok: false, error: { message: "La configuración de asientos solo está disponible para Teatro." } }, { status: 400 });
  if (!permissions.includes("event.edit") && !permissions.includes("settings.manage")) return NextResponse.json({ ok: false, error: { message: "No tenés permiso para modificar asientos." } }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const status = body.status === "inactive" ? "inactive" : body.status === "active" ? "active" : null;
  if (!status) return NextResponse.json({ ok: false, error: { message: "Estado de asiento inválido." } }, { status: 400 });
  await createSupabaseAccreditationTheatreRepository(getSupabaseServerClient()).setSeatStatus({ organizationId: event.organizationId, eventId }, seatId, status);
  return NextResponse.json({ ok: true });
}
