import { NextResponse } from "next/server";

import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAccreditationFestivalDayRepository } from "@/repositories/supabase-accreditation-festival-repository";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

async function resolveEvent(eventId: string) {
  const authUser = await getSupabaseAuthUser();
  if (!authUser) return { ok: false as const, status: 401, message: "Debés iniciar sesión." };
  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });
  const profile = workspace.profiles.find((item) => item.id === workspace.currentProfileId && !item.deletedAt);
  const role = profile ? workspace.roles.find((item) => item.id === profile.roleId) ?? getRolePresetBySlug("administrator") : null;
  const permissions = profile && role ? resolveAccountPermissions({ permissions: profile.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile.metadata }) : [];
  const event = workspace.events.find((item) => item.id === eventId && item.organizationId === workspace.currentOrganizationId);
  if (!profile || !event) return { ok: false as const, status: 404, message: "No pudimos resolver el evento." };
  if (event.eventType !== "festival") return { ok: false as const, status: 400, message: "Los días operativos solo están disponibles para Festival." };
  return { ok: true as const, event, profile, canManage: permissions.includes("event.edit") || permissions.includes("settings.manage") };
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const scope = await resolveEvent(eventId);
  if (!scope.ok) return NextResponse.json({ ok: false, error: { message: scope.message } }, { status: scope.status });
  const days = await createSupabaseAccreditationFestivalDayRepository(getSupabaseServerClient()).list({ organizationId: scope.event.organizationId, eventId });
  return NextResponse.json({ ok: true, days });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const scope = await resolveEvent(eventId);
  if (!scope.ok) return NextResponse.json({ ok: false, error: { message: scope.message } }, { status: scope.status });
  if (!scope.canManage) return NextResponse.json({ ok: false, error: { message: "No tenés permiso para configurar días." } }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const dayNumber = Number(body.dayNumber);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const eventDate = typeof body.eventDate === "string" ? body.eventDate.trim() : "";
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || !name || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return NextResponse.json({ ok: false, error: { message: "Indicá número, nombre y fecha del día." } }, { status: 400 });
  try {
    const day = await createSupabaseAccreditationFestivalDayRepository(getSupabaseServerClient()).create({ organizationId: scope.event.organizationId, eventId, dayNumber, name, eventDate });
    return NextResponse.json({ ok: true, day });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "No pudimos crear el día." } }, { status: 400 });
  }
}
