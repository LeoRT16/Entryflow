import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAuthServerClient, getSupabaseAuthUser } from "@/lib/supabase/auth";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

type RevisionQuery = { select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: { revision?: number } | null; error: Error | null }> } } };
type Db = { from(table: string): RevisionQuery; rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> };

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) return NextResponse.json({ error: "event_required" }, { status: 400 });

  const user = await getSupabaseAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const workspace = await loadWorkspaceBootstrap({ id: user.id, email: user.email });
  if (workspace.authState.status !== "ready") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const target = workspace.events.find((event) => event.id === eventId);
  if (!target) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  const profile = workspace.profiles.find((candidate) => candidate.userId === workspace.currentUserId && candidate.organizationId === target.organizationId && !candidate.deletedAt);
  const role = workspace.roles.find((candidate) => candidate.id === profile?.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({ permissions: profile?.metadata?.permissions, rolePermissions: role.permissions, roleMetadata: role.metadata, accountMetadata: profile?.metadata });
  if (!workspace.isPlatformRoot && !permissions.includes("event.edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const client = await createSupabaseAuthServerClient();
  if (!client) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const previousLive = workspace.events.find((event) => event.organizationId === target.organizationId && event.status === "live" && event.id !== target.id);
  let report: unknown = null;
  let revision: number | null = null;
  if (previousLive) {
    const db = client as unknown as Db;
    const first = await db.from("reporting_event_revisions").select("revision").eq("event_id", previousLive.id).maybeSingle();
    if (first.error || first.data?.revision === undefined) return NextResponse.json({ error: "reporting_revision_unavailable" }, { status: 409 });
    const { loadEventReportForWorker } = await import("@/features/reporting/server/event-report-worker-loader");
    try {
      report = await loadEventReportForWorker(client as never, { eventId: previousLive.id, organizationId: previousLive.organizationId });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "final_report_preparation_failed" }, { status: 409 });
    }
    const second = await db.from("reporting_event_revisions").select("revision").eq("event_id", previousLive.id).maybeSingle();
    if (second.error || second.data?.revision !== first.data.revision) return NextResponse.json({ error: "final_report_revision_conflict" }, { status: 409 });
    revision = first.data.revision;
  }

  const result = await (client as unknown as Db).rpc("activate_event", {
    p_event_id: eventId,
    p_previous_live_report: report,
    p_previous_live_expected_revision: revision,
  });
  if (result.error) return NextResponse.json({ error: result.error.message ?? "event_activation_failed" }, { status: result.error.code === "40001" ? 409 : 400 });
  return NextResponse.json(result.data);
}
