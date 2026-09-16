/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireDriveOrganizationManager } from "@/lib/reporting/google-drive-authz";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})); const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  try {
    await requireDriveOrganizationManager(organizationId); const db = getSupabaseServerClient() as any;
    const { data, error: readError } = await db.from("reporting_drive_integrations").select("id,oauth_secret_id").eq("organization_id", organizationId).is("deleted_at", null).maybeSingle(); if (readError) throw readError;
    if (data?.oauth_secret_id) await db.rpc("drive_vault_delete_secret", { p_secret_id: data.oauth_secret_id });
    const { error } = await db.from("reporting_drive_integrations").update({ enabled: false, status: "disabled", oauth_secret_id: null }).eq("organization_id", organizationId); if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false, error: "google_drive_disconnect_failed" }, { status: 400 }); }
}
