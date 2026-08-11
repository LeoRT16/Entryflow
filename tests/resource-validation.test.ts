import assert from "node:assert/strict";
import test from "node:test";

import { canPersistResourceName, normalizeResourceName } from "../features/tables/domain/resource-validation";

test("blank resource name cannot be persisted", () => {
  assert.equal(canPersistResourceName(""), false);
  assert.equal(normalizeResourceName(""), "");
});

test("whitespace-only resource name cannot be persisted", () => {
  assert.equal(canPersistResourceName("   "), false);
  assert.equal(normalizeResourceName("   "), "");
});

test("valid resource name can be persisted", () => {
  assert.equal(canPersistResourceName("Mesa 1"), true);
  assert.equal(normalizeResourceName("  Mesa 1  "), "Mesa 1");
});
