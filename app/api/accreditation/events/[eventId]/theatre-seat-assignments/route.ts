import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAccreditationTheatreRepository } from "@/repositories/supabase-accreditation-theatre-repository";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const authUser = await getSupabaseAuthUser();
  if (!authUser) return NextResponse.json({ ok: false, error: { message: "Debés iniciar sesión." } }, { status: 401 });
  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });
  const profile = workspace.profiles.find((item) => item.id === workspace.currentProfileId && !item.deletedAt);
  const role = profile ? workspace.roles.find((item) => item.id === profile.roleId) ?? getRolePresetBySlug("administrator") : null;
  const permissions = profile && role ? resolveAccountPermissions({ permissions: profile.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile.metadata }) : [];
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId);
  if (!profile || !event) return NextResponse.json({ ok: false, error: { message: "No pudimos resolver el evento." } }, { status: 404 });
  if (event.eventType !== "theatre") return NextResponse.json({ ok: false, error: { message: "La asignación de asientos solo está disponible para Teatro." } }, { status: 400 });
  if (!permissions.includes("event.edit") && !permissions.includes("settings.manage")) return NextResponse.json({ ok: false, error: { message: "No tenés permiso para asignar asientos." } }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const seatId = typeof body.seatId === "string" ? body.seatId.trim() : "";
  const enrollmentId = typeof body.enrollmentId === "string" ? body.enrollmentId.trim() : "";
  const accessGrantId = typeof body.accessGrantId === "string" ? body.accessGrantId.trim() : undefined;
  if (!seatId || !enrollmentId) return NextResponse.json({ ok: false, error: { message: "Faltan el participante y el asiento." } }, { status: 400 });
  try {
    const result = await createSupabaseAccreditationTheatreRepository(getSupabaseServerClient()).assignSeat({ organizationId: event.organizationId, eventId, seatId, enrollmentId, accessGrantId, operatorProfileId: profile.id });
    return NextResponse.json({ ok: result.status === "assigned", ...result }, { status: result.status === "assigned" ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "No pudimos asignar el asiento." } }, { status: 400 });
  }
}
