export class ReportingInvalidationError extends Error {
  readonly code = "reporting_invalidation_failed" as const;

  constructor(
    readonly eventId: string,
    readonly cause: unknown,
  ) {
    super("Reporting update could not be requested.");
    this.name = "ReportingInvalidationError";
  }
}
