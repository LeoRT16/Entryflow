import type { ReportDiagnostic } from "@/features/reporting/types";

export function createReportDiagnostic(diagnostic: ReportDiagnostic): ReportDiagnostic {
  return diagnostic;
}

export function sortReportDiagnostics(diagnostics: ReportDiagnostic[]) {
  const uniqueDiagnostics = Array.from(new Map(
    diagnostics.map((diagnostic) => [
      `${diagnostic.code}|${diagnostic.entityType}|${diagnostic.entityId}|${diagnostic.message}`,
      diagnostic,
    ]),
  ).values());

  return uniqueDiagnostics.sort((left, right) => {
    const entityOrder = left.entityId.localeCompare(right.entityId);
    return entityOrder || left.code.localeCompare(right.code);
  });
}
