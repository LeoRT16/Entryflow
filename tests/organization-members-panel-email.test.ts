import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("features/accounts/components/organization-members-panel.tsx", "utf8");

test("new member email is editable and required before creation", () => {
  assert.match(source, /readOnly=\{!isNewMember\}/);
  assert.match(source, /onChange=\{\(event\) => setForm\(\(current\) => \(\{ \.\.\.current, userEmail: event\.target\.value \}\)\)\}/);
  assert.match(source, /Ingresá un email para el nuevo miembro/);
});

test("existing member email remains identity protected", () => {
  assert.match(source, /const isNewMember = selectedId === "new" \|\| !selectedAccount/);
  assert.match(source, /userEmail: form\.userEmail\.trim\(\)/);
});

test("new member creation keeps the canonical invite payload and temporary password", () => {
  assert.match(source, /createAccount\(\{/);
  assert.match(source, /email: form\.userEmail\.trim\(\)/);
  assert.match(source, /tempPassword,/);
  assert.match(source, /confirmTempPassword,/);
});
