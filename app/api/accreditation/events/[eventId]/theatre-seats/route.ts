import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAccreditationTheatreRepository } from "@/repositories/supabase-accreditation-theatre-repository";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";

type Params = { params: Promise<{ eventId: string }> };

async function resolveScope(eventId: string) {
  const authUser = await getSupabaseAuthUser();
  if (!authUser) return { ok: false as const, status: 401, message: "Debés iniciar sesión." };
  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });
  if (workspace.authState.status !== "ready") {
    return { ok: false as const, status: 403, message: getWorkspaceAuthStateMessage(workspace.authState) };
  }
  const profile = workspace.profiles.find((item) => item.id === workspace.currentProfileId && !item.deletedAt);
  const role = profile ? workspace.roles.find((item) => item.id === profile.roleId) ?? getRolePresetBySlug("administrator") : null;
  const permissions = profile && role ? resolveAccountPermissions({ permissions: profile.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile.metadata }) : [];
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId);
  if (!profile || !event) return { ok: false as const, status: 404, message: "No pudimos resolver el evento operativo." };
  if (event.eventType !== "theatre") return { ok: false as const, status: 400, message: "La configuración de asientos solo está disponible para Teatro." };
  if (!permissions.includes("event.edit") && !permissions.includes("settings.manage")) {
    return { ok: false as const, status: 403, message: "No tenés permiso para configurar asientos." };
  }
  return { ok: true as const, workspace, event, profile };
}

export async function POST(request: Request, { params }: Params) {
  const { eventId } = await params;
  const scope = await resolveScope(eventId);
  if (!scope.ok) return NextResponse.json({ ok: false, error: { message: scope.message } }, { status: scope.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const section = typeof body.section === "string" ? body.section.trim() : "";
  const rowLabel = typeof body.rowLabel === "string" ? body.rowLabel.trim() : "";
  const seatLabels: string[] = Array.isArray(body.seatLabels)
    ? body.seatLabels.filter((value: unknown): value is string => typeof value === "string").map((value: string) => value.trim()).filter(Boolean)
    : [];
  if (!rowLabel || !seatLabels.length) return NextResponse.json({ ok: false, error: { message: "Indicá una fila y al menos un asiento." } }, { status: 400 });
  if (!scope.event.venueId) return NextResponse.json({ ok: false, error: { message: "El evento necesita un venue para configurar asientos." } }, { status: 400 });
  const repository = createSupabaseAccreditationTheatreRepository(getSupabaseServerClient());
  try {
    const seats = await repository.createSeats({ organizationId: scope.event.organizationId, eventId, venueId: scope.event.venueId, section, rowLabel, seatLabels: [...new Set(seatLabels)] });
    return NextResponse.json({ ok: true, seats });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "No pudimos crear los asientos." } }, { status: 400 });
  }
}

export async function GET(request: Request, { params }: Params) {
  const { eventId } = await params;
  const scope = await resolveScope(eventId);
  if (!scope.ok) return NextResponse.json({ ok: false, error: { message: scope.message } }, { status: scope.status });
  const repository = createSupabaseAccreditationTheatreRepository(getSupabaseServerClient());
  const seats = await repository.listSeats({ organizationId: scope.event.organizationId, eventId });
  return NextResponse.json({ ok: true, seats });
}
