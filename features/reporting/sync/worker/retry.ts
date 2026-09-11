const RETRY_SECONDS = [5, 30, 120, 600, 1800, 7200, 7200, 7200];
export function computeReportingRetryAt(attempt: number, now = new Date()): string { const seconds = RETRY_SECONDS[Math.max(0, Math.min(attempt - 1, RETRY_SECONDS.length - 1))]; return new Date(now.getTime() + seconds * 1000).toISOString(); }
