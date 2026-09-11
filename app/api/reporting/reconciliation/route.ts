import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requestReportingReconciliationBatch } from "@/repositories/reporting-sync-repositories";
import { authorizeReportingCronRequest } from "@/lib/reporting/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeReportingCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await requestReportingReconciliationBatch(getSupabaseServerClient(), 100);
    return NextResponse.json({ destinationsConsidered: Number(result.destinations_considered ?? 0), requested: Number(result.requested ?? 0), failed: Number(result.failed ?? 0) });
  } catch {
    return NextResponse.json({ error: "reconciliation_failed_safely" }, { status: 500 });
  }
}

export const GET = POST;
