import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
