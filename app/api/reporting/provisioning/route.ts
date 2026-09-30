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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
      return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
    }
    const workspace = await loadWorkspaceBootstrap({ id: user.id, email: user.email });
    if (workspace.authState.status !== "ready") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const event = workspace.events.find((candidate) => candidate.id === eventId);
    const profile = event && workspace.currentUserId
      ? workspace.profiles.find((candidate) => candidate.organizationId === event.organizationId && candidate.userId === workspace.currentUserId && !candidate.deletedAt)
      : undefined;
    const role = profile ? workspace.roles.find((candidate) => candidate.id === profile.roleId) : undefined;
    if (!event || !profile || !role?.permissions.includes("event.edit")) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const db = getSupabaseServerClient();
    // The generated Database type does not yet include the service-role-only
    // provisioning RPCs, so this narrow adapter keeps their server boundary explicit.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceDb = db as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>; from: (table: string) => any };
    const requestDrive = await serviceDb.rpc("request_drive_event_provisioning_internal", { p_event_id: eventId, p_kind: "provision_event" });
    if (requestDrive.error) return NextResponse.json({ ok: false, error: "drive_provisioning_request_failed" }, { status: 409 });
    const location = await serviceDb.from("event_drive_locations").select("status,event_drive_folder_id").eq("event_id", eventId).eq("organization_id", event.organizationId).is("deleted_at", null).maybeSingle();
    if (location.error) return NextResponse.json({ ok: false, error: "drive_provisioning_state_unavailable" }, { status: 500 });
    if (location.data?.status !== "ready" || !location.data?.event_drive_folder_id) return NextResponse.json({ ok: true, status: "pending" }, { status: 202 });
    const requestSheet = await serviceDb.rpc("request_reporting_spreadsheet_provisioning", { p_event_id: eventId });
    if (requestSheet.error) return NextResponse.json({ ok: false, error: "spreadsheet_provisioning_request_failed" }, { status: 409 });
    const destination = await serviceDb.from("reporting_destinations").select("enabled,writer_mode,sheet_schema_version,spreadsheet_id").eq("event_id", eventId).eq("provider", "google_sheets").is("deleted_at", null).maybeSingle();
    if (destination.error) return NextResponse.json({ ok: false, error: "reporting_state_unavailable" }, { status: 500 });
    const ready = Boolean(destination.data?.spreadsheet_id);
    return NextResponse.json({ ok: true, status: ready ? "ready" : "pending", destination: destination.data ?? null }, { status: ready ? 200 : 202 });
  } catch {
    return NextResponse.json({ ok: false, error: "reporting_provisioning_failed" }, { status: 500 });
  }
}
