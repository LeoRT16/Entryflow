import { NextResponse } from "next/server";
import { createReportingSpreadsheetProvisioningRepository, processReportingSpreadsheetProvisioningBatch } from "@/features/reporting/google-sheets/provisioning/worker";
import { readGoogleOAuthConfig } from "@/features/reporting/google-drive/oauth/google-oauth-client";
import { authorizeReportingCronRequest } from "@/lib/reporting/cron-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeReportingCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    readGoogleOAuthConfig();
    const workerId = request.headers.get("x-reporting-worker-id")?.trim().slice(0, 120) || `spreadsheet-${Date.now()}`;
    const result = await processReportingSpreadsheetProvisioningBatch({
      repository: createReportingSpreadsheetProvisioningRepository(getSupabaseServerClient() as unknown as Parameters<typeof createReportingSpreadsheetProvisioningRepository>[0]),
    }, workerId, 5);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "spreadsheet_provisioning_worker_failed_safely" }, { status: 500 });
  }
}

export const GET = POST;
