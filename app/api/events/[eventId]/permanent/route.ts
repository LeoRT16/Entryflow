import { NextResponse } from "next/server";

import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getSupabaseAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: { code: "unauthenticated" } }, { status: 401 });
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ ok: false, error: { code: "event_not_found" } }, { status: 404 });
  const supabase = await getSupabaseServerClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("permanently_delete_archived_event", { p_event_id: eventId });
  if (error) {
    const code = error.message.match(/event_(?:not_found|not_archived|permanent_delete_forbidden|delete_blocked|delete_unauthenticated)/)?.[0] ?? "permanent_delete_failed";
    const status = code === "event_not_found" ? 404 : code === "event_permanent_delete_forbidden" ? 403 : code === "event_not_archived" || code === "event_delete_blocked" ? 409 : 500;
    return NextResponse.json({ ok: false, error: { code } }, { status });
  }
  return NextResponse.json(data ?? { ok: true, eventId, deleted: true });
}
