import assert from "node:assert/strict";
import test from "node:test";

import { classifyAccessNamespace } from "../features/check-in/domain/access-dispatch";

test("legacy Boliche qr namespace stays routed to Boliche", () => {
  assert.equal(classifyAccessNamespace("qr_62eb796d960ae427"), "boliche");
  assert.equal(classifyAccessNamespace(" QR_62EB796D960AE427 "), "boliche");
});

test("Accreditation acc1 namespace routes to Accreditation", () => {
  assert.equal(classifyAccessNamespace("acc1_1234567890abcdef"), "accreditation");
});

test("unknown prefixes are rejected by the shared dispatcher", () => {
  assert.equal(classifyAccessNamespace("ACC-7K4D-9M2Q"), "unknown");
  assert.equal(classifyAccessNamespace("manual-lookup"), "unknown");
  assert.equal(classifyAccessNamespace(""), "unknown");
});
