import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EventReport, MoneyValue, ResourceReport } from "@/features/reporting/types";
import { formatEventWallDateTime, formatTimestamp } from "@/lib/date-time";

const FONT = join(process.cwd(), "assets/fonts/NotoSans.ttf");
const BOLD_FONT = join(process.cwd(), "assets/fonts/NotoSans-Bold.woff");
const NAVY = "#17324d";
const BLUE = "#2f6f9f";
const INK = "#1f2933";
const MUTED = "#667788";
const LINE = "#d8e0e7";
const PALE = "#f3f7fa";
const LEFT = 42;
const RIGHT = 750;
const CONTENT_WIDTH = RIGHT - LEFT;

function money(value?: MoneyValue) { if (!value || value.amount === null || !value.complete) return "Sin dato"; return `${value.currency ?? ""} ${value.amount.toLocaleString("es-BO")}`.trim(); }
function amount(value?: MoneyValue) { return value?.amount ?? 0; }
function safe(value: unknown, fallback = "Sin dato") { return value === null || value === undefined || value === "" ? fallback : String(value); }
function rule(document: PDFKit.PDFDocument, y: number) { document.strokeColor(LINE).lineWidth(0.7).moveTo(LEFT, y).lineTo(RIGHT, y).stroke(); }
function heading(document: PDFKit.PDFDocument, title: string, subtitle: string) { document.fillColor(NAVY).font("NotoBold").fontSize(20).text(title, LEFT, 36); document.fillColor(MUTED).font("Noto").fontSize(9).text(subtitle, LEFT, 63); rule(document, 81); }
function card(document: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string, accent = BLUE) { document.roundedRect(x, y, width, 48, 5).fillAndStroke(PALE, LINE); document.rect(x, y, 4, 48).fill(accent); document.fillColor(MUTED).font("Noto").fontSize(7.5).text(label.toUpperCase(), x + 12, y + 9, { width: width - 18 }); document.fillColor(INK).font("NotoBold").fontSize(15).text(value, x + 12, y + 24, { width: width - 18 }); }
function tableHeader(document: PDFKit.PDFDocument, y: number, columns: Array<[string, number]>) { document.rect(LEFT, y, CONTENT_WIDTH, 22).fill(NAVY); let x = LEFT + 9; document.fillColor("white").font("NotoBold").fontSize(7.5); for (const [label, width] of columns) { document.text(label, x, y + 7, { width }); x += width; } }
function row(document: PDFKit.PDFDocument, y: number, values: Array<[string, number]>, shaded: boolean) { if (shaded) document.rect(LEFT, y, CONTENT_WIDTH, 21).fill(PALE); let x = LEFT + 9; document.fillColor(INK).font("Noto").fontSize(7.5); for (const [value, width] of values) { document.text(value, x, y + 6, { width, ellipsis: true }); x += width; } rule(document, y + 21); }
function chart(document: PDFKit.PDFDocument, x: number, y: number, width: number, items: Array<[string, number, string]>) { const max = Math.max(1, ...items.map(([, value]) => value)); document.fillColor(NAVY).font("NotoBold").fontSize(10).text("Distribución comercial", x, y); items.forEach(([label, value, color], index) => { const currentY = y + 22 + index * 22; document.fillColor(MUTED).font("Noto").fontSize(7.5).text(label, x, currentY, { width: 92 }); document.roundedRect(x + 96, currentY - 1, width - 145, 10, 3).fill("#e8eef3"); document.roundedRect(x + 96, currentY - 1, Math.max(2, (width - 145) * value / max), 10, 3).fill(color); document.fillColor(INK).font("NotoBold").fontSize(7.5).text(`BOB ${value.toLocaleString("es-BO")}`, x + width - 45, currentY, { width: 45, align: "right" }); }); }

function addOperationsPage(document: PDFKit.PDFDocument, report: EventReport, resources: ResourceReport[], globalCapacity: number, globalAssigned: number, includeSummary: boolean, title = "Operaciones y recursos") {
  document.addPage();
  heading(document, title, "Admisión, capacidad física y asignación · Sin datos personales");
  if (!includeSummary) {
    document.fillColor(MUTED).font("Noto").fontSize(8).text("Continuación de recursos físicos · Totales globales del evento", LEFT, 98);
    document.fillColor(NAVY).font("NotoBold").fontSize(10).text("Recursos físicos", LEFT, 123);
    document.fillColor(MUTED).font("Noto").fontSize(8).text(`Capacidad física global: ${globalCapacity} · Ocupación asignada global: ${globalAssigned}`, LEFT, 140);
    tableHeader(document, 158, [["Recurso", 170], ["Zona", 150], ["Capacidad", 90], ["Asignada", 90], ["Admisión", 100]]);
    resources.forEach((resource, index) => row(document, 181 + index * 21, [[safe(resource.resourceName), 170], [safe(resource.sectorName), 150], [String(resource.physicalCapacity), 90], [String(resource.capacityAssigned), 90], [`${resource.checkedInPeople}/${resource.operationalPeople}`, 100]], index % 2 === 0));
    return;
  }
  document.fillColor(INK).font("Noto").fontSize(9).text(`${report.summary.operationalPeople} personas registradas · ${report.summary.checkedInPeople} ingresadas · ${report.summary.pendingPeople} pendientes`, LEFT, 98);
  document.fillColor(NAVY).font("NotoBold").fontSize(10).text("Admisión por tipo de reserva", LEFT, 123);
  tableHeader(document, 143, [["Tipo de reserva", 190], ["Operativas", 100], ["Ingresados", 90], ["Pendientes", 90], ["Valor", 150]]);
  report.reservations.forEach((reservation, index) => row(document, 166 + index * 21, [[safe(reservation.type), 190], [String(reservation.operationalPeople), 100], [String(reservation.checkedInPeople), 90], [String(reservation.pendingPeople), 90], [money(reservation.soldTotal), 150]], index % 2 === 0));
  const totalY = 166 + report.reservations.length * 21;
  row(document, totalY, [["TOTAL", 190], [String(report.summary.operationalPeople), 100], [String(report.summary.checkedInPeople), 90], [String(report.summary.pendingPeople), 90], [money(report.commercial.sold.total), 150]], true);
  const resourcesY = totalY + 36;
  document.fillColor(NAVY).font("NotoBold").fontSize(10).text("Recursos físicos", LEFT, resourcesY);
  document.fillColor(MUTED).font("Noto").fontSize(8).text(`Capacidad física global: ${globalCapacity} · Ocupación asignada global: ${globalAssigned}`, LEFT, resourcesY + 17);
  tableHeader(document, resourcesY + 35, [["Recurso", 170], ["Zona", 150], ["Capacidad", 90], ["Asignada", 90], ["Admisión", 100]]);
  resources.forEach((resource, index) => row(document, resourcesY + 58 + index * 21, [[safe(resource.resourceName), 170], [safe(resource.sectorName), 150], [String(resource.physicalCapacity), 90], [String(resource.capacityAssigned), 90], [`${resource.checkedInPeople}/${resource.operationalPeople}`, 100]], index % 2 === 0));
}

/** Executive/admin PDF. It deliberately omits attendee-level PII; Sheets remains the operational detail surface. */
export async function renderFinalEventReportPdf(report: EventReport): Promise<Buffer> {
  const document = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 42, bufferPages: true, autoFirstPage: true });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  document.registerFont("Noto", readFileSync(FONT));
  document.registerFont("NotoBold", readFileSync(BOLD_FONT));
  const summary = report.summary;
  const commercial = report.commercial.sold;

  heading(document, "Informe final", "Resumen del evento · EntryFlow");
  document.fillColor(INK).font("NotoBold").fontSize(16).text(safe(report.metadata.eventName), LEFT, 98, { width: 490 });
  document.fillColor(MUTED).font("Noto").fontSize(9).text(`${safe(report.metadata.organizationName)}  ·  ${safe(report.metadata.venueName)}`, LEFT, 122);
  document.text(`Evento: ${formatEventWallDateTime(safe(report.metadata.eventStartAt))}`, LEFT, 139);
  document.text(`Generado: ${formatTimestamp(safe(report.metadata.generatedAt), report.metadata.timezone)}`, LEFT, 156);
  card(document, 42, 184, 132, "Registrados", String(summary.operationalPeople));
  card(document, 184, 184, 132, "Ingresados", String(summary.checkedInPeople), "#23866d");
  card(document, 326, 184, 132, "Pendientes", String(summary.pendingPeople), "#c88728");
  card(document, 468, 184, 132, "Asistencia", summary.operationalPeople ? `${((summary.checkedInPeople / summary.operationalPeople) * 100).toFixed(1)}%` : "0%", "#23866d");
  card(document, 610, 184, 140, "Valor registrado", money(commercial.total), NAVY);
  document.fillColor(NAVY).font("NotoBold").fontSize(10).text("Estado operativo", LEFT, 264);
  document.fillColor(INK).font("Noto").fontSize(8.5).text(`Reservas activas: ${summary.activeReservations}   ·   Canceladas: ${summary.cancelledReservations}   ·   Personas históricas: ${summary.historicalPeople}`, LEFT, 282);
  chart(document, 430, 264, 320, [["Mesas", amount(commercial.mesas.value), "#2f6f9f"], ["Preventas", amount(commercial.presales.value), "#4d8fbd"], ["Cortesías", amount(commercial.courtesies.value), "#8da8bb"], ["Manillas extra", amount(commercial.extraWristbands.value), "#23866d"]]);
  document.fillColor(NAVY).font("NotoBold").fontSize(10).text("Detalle comercial", LEFT, 365);
  tableHeader(document, 384, [["Categoría", 190], ["Transacciones", 100], ["Personas", 90], ["Valor registrado", 150], ["Moneda", 100]]);
  const rows: Array<[string, typeof commercial.mesas]> = [["Mesas / reservas", commercial.mesas], ["Preventas", commercial.presales], ["Cortesías", commercial.courtesies], ["Manillas extra", commercial.extraWristbands]];
  rows.forEach(([label, value], index) => row(document, 407 + index * 21, [[label, 190], [String(value.transactions), 100], [String(value.people), 90], [money(value.value), 150], [safe(value.value.currency, "Sin moneda") , 100]], index % 2 === 0));
  row(document, 491, [["TOTAL REGISTRADO", 190], [String(rows.reduce((sum, [, value]) => sum + value.transactions, 0)), 100], [String(rows.reduce((sum, [, value]) => sum + value.people, 0)), 90], [money(commercial.total), 150], [safe(commercial.total.currency, "Sin moneda"), 100]], true);

  const extraAttendees = report.attendees.filter((attendee) => attendee.extraWristband || attendee.accessType === "extra_wristband");
  const operationalRows = [...report.reservations];
  if (extraAttendees.length > 0) operationalRows.push({ type: "Manillas extra", operationalPeople: extraAttendees.length, checkedInPeople: extraAttendees.filter((attendee) => attendee.checkedIn).length, pendingPeople: extraAttendees.filter((attendee) => !attendee.checkedIn).length, soldTotal: commercial.extraWristbands.value } as never);
  const pageSize = 8;
  const globalCapacity = report.resources.reduce((total, resource) => total + resource.physicalCapacity, 0);
  const globalAssigned = report.resources.reduce((total, resource) => total + resource.capacityAssigned, 0);
  const resourcePages = Math.max(1, Math.ceil(report.resources.length / pageSize));
  for (let page = 0; page < resourcePages; page += 1) addOperationsPage(document, { ...report, reservations: operationalRows } as EventReport, report.resources.slice(page * pageSize, (page + 1) * pageSize), globalCapacity, globalAssigned, page === 0, resourcePages === 1 ? "Operaciones y recursos" : `Operaciones y recursos · ${page + 1}`);
  const range = document.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) { document.switchToPage(index); document.fillColor(MUTED).font("Noto").fontSize(7).text(`ENTRYFLOW  ·  ${safe(report.metadata.eventName)}  ·  Generado ${formatTimestamp(safe(report.metadata.generatedAt), report.metadata.timezone)}  ·  Página ${index + 1} de ${range.count}`, LEFT, 558, { width: CONTENT_WIDTH, align: "center" }); }
  return await new Promise<Buffer>((resolve) => { document.on("end", () => resolve(Buffer.concat(chunks))); document.end(); });
}
