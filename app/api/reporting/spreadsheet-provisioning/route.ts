import { NextResponse } from "next/server";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getSupabaseAuthUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await request.json() as { eventId?: unknown };
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });

    const workspace = await loadWorkspaceBootstrap({ id: user.id, email: user.email });
    if (workspace.authState.status !== "ready") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const event = workspace.events.find((candidate) => candidate.id === eventId);
    const currentUserId = workspace.currentUserId;
    const profile = event && currentUserId
      ? workspace.profiles.find((candidate) => candidate.organizationId === event.organizationId && candidate.userId === currentUserId && !candidate.deletedAt)
      : undefined;
    const role = profile ? workspace.roles.find((candidate) => candidate.id === profile.roleId) : undefined;
    const allowed = Boolean(event && workspace.authState.organizationIds.includes(event.organizationId)
      && (role?.permissions.includes("event.edit") || role?.permissions.includes("organization.manage")));
    if (!allowed) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const { data, error } = await (getSupabaseServerClient() as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("request_reporting_spreadsheet_provisioning", { p_event_id: eventId });
    if (error) return NextResponse.json({ ok: false, error: "spreadsheet_provisioning_request_failed" }, { status: 409 });
    const row = Array.isArray(data) ? data[0] as { provisioning_status?: string } | undefined : undefined;
    return NextResponse.json({ ok: true, status: row?.provisioning_status ?? "pending" }, { status: 202 });
  } catch {
    return NextResponse.json({ ok: false, error: "spreadsheet_provisioning_request_failed" }, { status: 500 });
  }
}
