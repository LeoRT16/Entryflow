import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getGoogleDriveIntegrationStatus } from "@/features/reporting/google-drive/repository";
import { requireDriveOrganizationManager } from "@/lib/reporting/google-drive-authz";
export const runtime = "nodejs";
export async function GET(request: Request) { const organizationId = new URL(request.url).searchParams.get("organizationId")?.trim() ?? ""; try { await requireDriveOrganizationManager(organizationId); return NextResponse.json(await getGoogleDriveIntegrationStatus(getSupabaseServerClient(), organizationId)); } catch { return NextResponse.json({ ok: false, error: "google_drive_status_failed" }, { status: 400 }); } }
