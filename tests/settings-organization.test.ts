import assert from "node:assert/strict";
import test from "node:test";
import { validateOrganizationName } from "@/features/settings/domain/organization-settings";

test("organization names are trimmed and capped at 100 characters", () => {
  assert.equal(validateOrganizationName("   EntryFlow   "), null);
  assert.match(validateOrganizationName("x".repeat(101)) ?? "", /100/);
  assert.match(validateOrganizationName("   ") ?? "", /obligatorio/);
});
