import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("services/workspace-service.tsx", "utf8");

test("authenticated check-in path prepares the authoritative access grant before admission", () => {
  const prepare = source.indexOf("repositories.guests.prepareAuthoritativeAccess");
  const accessKey = source.indexOf("const accessGrantKey", prepare);
  assert.ok(prepare >= 0);
  assert.ok(accessKey > prepare);
  assert.match(source.slice(prepare, accessKey), /setGuests/);
});
