export type ReportingDestination = {
  id: string;
  organizationId: string;
  eventId: string;
  provider: "google_sheets";
  enabled: boolean;
  spreadsheetId?: string;
  driveFolderId?: string;
  sheetSchemaVersion: number;
  lastRequestedSequence: number;
  lastProcessedSequence: number;
  lastSyncAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
};

export type ReportingOutboxStatus = "pending" | "processing" | "retry" | "synced" | "failed" | "dead";

export type ReportingSyncRunStatus = Exclude<ReportingOutboxStatus, "pending" | "processing"> | "processing";

export type ReportingOutbox = {
  id: string;
  destinationId: string;
  organizationId: string;
  eventId: string;
  requestedSequence: number;
  status: ReportingOutboxStatus;
  attempts: number;
  availableAt: string;
  lockedAt?: string;
  lockedBy?: string;
  processedAt?: string;
  lastError?: string;
};

export type ReportingSyncRun = {
  id: string;
  destinationId: string;
  organizationId: string;
  eventId: string;
  requestedSequence: number;
  processedSequence?: number;
  datasetHash?: string;
  sheetSchemaVersion: number;
  status: ReportingSyncRunStatus;
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type ReportingSyncRequest = {
  outboxId: string;
  destinationId: string;
  requestedSequence: number;
};
