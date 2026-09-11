import type { EventReport } from "@/features/reporting/types";
import { buildGoogleSheetsProjection, buildWorkbookDatasetHashInput, hashWorkbookDataset } from "@/features/reporting/google-sheets/workbook-projection";
import { GoogleSheetsClientError, writeWorkbookProjection, type GoogleSheetsTransport } from "@/features/reporting/google-sheets/client";
import { computeReportingRetryAt } from "./retry";
import type { ClaimedReportingWork, LastSuccessfulSync } from "./repository";
import { canSkipReportingWrite } from "../skip";

export type ReportingWorkerRepository = { claim(workerId: string, limit: number): Promise<ClaimedReportingWork[]>; completeSuccess(work: ClaimedReportingWork, hash: string): Promise<void>; completeFailure(work: ClaimedReportingWork, code: string, message: string, recoverable: boolean, nextAvailableAt: string): Promise<void>; lastSuccessfulHash(destinationId: string): Promise<LastSuccessfulSync> };
export type ReportingWorkerDependencies = { repository: ReportingWorkerRepository; transport: GoogleSheetsTransport; loadReport: (eventId: string) => Promise<EventReport>; now?: () => Date; logger?: (entry: Record<string, string | number>) => void };
export type ReportingBatchResult = { claimed: number; synced: number; skipped: number; failed: number };

function classify(error: unknown) { if (error instanceof GoogleSheetsClientError) { const recoverable = error.code === "google_rate_limited" || error.code === "google_write_failed"; return { code: error.code, message: error.message, recoverable }; } return { code: "worker_failed", message: "Reporting worker failed safely.", recoverable: true }; }
export async function processReportingSyncBatch(deps: ReportingWorkerDependencies, workerId: string, limit = 1): Promise<ReportingBatchResult> {
  const now = deps.now ?? (() => new Date()); const logger = deps.logger ?? (() => undefined); const works = await deps.repository.claim(workerId, limit); const result: ReportingBatchResult = { claimed: works.length, synced: 0, skipped: 0, failed: 0 };
  for (const work of works) {
    const started = now().getTime();
    try {
      if (!work.spreadsheetId) throw new GoogleSheetsClientError("google_schema_mismatch", "Reporting destination has no spreadsheet configured.");
      if (work.provider !== "google_sheets") throw new GoogleSheetsClientError("google_schema_mismatch", "Reporting destination provider is unsupported.");
      if (work.sheetSchemaVersion !== 1) throw new GoogleSheetsClientError("google_schema_mismatch", "Reporting workbook schema is unsupported.");
      const report = await deps.loadReport(work.eventId); const projection = buildGoogleSheetsProjection(report); const hash = hashWorkbookDataset(buildWorkbookDatasetHashInput(projection));
      if (canSkipReportingWrite({ datasetHash: hash, spreadsheetId: work.spreadsheetId, sheetSchemaVersion: work.sheetSchemaVersion, lastSuccessfulSync: await deps.repository.lastSuccessfulHash(work.destinationId) })) { await deps.repository.completeSuccess(work, hash); result.skipped += 1; logger({ workerId, outboxId: work.outboxId, destinationId: work.destinationId, eventId: work.eventId, sequence: work.requestedSequence, datasetHash: hash, status: "skipped", durationMs: now().getTime() - started }); continue; }
      await writeWorkbookProjection(deps.transport, work.spreadsheetId, projection, hash); await deps.repository.completeSuccess(work, hash); result.synced += 1; logger({ workerId, outboxId: work.outboxId, destinationId: work.destinationId, eventId: work.eventId, sequence: work.requestedSequence, datasetHash: hash, status: "synced", durationMs: now().getTime() - started });
    } catch (error) { const classified = classify(error); await deps.repository.completeFailure(work, classified.code, classified.message, classified.recoverable, computeReportingRetryAt(work.attempts, now())); result.failed += 1; logger({ workerId, outboxId: work.outboxId, destinationId: work.destinationId, eventId: work.eventId, sequence: work.requestedSequence, status: classified.code, durationMs: now().getTime() - started }); }
  }
  return result;
}
