import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statisticsPageSource = readFileSync(new URL("../app/statistics/page.tsx", import.meta.url), "utf8");

test("statistics page uses EventReport facts while retaining operational intelligence", () => {
  assert.match(statisticsPageSource, /buildStatisticsViewModel\(eventReport, workspaceIntelligence\)/);
  assert.match(statisticsPageSource, /Resumen del evento/);
  assert.match(statisticsPageSource, /summary\.operationalPeople/);
  assert.match(statisticsPageSource, /workspacePriority\.allItems/);
  assert.match(statisticsPageSource, /Resumen comercial/);
  assert.match(statisticsPageSource, /Ingreso y ritmo/);
  assert.match(statisticsPageSource, /Ocupación física/);
  assert.doesNotMatch(statisticsPageSource, /activeOperators/);
  assert.doesNotMatch(statisticsPageSource, /slice\(0, 4\)/);
  assert.doesNotMatch(statisticsPageSource, /Última reserva:/);
  assert.match(statisticsPageSource, /formatRate/);
  assert.match(statisticsPageSource, /buildStatisticsAttention/);
  assert.doesNotMatch(statisticsPageSource, /tableSummaries/);
  assert.doesNotMatch(statisticsPageSource, /Resumen operativo vivo/);
  assert.doesNotMatch(statisticsPageSource, /GuidedActionPanel/);
  assert.doesNotMatch(statisticsPageSource, /buildGuidedActionItem/);
});
