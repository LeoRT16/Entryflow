import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getNavigationPermissionForPath } from "../features/navigation/navigation";

const settingsPageSource = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");

test("/settings stays protected by settings.view", () => {
  assert.equal(getNavigationPermissionForPath("/settings"), "settings.view");
});

test("settings page keeps organization settings and removes venue editing", () => {
  assert.match(settingsPageSource, /OrganizationSettingsCard/);
  assert.match(settingsPageSource, /organizationName/);
  assert.match(settingsPageSource, /organizationTimezone/);
  assert.doesNotMatch(settingsPageSource, /VenueSettingsCard/);
  assert.doesNotMatch(settingsPageSource, /createVenue\s*\(/);
  assert.doesNotMatch(settingsPageSource, /updateVenue\s*\(/);
  assert.doesNotMatch(settingsPageSource, /venue\.manage/);
});

test("settings page stays compact with a single organization section", () => {
  assert.doesNotMatch(settingsPageSource, /xl:grid-cols-\[0\.34fr_0\.66fr\]/);
  assert.match(settingsPageSource, /Organización activa/);
  assert.match(settingsPageSource, /sm:grid-cols-\[minmax\(0,1fr\)_auto\] sm:items-start/);
  assert.match(settingsPageSource, /\+ Crear organización/);
});
