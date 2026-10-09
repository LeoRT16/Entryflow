import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  const client = await createSupabaseAuthServerClient();
  if (!client) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) return NextResponse.json({ error: "event_required" }, { status: 400 });
  const db = client as unknown as { from(table: string): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: { id: string; event_id: string; status: string; attempts: number; drive_file_id: string | null; drive_file_url: string | null; last_error_code: string | null; updated_at: string } | null; error: Error | null }> } } } };
  const result = await db.from("reporting_final_report_jobs").select("id,event_id,status,attempts,drive_file_id,drive_file_url,last_error_code,updated_at").eq("event_id", eventId).maybeSingle();
  if (result.error) return NextResponse.json({ error: "final_report_unavailable" }, { status: 500 });
  return NextResponse.json({ job: result.data ?? null });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(request: Request) {
  const client = await createSupabaseAuthServerClient();
  if (!client) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) return NextResponse.json({ error: "event_required" }, { status: 400 });
  const { loadEventReportForWorker } = await import("@/features/reporting/server/event-report-worker-loader");
  const db = client as any;
  const first = await db.from("reporting_event_revisions").select("revision").eq("event_id", eventId).maybeSingle();
  if (first.error || first.data?.revision === undefined) return NextResponse.json({ error: "reporting_revision_unavailable" }, { status: 409 });
  const eventLookup = await db.from("events").select("organization_id").eq("id", eventId).maybeSingle();
  if (eventLookup.error || !eventLookup.data?.organization_id) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  const report = await loadEventReportForWorker(client as any, { eventId, organizationId: eventLookup.data.organization_id });
  const second = await db.from("reporting_event_revisions").select("revision").eq("event_id", eventId).maybeSingle();
  if (second.error || second.data?.revision !== first.data.revision) return NextResponse.json({ error: "final_report_revision_conflict" }, { status: 409 });
  const result = await db.rpc("transition_event_status", { p_event_id: eventId, p_next_status: "finished", p_report: report, p_expected_revision: first.data.revision });
  if (result.error) return NextResponse.json({ error: result.error.message ?? "finalization_failed" }, { status: result.error.code === "40001" ? 409 : 400 });
  return NextResponse.json(result.data);
}

export async function PATCH(request: Request) {
  const client = await createSupabaseAuthServerClient();
  if (!client) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) return NextResponse.json({ error: "event_required" }, { status: 400 });
  const { error } = await (client as any).rpc("retry_reporting_final_report_job", { p_event_id: eventId });
  if (error) return NextResponse.json({ error: error.message ?? "retry_not_eligible" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
