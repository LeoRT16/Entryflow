import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { createSupabaseAuthServerClient, getSupabaseAuthUser } from "@/lib/supabase/auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getSupabaseAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: { code: "unauthenticated" } }, { status: 401 });
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ ok: false, error: { code: "event_not_found" } }, { status: 404 });
  // Use the cookie-backed authenticated client so auth.uid() reaches the
  // SECURITY DEFINER function. The service-role client would authenticate
  // the RPC as service_role and produce event_delete_unauthenticated.
  const supabase = await createSupabaseAuthServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: { code: "auth_configuration" } }, { status: 500 });
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }> }).rpc("permanently_delete_archived_event", { p_event_id: eventId });
  if (error) {
    const rawMessage = error.message ?? "";
    const code = rawMessage.match(/event_(?:not_found|not_archived|permanent_delete_forbidden|delete_blocked|delete_unauthenticated)/)?.[0] ?? "permanent_delete_failed";
    const status = code === "event_not_found" ? 404 : code === "event_permanent_delete_forbidden" ? 403 : code === "event_not_archived" || code === "event_delete_blocked" ? 409 : 500;
    if (code === "permanent_delete_failed") {
      const diagnosticId = randomUUID();
      console.error("[events/permanent-delete:rpc-error]", { diagnosticId, operation: "permanently_delete_archived_event", eventId, timestamp: new Date().toISOString(), postgresCode: error.code ?? null, message: rawMessage, details: error.details ?? null, hint: error.hint ?? null });
      return NextResponse.json({ ok: false, error: { code, diagnosticId } }, { status });
    }
    return NextResponse.json({ ok: false, error: { code } }, { status });
  }
  return NextResponse.json(data ?? { ok: true, eventId, deleted: true });
}
