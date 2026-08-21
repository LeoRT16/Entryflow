import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statisticsPageSource = readFileSync(new URL("../app/statistics/page.tsx", import.meta.url), "utf8");

test("statistics page uses canonical metric data instead of the legacy guided action panel", () => {
  assert.match(statisticsPageSource, /workspaceIntelligence\.statistics/);
  assert.match(statisticsPageSource, /statistics\.metrics\.map/);
  assert.match(statisticsPageSource, /Métricas canónicas/);
  assert.match(statisticsPageSource, /Ritmo reciente/);
  assert.doesNotMatch(statisticsPageSource, /GuidedActionPanel/);
  assert.doesNotMatch(statisticsPageSource, /buildGuidedActionItem/);
});
