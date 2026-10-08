import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";
import { classifyReportingFailure, isOperatorRetryEligible } from "@/features/reporting/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const client = await createSupabaseAuthServerClient();
  if (!client) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!eventId) return NextResponse.json({ eligible: false });
  // The auth client schema does not include the reporting tables in generated types.
  // Keep this read-only diagnostic query narrowly typed at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as unknown as { from(table: string): any };
  const destination = await db.from("reporting_destinations").select("id").eq("event_id", eventId).is("deleted_at", null).maybeSingle();
  if (destination.error || !destination.data?.id) return NextResponse.json({ eligible: false });
  const outbox = await db.from("reporting_outbox").select("id,status,last_error,updated_at").eq("destination_id", destination.data.id).maybeSingle();
  if (outbox.error || !outbox.data) return NextResponse.json({ eligible: false });
  const code = typeof outbox.data.last_error === "string" ? outbox.data.last_error.split(":", 1)[0] : null;
  return NextResponse.json({ eligible: outbox.data.status === "dead" && isOperatorRetryEligible(code), outboxId: outbox.data.id, category: classifyReportingFailure(code, true), lastFailureAt: outbox.data.updated_at ?? null });
}

export async function POST(request: Request) {
  const client = await createSupabaseAuthServerClient();
  if (!client) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const body = await request.json().catch(() => null) as { outboxId?: unknown } | null;
  const outboxId = typeof body?.outboxId === "string" ? body.outboxId : "";
  if (!outboxId) return NextResponse.json({ error: "outbox_required" }, { status: 400 });
  const { data, error } = await (client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: Error | null }> }).rpc("retry_reporting_terminal_work", { p_outbox_id: outboxId });
  if (error) {
    const status = error.message.includes("forbidden") ? 403 : error.message.includes("not_allowed") ? 409 : 500;
    return NextResponse.json({ error: "reporting_retry_rejected" }, { status });
  }
  return NextResponse.json({ ok: data === true });
}
