import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statisticsPageSource = readFileSync(new URL("../app/statistics/page.tsx", import.meta.url), "utf8");

test("statistics page uses EventReport facts while retaining operational intelligence", () => {
  assert.match(statisticsPageSource, /buildStatisticsViewModel\(eventReport, workspaceIntelligence\)/);
  assert.match(statisticsPageSource, /reportStatistics\.metrics\.map/);
  assert.match(statisticsPageSource, /eventReport\.summary\.operationalPeople/);
  assert.match(statisticsPageSource, /workspaceIntelligence\.health/);
  assert.match(statisticsPageSource, /workspacePriority\.byModule\.Statistics/);
  assert.match(statisticsPageSource, /Métricas canónicas/);
  assert.match(statisticsPageSource, /Ritmo reciente/);
  assert.match(statisticsPageSource, /Datos incompletos/);
  assert.doesNotMatch(statisticsPageSource, /tableSummaries/);
  assert.doesNotMatch(statisticsPageSource, /statistics\.commercial/);
  assert.doesNotMatch(statisticsPageSource, /GuidedActionPanel/);
  assert.doesNotMatch(statisticsPageSource, /buildGuidedActionItem/);
});
