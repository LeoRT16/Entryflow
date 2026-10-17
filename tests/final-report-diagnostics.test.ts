import assert from "node:assert/strict";
import test from "node:test";
import { finalReportFailure } from "@/lib/reporting/final-report-diagnostics";
import { FinalReportFinalizationError } from "@/repositories/supabase-workspace-repositories";

test("final-report diagnostics preserves a safe server code, phase, and message", () => {
  assert.deepEqual(
    finalReportFailure("transition", { code: "22023", message: "event_transition_invalid" }, "finalization_failed", "fallback"),
    { code: "22023", message: "event_transition_invalid", phase: "transition" },
  );
});

test("final-report client error exposes structured failures to the workspace", () => {
  const error = new FinalReportFinalizationError({ error: { code: "final_report_revision_conflict", message: "El evento cambió mientras se preparaba el informe.", phase: "revision_check" } }, 409);
  assert.equal(error.code, "final_report_revision_conflict");
  assert.equal(error.phase, "revision_check");
  assert.match(error.message, /El evento cambió/);
});

test("final-report client error remains useful for legacy error payloads", () => {
  const error = new FinalReportFinalizationError({ error: "finalization_failed" }, 400);
  assert.equal(error.code, "finalization_failed");
  assert.equal(error.phase, null);
  assert.equal(error.message, "No se pudo finalizar el evento.");
});
