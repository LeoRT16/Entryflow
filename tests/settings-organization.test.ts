import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateOrganizationName } from "@/features/settings/domain/organization-settings";

test("organization names are trimmed and capped at 100 characters", () => {
  assert.equal(validateOrganizationName("   EntryFlow   "), null);
  assert.match(validateOrganizationName("x".repeat(101)) ?? "", /100/);
  assert.match(validateOrganizationName("   ") ?? "", /obligatorio/);
});

test("settings uses the shared compact page header", () => {
  const source = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<Topbar eyebrow="Ajustes" title="Ajustes"[^>]*bare \/>/);
  assert.doesNotMatch(source, /<Topbar eyebrow="Ajustes" title="Ajustes"[^>]*compact \/>/);
});
