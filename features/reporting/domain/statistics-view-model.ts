import type { WorkspaceIntelligence } from "@/domain/workspace-intelligence";
import type { EventReport, MoneyValue, ReportDiagnosticCode } from "@/features/reporting/types";

type StatisticsMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info";
};

function hasDiagnostic(report: EventReport, code: ReportDiagnosticCode) {
  return report.diagnostics.some((diagnostic) => diagnostic.code === code);
}

export function buildStatisticsViewModel(
  report: EventReport,
  intelligence: Pick<WorkspaceIntelligence, "statistics">,
) {
  const activeResources = report.resources.filter((resource) => resource.activeInventory);
  const physicalCapacity = activeResources.reduce((total, resource) => total + resource.physicalCapacity, 0);
  const capacityAssigned = activeResources.reduce((total, resource) => total + resource.capacityAssigned, 0);
  const capacityRemaining = Math.max(physicalCapacity - capacityAssigned, 0);
  const occupancyPercent = physicalCapacity > 0 ? Math.round((capacityAssigned / physicalCapacity) * 100) : 0;
  const operational = intelligence.statistics.cards;

  const metrics: StatisticsMetric[] = [
    { label: "Reservas activas", value: `${report.summary.activeReservations}`, detail: "Reservas dentro del flujo operativo.", tone: "info" },
    { label: "Reservas canceladas", value: `${report.summary.cancelledReservations}`, detail: "Reservas fuera del flujo activo.", tone: "danger" },
    { label: "Personas operativas", value: `${report.summary.operationalPeople}`, detail: "Personas esperadas en la operación actual.", tone: "info" },
    { label: "Invitados ingresados", value: `${report.summary.checkedInPeople}`, detail: "Accesos confirmados.", tone: "success" },
    { label: "Invitados pendientes", value: `${report.summary.pendingPeople}`, detail: "Personas operativas por ingresar.", tone: "warning" },
    { label: "Cortesías", value: `${report.summary.activeCourtesyPeople}`, detail: "Personas con cortesía activa.", tone: "info" },
    { label: "Preventas", value: `${report.summary.presaleAccessesSold}`, detail: "Accesos vendidos mediante Preventa.", tone: "info" },
    { label: "Manillas extra", value: `${report.summary.activeExtraWristbands}`, detail: "Manillas extra activas.", tone: "info" },
    { label: "Asignación de mesas", value: `${capacityAssigned}`, detail: `${occupancyPercent}% de asignación sobre capacidad física.`, tone: "info" },
    { label: "Capacidad restante", value: `${capacityRemaining}`, detail: "Espacios físicos todavía disponibles.", tone: "success" },
    { label: "No Shows", value: `${report.historical.noShowReservationIds.length}`, detail: "Reservas históricas marcadas como no show.", tone: "warning" },
    { label: "Check-ins por minuto", value: `${operational.checkInsPerMinute}`, detail: "Promedio derivado del flujo operativo.", tone: "info" },
    { label: "Intervalo promedio", value: `${operational.averageCheckInIntervalMinutes} min`, detail: "Tiempo medio entre ingresos.", tone: "info" },
  ];

  return {
    summary: report.summary,
    commercial: report.commercial.sold,
    capacity: { physicalCapacity, capacityAssigned, capacityRemaining, occupancyPercent },
    resources: activeResources.map((resource) => ({
      ...resource,
      capacityRemaining: Math.max(resource.physicalCapacity - resource.capacityAssigned, 0),
    })),
    zones: report.zones,
    metrics,
    diagnostics: {
      commercialIncomplete: !report.commercial.sold.total.complete,
      mixedCurrencies: hasDiagnostic(report, "commercial_currency_mixed"),
      unresolvedHistoricalResource: hasDiagnostic(report, "historical_resource_unresolved"),
      hasRelevantDiagnostics:
        !report.commercial.sold.total.complete
        || hasDiagnostic(report, "commercial_currency_mixed")
        || hasDiagnostic(report, "historical_resource_unresolved"),
    },
  };
}

export function displayMoney(value: MoneyValue) {
  if (!value.complete || value.amount === null) return "Datos incompletos";
  const amount = value.amount.toLocaleString("es-BO");
  return value.currency ? `${value.currency} ${amount}` : amount;
}
