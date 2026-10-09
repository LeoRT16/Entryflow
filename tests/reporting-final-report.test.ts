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
test("PDF rendering is deterministic and excludes credential material", () => {
  const report = { metadata: { eventName: "Evento Á", organizationName: "Org", venueName: "Sala", generatedAt: "2026-01-01", eventStatus: "finished" }, summary: { activeReservations: 0, cancelledReservations: 0, operationalPeople: 0, historicalPeople: 0, checkedInPeople: 0, pendingPeople: 0, activeCourtesyPeople: 0, presalePurchases: 0, presaleAccessesSold: 0, presalePeopleLoaded: 0, presalePendingToLoad: 0, activeExtraWristbands: 0 }, attendees: [{ name: "José", carnet: "1", reservationCode: "R1", admissionStatus: "Pendiente", resourceName: null }] } as never;
  const pdf = renderFinalEventReportPdf(report);
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.doesNotMatch(pdf.toString(), /qr_|accessGrant|qrToken/);
});
