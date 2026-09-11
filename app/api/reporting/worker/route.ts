import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createReportingWorkerRepository, processReportingSyncBatch } from "@/features/reporting/sync/worker";
import { createGoogleSheetsTransport } from "@/features/reporting/google-sheets/client";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { buildEventReport } from "@/features/reporting/domain/event-report";
import { authorizeReportingCronRequest } from "@/lib/reporting/cron-auth";
import { hasReportingRuntimeConfig } from "@/lib/reporting/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeReportingCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasReportingRuntimeConfig()) return NextResponse.json({ error: "worker_not_configured" }, { status: 503 });
  const client = getSupabaseServerClient();
  const workerId = request.headers.get("x-reporting-worker-id") ?? `vercel-${Date.now()}`;
  const workspaceUserId = process.env.REPORTING_WORKSPACE_USER_ID;
  if (!workspaceUserId) return NextResponse.json({ error: "worker_not_configured" }, { status: 503 });
  try {
    const workspace = await loadWorkspaceBootstrap({ id: workspaceUserId });
    const result = await processReportingSyncBatch({
      repository: createReportingWorkerRepository(client),
      transport: createGoogleSheetsTransport(),
      loadReport: async (eventId) => {
        const event = workspace.events.find((item) => item.id === eventId);
        const organization = workspace.organizations.find((item) => item.id === event?.organizationId);
        const venue = workspace.venues.find((item) => item.id === event?.venueId);
        if (!event || !organization) throw new Error("Reporting event scope unavailable.");
        return buildEventReport({ organization, event, venue, resources: workspace.resources, sectors: workspace.sectors, tables: workspace.tables, eventLayoutResources: workspace.eventLayoutResources, eventLayoutSectors: workspace.eventLayoutSectors, eventLayouts: workspace.eventLayouts, reservations: workspace.reservations, guests: workspace.guests, extraWristbandSales: workspace.extraWristbandSales ?? [], checkIns: workspace.checkIns, timelineEvents: workspace.timelineEvents, generatedAt: new Date().toISOString() });
      },
      logger: (entry) => console.info("reporting_worker", entry),
    }, workerId, 5);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "worker_failed_safely" }, { status: 500 });
  }
}

export const GET = POST;
