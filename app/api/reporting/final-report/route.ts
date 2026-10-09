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
