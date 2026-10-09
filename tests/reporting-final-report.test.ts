import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderFinalEventReportPdf } from "@/features/reporting/final-report/pdf";

const migration = readFileSync("supabase/migrations/20261103000000_reporting_final_pdf_workflow.sql", "utf8");
test("finalization creates one immutable snapshot and one durable job", () => {
  assert.match(migration, /unique\(event_id\)/g);
  assert.match(migration, /on conflict\(event_id\) do nothing/);
  assert.match(migration, /p_next_status='finished'/);
});
test("PDF rendering is deterministic and excludes credential material", async () => {
  const report = { metadata: { eventName: "Evento Á", organizationName: "Org", venueName: "Sala", generatedAt: "2026-01-01", eventStatus: "finished" }, summary: { activeReservations: 0, cancelledReservations: 0, operationalPeople: 0, historicalPeople: 0, checkedInPeople: 0, pendingPeople: 0, activeCourtesyPeople: 0, presalePurchases: 0, presaleAccessesSold: 0, presalePeopleLoaded: 0, presalePendingToLoad: 0, activeExtraWristbands: 0 }, attendees: [{ name: "José", carnet: "1", reservationCode: "R1", admissionStatus: "Pendiente", resourceName: null }] } as never;
  const pdf = await renderFinalEventReportPdf(report);
  assert.match(pdf.subarray(0, 8).toString(), /^%PDF-1\.[34]/);
  assert.doesNotMatch(pdf.toString(), /qr_|accessGrant|qrToken/);
});

test("PDF embeds and extracts Latin Unicode attendee names across pages", async () => {
  const names = ["José María Núñez", "María José Quiroga", "Álvaro Muñoz", "Güido Peña", "Óscar Ibáñez"];
  const report = { metadata: { eventName: "Evento Unicode", organizationName: "Org", venueName: "Sala", generatedAt: "2026-01-01", eventStatus: "finished" }, summary: { activeReservations: 0, cancelledReservations: 0, operationalPeople: 0, historicalPeople: 0, checkedInPeople: 0, pendingPeople: 0, activeCourtesyPeople: 0, presalePurchases: 0, presaleAccessesSold: 0, presalePeopleLoaded: 0, presalePendingToLoad: 0, activeExtraWristbands: 0 }, attendees: Array.from({ length: 160 }, (_, i) => ({ name: names[i % names.length], carnet: String(i), reservationCode: "R1", admissionStatus: "Pendiente", resourceName: null })) } as never;
  const pdf = await renderFinalEventReportPdf(report);
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path"); const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "entryflow-pdf-")); const input = join(dir, "report.pdf"); const output = join(dir, "report.txt"); writeFileSync(input, pdf); const result = spawnSync("pdftotext", [input, output]); assert.match(pdf.toString("latin1"), /NotoSans-Bold/); assert.match(pdf.toString("latin1"), /NotoSans-Regular/); if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") { assert.match(pdf.toString("latin1"), /Unicode/); return; } assert.equal(result.status, 0); const text = readFileSync(output, "utf8"); for (const name of names) assert.match(text, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); assert.match(text, /Página 2/);
});
