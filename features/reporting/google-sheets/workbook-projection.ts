import { createHash } from "node:crypto";
import type { EventReport, MoneyValue, ReportDiagnostic } from "@/features/reporting/types";

export const GOOGLE_SHEETS_SCHEMA_VERSION = 1 as const;
export const GOOGLE_SHEETS_TAB_NAMES = ["Resumen", "Reservas", "Preventa", "Invitados", "Cortesías", "Reportes finales"] as const;
export type SheetCellValue = string | number | boolean | null;
export type SheetColumnType = "text" | "integer" | "number" | "boolean" | "date" | "datetime" | "money";
export type SheetColumn = { key: string; header: string; type: SheetColumnType };
export type SheetProjection = {
  title: string;
  columns: readonly SheetColumn[];
  rowIdentity: string;
  ordering: string;
  rows: ReadonlyArray<Record<string, SheetCellValue>>;
};
export type WorkbookProjection = {
  schemaVersion: typeof GOOGLE_SHEETS_SCHEMA_VERSION;
  eventId: string;
  generatedAt: string;
  datasetHashInput: unknown;
  sheets: {
    summary: SheetProjection;
    reservations: SheetProjection;
    presales: SheetProjection;
    attendees: SheetProjection;
    courtesies: SheetProjection;
    finalReports: SheetProjection;
  };
};

const summaryKeys = ["organization", "event", "date", "venue", "status", "last_sync_at", "report_version", "sheet_schema_version", "dataset_hash", "active_reservations", "cancelled_reservations", "operational_people", "checked_in", "pending", "courtesies", "presales", "presale_accesses_sold", "active_extra_wristbands", "physical_capacity", "assigned_capacity", "remaining_capacity", "currency", "tables_value", "presale_value", "extras_value", "total_commercial", "integrity_status", "diagnostics_count"] as const;
const columns = (keys: readonly string[], headers: readonly string[], types: readonly SheetColumnType[]) => keys.map((key, index) => ({ key, header: headers[index], type: types[index] })) as readonly SheetColumn[];
const summaryColumns = columns(["key", "value", "type"], ["Clave", "Valor", "Tipo"], ["text", "text", "text"]);
const reservationColumns = columns(["reservation_id","code","type","status","operational","holder","holder_carnet","holder_whatsapp","venue","zone","resource_name","resource_id","physical_capacity","base_accesses","extra_wristbands","operational_people","checked_in","pending","currency","sold_value","extra_value","sold_total","created_at","updated_at"], ["ID reserva","Código","Tipo","Estado","Operativa","Titular","Carnet titular","WhatsApp titular","Venue","Zona","Recurso/Mesa","ID recurso","Capacidad física","Accesos base","Manillas extra","Personas operativas","Ingresados","Pendientes","Moneda","Valor vendido","Valor extras","Total vendido","Creada","Actualizada"], ["text","text","text","text","boolean","text","text","text","text","text","text","text","integer","integer","integer","integer","integer","integer","text","money","money","money","datetime","datetime"]);
const presaleColumns = columns(["reservation_id","code","holder","status","quantity_purchased","loaded_people","remaining_to_load","checked_in","pending","currency","unit_price","sold_total","date"], ["ID reserva","Código","Titular","Estado","Cantidad comprada","Personas cargadas","Pendiente por cargar","Ingresados","Pendientes","Moneda","Precio unitario","Total vendido","Fecha"], ["text","text","text","text","integer","integer","integer","integer","integer","text","money","money","date"]);
const attendeeColumns = columns(["guest_id","name","carnet","whatsapp","access_code","access_type","reservation_id","reservation_code","reservation_type","resource_name","resource_id","zone","operational","admission_status","reservation_status","qr_status","checked_in","check_in_at","method","gate","extra_wristband","extra_sale_id"], ["ID invitado","Nombre","Carnet","WhatsApp","Código de acceso","Tipo de acceso","ID reserva","Código reserva","Tipo de reserva","Recurso/Mesa","ID recurso","Zona","Operativo","Estado admisión","Estado reserva","Estado QR","Ingresó","Hora ingreso","Método","Puerta","Manilla extra","ID venta extra"], ["text","text","text","text","text","text","text","text","text","text","text","text","boolean","text","text","text","boolean","datetime","text","text","boolean","text"]);
const courtesyColumns = columns(["reservation_id","reference","guest_id","name","carnet","whatsapp","access_code","operational","checked_in","status","check_in_at","cancelled_historical","reason","commercial_value"], ["ID reserva","Referencia/Grupo","ID invitado","Nombre","Carnet","WhatsApp","Código de acceso","Operativo","Ingresó","Estado","Hora ingreso","Anulada histórica","Motivo","Valor comercial"], ["text","text","text","text","text","text","text","boolean","boolean","text","datetime","boolean","text","money"]);
const finalReportColumns = columns(["report_run_id","event_id","version","cutoff_at","generated_at","generated_by","operational_people","checked_in","pending","sold_total","currency","integrity_status","dataset_hash","pdf_url","sheet_version","notes","status"], ["ID ejecución","ID evento","Versión","Corte","Generado","Generado por","Personas operativas","Ingresados","Pendientes","Total vendido","Moneda","Integridad","Hash dataset","URL PDF","Versión hoja","Notas","Estado"], ["text","text","integer","datetime","datetime","text","integer","integer","integer","money","text","text","text","text","integer","text","text"]);

function amount(value: MoneyValue) { return value.complete ? value.amount : null; }
function currency(value: MoneyValue) { return value.currency; }
function integrity(diagnostics: ReportDiagnostic[]) { return diagnostics.some((item) => item.severity === "error") ? "error" : diagnostics.some((item) => item.severity === "warning") ? "warning" : "ok"; }
function reportDate(report: EventReport) { return report.metadata.eventStartAt.slice(0, 10); }
function resourceFor(report: EventReport, id: string | null) { return id ? report.resources.find((resource) => resource.resourceId === id) : undefined; }
function stableRows(rows: Array<Record<string, SheetCellValue>>, key: string) { return rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); }

export function buildWorkbookDatasetHashInput(projection: WorkbookProjection) {
  return Object.fromEntries(Object.entries(projection.sheets).map(([name, sheet]) => [name, { columns: sheet.columns, rowIdentity: sheet.rowIdentity, rows: sheet.rows }]));
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function hashWorkbookDataset(input: unknown) { return createHash("sha256").update(canonicalize(input)).digest("hex"); }

export function buildGoogleSheetsProjection(report: EventReport): WorkbookProjection {
  const diagnostics = report.diagnostics;
  const integrityStatus = integrity(diagnostics);
  const resourceMap = new Map(report.resources.flatMap((resource) => resource.reservationIds.map((id) => [id, resource] as const)));
  const summaryValues: Record<string, SheetCellValue> = {
    organization: report.metadata.organizationName, event: report.metadata.eventName, date: reportDate(report), venue: report.metadata.venueName, status: report.metadata.eventStatus, last_sync_at: null, report_version: report.version, sheet_schema_version: GOOGLE_SHEETS_SCHEMA_VERSION, dataset_hash: null,
    active_reservations: report.summary.activeReservations, cancelled_reservations: report.summary.cancelledReservations, operational_people: report.summary.operationalPeople, checked_in: report.summary.checkedInPeople, pending: report.summary.pendingPeople, courtesies: report.summary.activeCourtesyPeople, presales: report.summary.presalePurchases, presale_accesses_sold: report.summary.presaleAccessesSold, active_extra_wristbands: report.summary.activeExtraWristbands,
    physical_capacity: report.resources.reduce((sum, resource) => sum + resource.physicalCapacity, 0), assigned_capacity: report.resources.reduce((sum, resource) => sum + resource.capacityAssigned, 0), remaining_capacity: report.resources.reduce((sum, resource) => sum + Math.max(resource.physicalCapacity - resource.capacityAssigned, 0), 0), currency: report.commercial.sold.total.currency, tables_value: amount(report.commercial.sold.mesas.value), presale_value: amount(report.commercial.sold.presales.value), extras_value: amount(report.commercial.sold.extraWristbands.value), total_commercial: amount(report.commercial.sold.total), integrity_status: integrityStatus, diagnostics_count: diagnostics.length,
  };
  const summaryRows = summaryKeys.map((key) => ({ key, value: summaryValues[key], type: typeof summaryValues[key] === "number" ? "number" : summaryValues[key] === null ? "null" : "text" }));
  const reservations = stableRows(report.reservations.map((item) => { const resource = resourceMap.get(item.id) ?? resourceFor(report, item.resourceId); return { reservation_id: item.id, code: item.code, type: item.type, status: item.status, operational: item.operational, holder: item.holder, holder_carnet: null, holder_whatsapp: null, venue: resource?.venueName ?? report.metadata.venueName, zone: resource?.sectorName ?? null, resource_name: resource?.resourceName ?? null, resource_id: item.resourceId, physical_capacity: resource?.physicalCapacity ?? null, base_accesses: resource?.baseAccesses ?? null, extra_wristbands: resource?.extraWristbands ?? null, operational_people: item.operationalPeople, checked_in: item.checkedInPeople, pending: item.pendingPeople, currency: currency(item.soldValue), sold_value: amount(item.soldValue), extra_value: amount(item.extraWristbandValue), sold_total: amount(item.soldTotal), created_at: null, updated_at: null }; }), "reservation_id");
  const presales = stableRows(report.presales.map((item) => ({ reservation_id: item.reservationId, code: item.reservationCode, holder: item.holder, status: item.status, quantity_purchased: item.quantityPurchased, loaded_people: item.loadedPeople, remaining_to_load: item.remainingToLoad, checked_in: item.checkedInPeople, pending: item.pendingPeople, currency: item.soldTotal.currency, unit_price: amount(item.unitPrice), sold_total: amount(item.soldTotal), date: reportDate(report) })), "reservation_id");
  const attendeesById = new Map(report.attendees.map((item) => [item.guestId, item]));
  const attendees = stableRows(report.attendees.map((item) => { const resource = resourceMap.get(item.reservationId); return { guest_id: item.guestId, name: item.name, carnet: item.carnet, whatsapp: item.whatsapp, access_code: item.accessCode, access_type: item.accessType, reservation_id: item.reservationId, reservation_code: item.reservationCode, reservation_type: null, resource_name: resource?.resourceName ?? null, resource_id: resource?.resourceId ?? null, zone: resource?.sectorName ?? null, operational: item.operational, admission_status: item.admissionStatus, reservation_status: item.reservationStatus, qr_status: item.qrStatus, checked_in: item.checkedIn, check_in_at: item.checkInAt ?? null, method: null, gate: null, extra_wristband: item.extraWristband, extra_sale_id: item.extraWristbandSaleId ?? null }; }), "guest_id");
  const courtesies = stableRows(report.courtesies.flatMap((item) => [...new Set([...item.attendeeIds, ...item.cancelledAttendeeIds])].map((guestId) => { const attendee = attendeesById.get(guestId); return { reservation_id: item.reservationId, reference: item.reference, guest_id: guestId, name: attendee?.name ?? null, carnet: attendee?.carnet ?? null, whatsapp: attendee?.whatsapp ?? null, access_code: attendee?.accessCode ?? null, operational: attendee?.operational ?? item.operational, checked_in: attendee?.checkedIn ?? false, status: attendee?.reservationStatus ?? item.status, check_in_at: attendee?.checkInAt ?? null, cancelled_historical: item.cancelledAttendeeIds.includes(guestId), reason: null, commercial_value: 0 }; })), "guest_id");
  const sheets = { summary: { title: "Resumen", columns: summaryColumns, rowIdentity: "key", ordering: "fixed summary key order", rows: summaryRows }, reservations: { title: "Reservas", columns: reservationColumns, rowIdentity: "reservation_id", ordering: "reservation_id ascending", rows: reservations }, presales: { title: "Preventa", columns: presaleColumns, rowIdentity: "reservation_id", ordering: "reservation_id ascending", rows: presales }, attendees: { title: "Invitados", columns: attendeeColumns, rowIdentity: "guest_id", ordering: "guest_id ascending", rows: attendees }, courtesies: { title: "Cortesías", columns: courtesyColumns, rowIdentity: "guest_id", ordering: "guest_id ascending", rows: courtesies }, finalReports: { title: "Reportes finales", columns: finalReportColumns, rowIdentity: "report_run_id", ordering: "append-only by generated_at", rows: [] } } as const;
  const projection = { schemaVersion: GOOGLE_SHEETS_SCHEMA_VERSION, eventId: report.metadata.eventId, generatedAt: report.metadata.generatedAt, datasetHashInput: null, sheets } as unknown as WorkbookProjection;
  projection.datasetHashInput = buildWorkbookDatasetHashInput(projection);
  return projection;
}
