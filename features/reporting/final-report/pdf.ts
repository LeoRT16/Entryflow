import type { EventReport } from "@/features/reporting/types";

function escapePdf(value: string) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "?"); }

/** Deterministic, dependency-free PDF text renderer. It deliberately exposes no QR or auth material. */
export function renderFinalEventReportPdf(report: EventReport): Buffer {
  const lines = [
    "ENTRYFLOW — INFORME FINAL DEL EVENTO",
    report.metadata.eventName,
    `${report.metadata.organizationName} · ${report.metadata.venueName}`,
    `Finalizado: ${report.metadata.generatedAt}`,
    "",
    `Reservas: ${report.summary.activeReservations} activas · ${report.summary.cancelledReservations} canceladas`,
    `Accesos: ${report.summary.operationalPeople} operativos · ${report.summary.checkedInPeople} ingresaron · ${report.summary.pendingPeople} pendientes`,
    `Preventas: ${report.summary.presalePurchases} · Cortesías: ${report.summary.activeCourtesyPeople} · Pulseras extra: ${report.summary.activeExtraWristbands}`,
    "",
    "ASISTENTES",
    ...report.attendees.map((a) => `${a.name} | carnet ${a.carnet || "—"} | ${a.reservationCode} | ${a.admissionStatus} | ${a.resourceName ?? "—"}`),
  ];
  const stream = ["BT", "/F1 9 Tf", "50 780 Td", ...lines.flatMap((line, index) => [index ? "0 -14 Td" : "", `(${escapePdf(line)}) Tj`]).filter(Boolean), "ET"].join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets: number[] = [0];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(pdf); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
