import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EventReport } from "@/features/reporting/types";

const FONT = join(process.cwd(), "assets/fonts/NotoSans.ttf");
const BOLD_FONT = join(process.cwd(), "assets/fonts/NotoSans-Bold.woff");
function wrap(value: string, width = 92) { const words = value.split(/\s+/); const out: string[] = []; let line = ""; for (const word of words) { if ((line ? line.length + 1 : 0) + word.length > width) { if (line) out.push(line); line = word; } else line = line ? `${line} ${word}` : word; } if (line) out.push(line); return out.length ? out : [""]; }

/** PDFKit embeds the OFL-licensed Noto Sans TrueType font with a Unicode ToUnicode map. */
export async function renderFinalEventReportPdf(report: EventReport): Promise<Buffer> {
  const attendees = report.attendees ?? [];
  const lines = [
    "ENTRYFLOW  |  INFORME FINAL DEL EVENTO", report.metadata.eventName,
    `${report.metadata.organizationName}  |  ${report.metadata.venueName}`, `Finalizado: ${report.metadata.generatedAt}`, "",
    "RESUMEN COMERCIAL Y OPERATIVO",
    `Reservas activas: ${report.summary.activeReservations}   Canceladas: ${report.summary.cancelledReservations}`,
    `Personas operativas: ${report.summary.operationalPeople}   Históricas: ${report.summary.historicalPeople}`,
    `Ingresaron: ${report.summary.checkedInPeople}   Pendientes: ${report.summary.pendingPeople}`,
    `Preventas: ${report.summary.presalePurchases}   Cortesías: ${report.summary.activeCourtesyPeople}   Pulseras extra: ${report.summary.activeExtraWristbands}`,
    `Total comercial: ${report.commercial?.sold?.total?.amount ?? "—"} ${report.commercial?.sold?.total?.currency ?? ""}`, "",
    "ASISTENTES", "Nombre | Carnet | Reserva | Estado | Zona/Recurso",
    ...attendees.map((a) => `${a.name || "—"} | ${a.carnet || "—"} | ${a.reservationCode || "—"} | ${a.admissionStatus || "—"} | ${a.zoneName ?? "—"}/${a.resourceName ?? "—"}`),
  ].flatMap(wrap);
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true, autoFirstPage: true });
  const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const font = readFileSync(FONT);
  doc.registerFont("Noto", font);
  doc.registerFont("NotoBold", readFileSync(BOLD_FONT));
  doc.font("Noto").fontSize(9);
  const pageLines = 49;
  for (let i = 0; i < lines.length; i += pageLines) {
    if (i) doc.addPage();
    const page = lines.slice(i, i + pageLines);
    page.forEach((line, offset) => {
      const global = i + offset;
      doc.font([0, 5, 10, 12, 13].includes(global) ? "NotoBold" : "Noto").text(line, { lineGap: 5 });
    });
  }
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) { doc.switchToPage(i); doc.font("NotoBold").fontSize(8).text(`Página ${i + 1} de ${totalPages}`, 50, 805, { align: "left" }); }
  return await new Promise<Buffer>((resolve) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.end(); });
}
