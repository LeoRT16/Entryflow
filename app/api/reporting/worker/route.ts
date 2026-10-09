import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createReportingWorkerRepository, processReportingSyncBatch } from "@/features/reporting/sync/worker";
import { createGoogleSheetsTransport } from "@/features/reporting/google-sheets/client";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { buildEventReport } from "@/features/reporting/domain/event-report";
import { authorizeReportingCronRequest } from "@/lib/reporting/cron-auth";
import { hasLegacyReportingRuntimeConfig, hasReportingRuntimeConfig } from "@/lib/reporting/runtime-config";
import { createOAuthReportingWorkerDependencies, processOAuthReportingSyncBatch } from "@/features/reporting/google-sheets/oauth-worker";
import { processDriveProvisioningBatch } from "@/features/reporting/google-drive/provisioning/worker";
import { createReportingSpreadsheetProvisioningRepository, processReportingSpreadsheetProvisioningBatch } from "@/features/reporting/google-sheets/provisioning/worker";
import { reconcileReportingAutomaticDestinations } from "@/repositories/reporting-sync-repositories";
import { processFinalReportBatch } from "@/features/reporting/final-report/worker";
import { loadEventReportForWorker } from "@/features/reporting/server/event-report-worker-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeReportingCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasReportingRuntimeConfig()) return NextResponse.json({ error: "worker_not_configured" }, { status: 503 });
  const client = getSupabaseServerClient();
  const workerId = request.headers.get("x-reporting-worker-id") ?? `vercel-${Date.now()}`;
  try {
    const stages: Record<string, unknown> = {};
    try { stages.drive = await processDriveProvisioningBatch(client as never, workerId, 1); } catch { stages.drive = { error: "drive_worker_failed" }; }
    try { stages.spreadsheet = await processReportingSpreadsheetProvisioningBatch({ repository: createReportingSpreadsheetProvisioningRepository(client as never) }, workerId, 5); } catch { stages.spreadsheet = { error: "spreadsheet_worker_failed" }; }
    try { stages.activation = await reconcileReportingAutomaticDestinations(client, 100); } catch { stages.activation = { error: "automatic_activation_reconciliation_failed" }; }
    try { stages.finalReport = await processFinalReportBatch(client as never, workerId, 5); } catch { stages.finalReport = { error: "final_report_worker_failed" }; }
    try {
      let oauthResult = { claimed: 0, synced: 0, skipped: 0, failed: 0 };
      try { oauthResult = await processOAuthReportingSyncBatch(createOAuthReportingWorkerDependencies(client, (eventId, organizationId) => loadEventReportForWorker(client, { eventId, organizationId })), workerId, 5); } catch { stages.oauth = { error: "oauth_sync_failed" }; }
      let legacyResult = { claimed: 0, synced: 0, skipped: 0, failed: 0 };
      if (hasLegacyReportingRuntimeConfig()) {
        const workspace = await loadWorkspaceBootstrap({ id: process.env.REPORTING_WORKSPACE_USER_ID! });
        const loadReport = async (eventId: string) => {
          const event = workspace.events.find((item) => item.id === eventId);
          const organization = workspace.organizations.find((item) => item.id === event?.organizationId);
          const venue = workspace.venues.find((item) => item.id === event?.venueId);
          if (!event || !organization) throw new Error("Reporting event scope unavailable.");
          return buildEventReport({ organization, event, venue, resources: workspace.resources, sectors: workspace.sectors, tables: workspace.tables, eventLayoutResources: workspace.eventLayoutResources, eventLayoutSectors: workspace.eventLayoutSectors, eventLayouts: workspace.eventLayouts, reservations: workspace.reservations, guests: workspace.guests, extraWristbandSales: workspace.extraWristbandSales ?? [], checkIns: workspace.checkIns, timelineEvents: workspace.timelineEvents, generatedAt: new Date().toISOString() });
        };
        try {
          legacyResult = await processReportingSyncBatch({ repository: createReportingWorkerRepository(client), transport: createGoogleSheetsTransport(), loadReport, logger: (entry) => console.info("reporting_worker", entry) }, workerId, 5);
          stages.legacy = legacyResult;
        } catch { stages.legacy = { error: "legacy_sync_failed" }; }
      } else {
        stages.legacy = { status: "skipped", reason: "legacy_runtime_not_configured" };
      }
      stages.sync = { claimed: oauthResult.claimed + legacyResult.claimed, synced: oauthResult.synced + legacyResult.synced, skipped: oauthResult.skipped + legacyResult.skipped, failed: oauthResult.failed + legacyResult.failed };
    } catch { stages.sync = { error: "sync_worker_failed" }; }
    return NextResponse.json(stages);
  } catch {
    return NextResponse.json({ error: "worker_failed_safely" }, { status: 500 });
  }
}

export const GET = POST;
