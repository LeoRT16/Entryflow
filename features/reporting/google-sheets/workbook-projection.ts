import { createHash } from "node:crypto";
import { formatReservationStatus } from "@/features/reservations/domain/reservation-domain";
import { combineMoney, knownMoney, unknownMoney } from "@/features/reporting/domain/report-money";
import type { EventReport, MoneyValue, ReservationReport } from "@/features/reporting/types";

export const GOOGLE_SHEETS_SCHEMA_VERSION = 2 as const;
export const GOOGLE_SHEETS_TAB_NAMES = ["Resumen", "Reservas", "Invitados"] as const;
export type SheetCellValue = string | number | boolean | null;
export type SheetColumnType = "text" | "integer" | "number" | "mixed" | "boolean" | "date" | "datetime" | "money";
export type SheetColumn = {
  key: string;
  header: string;
  type: SheetColumnType;
  visibility?: "visible" | "hidden";
  widthPx: number;
  numberFormat?: string;
};
export type SheetProjection = {
  title: string;
  columns: readonly SheetColumn[];
  rowIdentity: string;
  ordering: string;
  rows: ReadonlyArray<Record<string, SheetCellValue>>;
  filterRange: string | null;
  frozenRows: number;
  frozenColumns?: number;
  rowNumberFormats?: Readonly<Record<string, string>>;
};
export type WorkbookProjection = {
  schemaVersion: typeof GOOGLE_SHEETS_SCHEMA_VERSION;
  eventId: string;
  generatedAt: string;
  snapshotTimestamp: string | null;
  datasetHashInput: unknown;
  sheets: {
    summary: SheetProjection;
    reservations: SheetProjection;
    attendees: SheetProjection;
  };
};
export type WorkbookProjectionOptions = { snapshotTimestamp?: string | null };

const makeColumns = (items: Array<[string, string, SheetColumnType, number, ("visible" | "hidden")?, string?]>): readonly SheetColumn[] => items.map(([key, header, type, widthPx, visibility = "visible", numberFormat]) => ({ key, header, type, widthPx, visibility, ...(numberFormat ? { numberFormat } : {}) }));
const summaryColumns = makeColumns([
  ["section", "Sección", "text", 145], ["metric", "Indicador", "text", 230], ["value", "Valor", "mixed", 150], ["currency", "Moneda", "text", 115], ["summary_key", "Clave interna", "text", 0, "hidden"],
]);
const reservationColumns = makeColumns([
  ["code", "Código", "text", 125], ["type", "Tipo", "text", 110], ["status", "Estado", "text", 115], ["holder", "Titular", "text", 220], ["zone", "Zona", "text", 150], ["resource_name", "Mesa/Recurso", "text", 165], ["access_quantity", "Accesos incluidos/comprados", "integer", 175, "visible", "0"], ["registered_people", "Personas registradas", "integer", 145, "visible", "0"], ["checked_in", "Ingresados", "integer", 100, "visible", "0"], ["pending", "Pendientes", "integer", 100, "visible", "0"], ["extra_wristbands", "Manillas extra", "integer", 115, "visible", "0"], ["benefits", "Beneficios", "text", 240], ["holder_carnet", "Carnet titular", "text", 135], ["holder_whatsapp", "WhatsApp titular", "text", 145], ["currency", "Moneda", "text", 105], ["price", "Precio", "money", 125, "visible", "#,##0.00"], ["price_unit", "Unidad de precio", "text", 125], ["base_value", "Valor base", "money", 125, "visible", "#,##0.00"], ["extra_value", "Valor extras", "money", 125, "visible", "#,##0.00"], ["total", "Total", "money", 125, "visible", "#,##0.00"],
  ["reservation_id", "ID reserva", "text", 0, "hidden"], ["resource_id", "ID recurso", "text", 0, "hidden"], ["sector_id", "ID zona", "text", 0, "hidden"],
]);
const attendeeColumns = makeColumns([
  ["access_code", "Código de acceso", "text", 155], ["name", "Nombre", "text", 220], ["type", "Tipo", "text", 125], ["reservation_status", "Estado de la invitación", "text", 145], ["admission_status", "Estado ingreso", "text", 125], ["reservation_code", "Reserva", "text", 120], ["holder", "Titular", "text", 210], ["zone", "Zona", "text", 130], ["resource_name", "Mesa/Recurso", "text", 150], ["carnet", "Carnet", "text", 135], ["whatsapp", "WhatsApp", "text", 145], ["check_in_at", "Hora ingreso", "datetime", 155, "visible", "dd/mm/yyyy hh:mm"], ["extra_wristband", "Manilla extra", "text", 120],
  ["guest_id", "ID invitado", "text", 0, "hidden"], ["reservation_id", "ID reserva", "text", 0, "hidden"],
]);

function excelColumnName(index: number) {
  let number = index + 1;
  let result = "";
  while (number > 0) { const remainder = (number - 1) % 26; result = String.fromCharCode(65 + remainder) + result; number = Math.floor((number - 1) / 26); }
  return result;
}
function filterRange(columns: readonly SheetColumn[], rows: number) { return `A1:${excelColumnName(columns.length - 1)}${rows + 1}`; }
function moneyAmount(value: MoneyValue): SheetCellValue {
  if (value.currencies.length > 1) return "Monedas mixtas";
  return value.complete && value.amount !== null ? value.amount : "Sin dato";
}
function moneyCurrency(value: MoneyValue) {
  if (value.currencies.length > 1) return "Monedas mixtas";
  return value.currency ?? (value.complete ? "—" : "Sin dato");
}
function eventStatusLabel(status: EventReport["metadata"]["eventStatus"]) {
  const labels = { draft: "Borrador", published: "Publicado", live: "En curso", finished: "Finalizado", cancelled: "Cancelado" } as const;
  return labels[status];
}
function reservationTypeLabel(type: ReservationReport["type"]) {
  const labels = { Mesa: "Mesa", Preventa: "Preventa", "Cortesía": "Cortesía", Cumpleaños: "Cumpleaños", VIP: "VIP", Corporativo: "Corporativo" } as const;
  return labels[type];
}
function accessTypeLabel(type: EventReport["attendees"][number]["accessType"]) {
  const labels = { mesa: "Mesa", presale: "Preventa", courtesy: "Cortesía", extra_wristband: "Manilla extra", other: "Otro" } as const;
  return labels[type];
}
function admissionStatusLabel(status: EventReport["attendees"][number]["admissionStatus"]) {
  const labels = { Pendiente: "Pendiente", Ingresó: "Ingresó", Anulada: "Anulada", Bloqueada: "Bloqueada" } as const;
  return labels[status];
}
function textOrUnknown(value: string | null | undefined) { return value?.trim() || "Sin dato"; }
function formatBenefits(reservation: ReservationReport) {
  if (reservation.benefits === null) return "Sin dato";
  const values = reservation.benefits
    .filter((benefit) => benefit.quantity > 0)
    .slice()
    .sort((left, right) => left.label.localeCompare(right.label, "es", { sensitivity: "base" }) || left.id.localeCompare(right.id));
  return values.length ? values.map((benefit) => `${benefit.label} ×${benefit.quantity}`).join(" · ") : "—";
}
function priceUnitLabel(reservation: ReservationReport) {
  if (reservation.pricingUnit === "per_reservation") return "Por reserva";
  if (reservation.pricingUnit === "per_access") return "Por acceso";
  if (reservation.pricingUnit === "courtesy") return "Cortesía";
  return "Sin dato";
}
function historicalBaseValue(reservation: ReservationReport): MoneyValue {
  if (reservation.type === "Cortesía") return knownMoney(0, null);
  const snapshot = reservation.commercialSnapshot;
  const amount = reservation.type === "Preventa"
    ? snapshot?.saleType === "presale" ? snapshot.totalPrice : null
    : snapshot?.reservationPrice ?? null;
  return typeof amount === "number" ? knownMoney(amount, snapshot?.currency ?? null) : unknownMoney(snapshot?.currency ?? null);
}
function accessQuantity(reservation: ReservationReport): SheetCellValue {
  if (reservation.type === "Mesa") return reservation.includedAccesses ?? "Sin dato";
  if (reservation.type === "Preventa") return reservation.purchasedQuantity ?? "Sin dato";
  return reservation.type === "Cortesía" ? "—" : "Sin dato";
}
function localDateTime(value: string, timeZone: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "Sin dato";
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).map((part) => [part.type, part.value]));
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
  } catch { return "Sin dato"; }
}
function nullableLocalDateTime(value: string | undefined, timeZone: string, checkedIn: boolean): string {
  if (!value) return checkedIn ? "Sin dato" : "—";
  return localDateTime(value, timeZone);
}
function stableCompare(left: string | null | undefined, right: string | null | undefined) {
  const leftValue = left?.trim() ?? "";
  const rightValue = right?.trim() ?? "";
  if (!leftValue && rightValue) return 1;
  if (leftValue && !rightValue) return -1;
  return leftValue.localeCompare(rightValue, "es", { sensitivity: "base", numeric: true });
}
function historicalMoneyRows(report: EventReport) {
  return [
    ["COMERCIAL HISTÓRICO", "Mesas", report.commercial.sold.mesas.value, "tables"],
    ["COMERCIAL HISTÓRICO", "Preventa", report.commercial.sold.presales.value, "presales"],
    ["COMERCIAL HISTÓRICO", "Manillas extra", report.commercial.sold.extraWristbands.value, "extras"],
    ["COMERCIAL HISTÓRICO", "Total", report.commercial.sold.total, "total"],
  ] as const;
}

export function buildWorkbookDatasetHashInput(projection: WorkbookProjection) {
  return Object.fromEntries(Object.entries(projection.sheets).map(([name, sheet]) => [name, {
    columns: sheet.columns,
    rowIdentity: sheet.rowIdentity,
    rowNumberFormats: sheet.rowNumberFormats ?? {},
    frozenRows: sheet.frozenRows,
    frozenColumns: sheet.frozenColumns ?? 0,
    rows: sheet.rows.filter((row) => row.summary_key !== "last_sync"),
  }]));
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function hashWorkbookDataset(input: unknown) { return createHash("sha256").update(canonicalize(input)).digest("hex"); }

export function buildGoogleSheetsProjection(report: EventReport, options: WorkbookProjectionOptions = {}): WorkbookProjection {
  const resourceByReservationId = new Map(report.resources.flatMap((resource) => resource.reservationIds.map((id) => [id, resource] as const)));
  const reservations = report.reservations.map((item) => {
    const resource = resourceByReservationId.get(item.id) ?? (item.resourceId ? report.resources.find((candidate) => candidate.resourceId === item.resourceId) : undefined);
    const baseValue = historicalBaseValue(item);
    const total = combineMoney([baseValue, item.extraWristbandValue]);
    const cellCurrency = total.currencies.length > 1 ? "Monedas mixtas" : item.commercialSnapshot?.currency ?? item.soldValue.currency ?? item.extraWristbandValue.currency ?? (total.complete ? "—" : "Sin dato");
    return {
      reservation_id: item.id,
      code: item.code,
      type: reservationTypeLabel(item.type),
      status: formatReservationStatus(item.status),
      holder: item.holder,
      holder_carnet: textOrUnknown(item.holderCarnet),
      holder_whatsapp: textOrUnknown(item.holderWhatsapp),
      zone: textOrUnknown(resource?.sectorName ?? (item.sectorId ? null : undefined)),
      resource_name: textOrUnknown(resource?.resourceName),
      access_quantity: accessQuantity(item),
      registered_people: item.operationalPeople,
      checked_in: item.checkedInPeople,
      pending: item.pendingPeople,
      extra_wristbands: item.extraWristbandQuantity,
      benefits: formatBenefits(item),
      currency: cellCurrency,
      price: moneyAmount(item.price),
      price_unit: priceUnitLabel(item),
      base_value: moneyAmount(baseValue),
      extra_value: moneyAmount(item.extraWristbandValue),
      total: moneyAmount(total),
      resource_id: item.resourceId,
      sector_id: item.sectorId,
    } satisfies Record<string, SheetCellValue>;
  }).sort((left, right) => stableCompare(left.zone === "Sin dato" ? null : left.zone, right.zone === "Sin dato" ? null : right.zone)
    || stableCompare(left.resource_name === "Sin dato" ? null : left.resource_name, right.resource_name === "Sin dato" ? null : right.resource_name)
    || stableCompare(left.type, right.type)
    || stableCompare(left.code, right.code)
    || left.code.localeCompare(right.code, "es", { sensitivity: "base", numeric: true })
    || left.reservation_id.localeCompare(right.reservation_id));

  const attendees = report.attendees.map((item) => {
    const resource = resourceByReservationId.get(item.reservationId);
    return {
      guest_id: item.guestId,
      access_code: item.accessCode,
      name: item.name,
      carnet: item.carnet,
      whatsapp: item.whatsapp,
      type: accessTypeLabel(item.accessType),
      reservation_code: item.reservationCode,
      reservation_id: item.reservationId,
      holder: textOrUnknown(item.reservationHolder),
      zone: textOrUnknown(item.zoneName ?? resource?.sectorName),
      resource_name: textOrUnknown(item.resourceName ?? resource?.resourceName),
      reservation_status: formatReservationStatus(item.reservationStatus),
      admission_status: admissionStatusLabel(item.admissionStatus),
      check_in_at: nullableLocalDateTime(item.checkInAt, report.metadata.timezone, item.checkedIn),
      extra_wristband: item.extraWristband ? "Sí" : "No",
    } satisfies Record<string, SheetCellValue>;
  }).sort((left, right) => stableCompare(left.name, right.name)
    || stableCompare(left.carnet, right.carnet)
    || left.access_code.localeCompare(right.access_code, "es", { sensitivity: "base", numeric: true })
    || String(left.guest_id).localeCompare(String(right.guest_id)));

  const summaryRows: Array<Record<string, SheetCellValue>> = [];
  let lastSummarySection = "";
  const addSummary = (section: string, metric: string, value: SheetCellValue, key: string, currency = "") => {
    if (section !== lastSummarySection) summaryRows.push({ section, metric: null, value: null, currency: "", summary_key: `section_${section.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` });
    lastSummarySection = section;
    summaryRows.push({ section: "", metric, value, currency, summary_key: key });
  };
  addSummary("EVENTO", "Evento", report.metadata.eventName, "event");
  addSummary("EVENTO", "Fecha y hora local", localDateTime(report.metadata.eventStartAt, report.metadata.timezone), "event_local_datetime");
  addSummary("EVENTO", "Lugar", report.metadata.venueName, "venue");
  addSummary("EVENTO", "Estado", eventStatusLabel(report.metadata.eventStatus), "event_status");
  addSummary("EVENTO", "Última sincronización", options.snapshotTimestamp ? localDateTime(options.snapshotTimestamp, report.metadata.timezone) : "Sin sincronización", "last_sync");
  addSummary("PERSONAS", "Registradas", report.summary.operationalPeople, "people_registered");
  addSummary("PERSONAS", "Ingresadas", report.summary.checkedInPeople, "people_checked_in");
  addSummary("PERSONAS", "Pendientes", report.summary.pendingPeople, "people_pending");
  addSummary("RESERVAS", "Operativas", report.summary.activeReservations, "reservations_operational");
  addSummary("RESERVAS", "Completadas", report.historical.completedReservationIds.length, "reservations_completed");
  addSummary("RESERVAS", "No asistieron", report.historical.noShowReservationIds.length, "reservations_no_show");
  addSummary("RESERVAS", "Canceladas", report.historical.cancelledReservationIds.length, "reservations_cancelled");
  addSummary("PREVENTA", "Compras", report.summary.presalePurchases, "presale_purchases");
  addSummary("PREVENTA", "Accesos vendidos", report.summary.presaleAccessesSold ?? "Sin dato", "presale_accesses_sold");
  addSummary("PREVENTA", "Personas cargadas", report.summary.presalePeopleLoaded, "presale_people_loaded");
  addSummary("PREVENTA", "Pendientes de cargar", report.summary.presalePendingToLoad ?? "Sin dato", "presale_people_pending");
  const courtesyAttendees = report.attendees.filter((item) => item.accessType === "courtesy" && item.operational);
  addSummary("CORTESÍAS", "Personas operativas", courtesyAttendees.length, "courtesy_people");
  addSummary("CORTESÍAS", "Ingresadas", courtesyAttendees.filter((item) => item.checkedIn).length, "courtesy_checked_in");
  addSummary("CORTESÍAS", "Pendientes", courtesyAttendees.filter((item) => !item.checkedIn).length, "courtesy_pending");
  addSummary("CORTESÍAS", "Valor comercial", 0, "courtesy_commercial_value", "—");
  const hasResources = report.resources.length > 0;
  const physicalCapacity = hasResources ? report.resources.reduce((sum, resource) => sum + resource.physicalCapacity, 0) : null;
  const assignedCapacity = hasResources ? report.resources.reduce((sum, resource) => sum + resource.capacityAssigned, 0) : null;
  addSummary("CAPACIDAD", "Capacidad física", physicalCapacity ?? "Sin dato", "physical_capacity", hasResources ? "personas" : "");
  addSummary("CAPACIDAD", "Asignada", assignedCapacity ?? "Sin dato", "assigned_capacity", hasResources ? "personas" : "");
  addSummary("CAPACIDAD", "Disponible", physicalCapacity === null || assignedCapacity === null ? "Sin dato" : Math.max(physicalCapacity - assignedCapacity, 0), "available_capacity", hasResources ? "personas" : "");
  addSummary("CAPACIDAD", "Utilización", physicalCapacity && assignedCapacity !== null ? assignedCapacity / physicalCapacity : "Sin dato", "capacity_utilization", hasResources ? "%" : "");
  for (const [section, metric, value, key] of historicalMoneyRows(report)) addSummary(section, metric, moneyAmount(value), key, moneyCurrency(value));

  const summaryNumberFormats = Object.fromEntries(summaryRows.flatMap((row) => {
    if (typeof row.value !== "number") return [];
    const key = String(row.summary_key);
    return [[key, ["tables", "presales", "extras", "total"].includes(key) ? "#,##0.00" : key === "capacity_utilization" ? "0%" : "0"]];
  }));
  const summary: SheetProjection = { title: "Resumen", columns: summaryColumns, rowIdentity: "summary_key", ordering: "fixed EntryFlow summary block order", rows: summaryRows, filterRange: null, frozenRows: 1, frozenColumns: 2, rowNumberFormats: { ...summaryNumberFormats, capacity_utilization: "0%" } };
  const reservationSheet: SheetProjection = { title: "Reservas", columns: reservationColumns, rowIdentity: "reservation_id", ordering: "zone, resource, type, code, reservation_id tie-breaker; nulls last", rows: reservations, filterRange: filterRange(reservationColumns, reservations.length), frozenRows: 1, frozenColumns: 3 };
  const attendeeSheet: SheetProjection = { title: "Invitados", columns: attendeeColumns, rowIdentity: "guest_id", ordering: "name, carnet, access_code, guest_id tie-breaker; case-insensitive Spanish collation", rows: attendees, filterRange: filterRange(attendeeColumns, attendees.length), frozenRows: 1, frozenColumns: 2 };
  const projection = {
    schemaVersion: GOOGLE_SHEETS_SCHEMA_VERSION,
    eventId: report.metadata.eventId,
    generatedAt: report.metadata.generatedAt,
    snapshotTimestamp: options.snapshotTimestamp ?? null,
    datasetHashInput: null,
    sheets: { summary, reservations: reservationSheet, attendees: attendeeSheet },
  } as WorkbookProjection;
  projection.datasetHashInput = buildWorkbookDatasetHashInput(projection);
  return projection;
}
