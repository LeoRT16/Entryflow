/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderFinalEventReportPdf } from "./pdf";
import { createAuthenticatedGoogleDriveTransport } from "../google-drive/client/google-drive-client";
import { readDriveRefreshTokenSecret } from "../google-drive/oauth/token-store";
import type { EventReport } from "../types";

type Db = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: any; error: any }>; from(table: string): any };
export async function processFinalReportBatch(db: Db, workerId: string, loadReport: (eventId: string, organizationId: string, snapshot: unknown) => Promise<EventReport>, limit = 1) {
  const claimed = await db.rpc("claim_reporting_final_report_jobs", { p_worker_id: workerId, p_limit: limit });
  if (claimed.error) throw claimed.error;
  let synced = 0;
  for (const job of (claimed.data ?? []) as Array<{ job_id: string; snapshot_id: string; event_id: string; organization_id: string; claim_token: string }>) {
    try {
      const snapshot = await db.from("reporting_final_snapshots").select("report").eq("id", job.snapshot_id).single();
      const location = await db.from("event_drive_locations").select("final_reports_folder_id").eq("event_id", job.event_id).is("deleted_at", null).single();
      const integration = await db.from("reporting_drive_integrations").select("oauth_secret_id").eq("organization_id", job.organization_id).is("deleted_at", null).single();
      if (snapshot.error || location.error || integration.error || !location.data?.final_reports_folder_id) throw new Error("drive_reports_folder_required");
      const report = await loadReport(job.event_id, job.organization_id, snapshot.data?.report);
      const transport = createAuthenticatedGoogleDriveTransport(await readDriveRefreshTokenSecret(integration.data.oauth_secret_id));
      if (!transport.uploadFile) throw new Error("drive_upload_unavailable");
      const file = await transport.uploadFile(`${report.metadata.eventName} — informe final.pdf`, location.data.final_reports_folder_id, renderFinalEventReportPdf(report), "application/pdf");
      const result = await db.rpc("complete_reporting_final_report_job", { p_job_id: job.job_id, p_claim_token: job.claim_token, p_report: report, p_drive_file_id: file.id, p_drive_file_url: file.webViewLink ?? null });
      if (result.error) throw result.error;
      synced += 1;
    } catch (error) {
      await db.rpc("fail_reporting_final_report_job", { p_job_id: job.job_id, p_claim_token: job.claim_token, p_error_code: error instanceof Error ? error.message : "final_report_failed" });
    }
  }
  return { claimed: (claimed.data ?? []).length, synced };
}
