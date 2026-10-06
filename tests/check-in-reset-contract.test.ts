import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flowSource = readFileSync(new URL("../features/check-in/components/check-in-flow.tsx", import.meta.url), "utf8");
const scannerSource = readFileSync(new URL("../features/check-in/components/qr-camera-scanner.tsx", import.meta.url), "utf8");

test("camera restart clears the parent admission result and selected access", () => {
  assert.match(flowSource, /const resetAdmissionState = \(\) => \{/);
  assert.match(flowSource, /setQuery\(""\);[\s\S]*setSelectedGuestId\(null\);[\s\S]*setAttemptState\(\{ kind: "idle" \}\);/);
  assert.match(flowSource, /<QrCameraScanner[\s\S]*onRestart=\{resetAdmissionState\}/);
  assert.match(scannerSource, /onRestart\?: \(\) => void;/);
  assert.match(scannerSource, /onRestart\?\.\(\);[\s\S]*void startScanner\(\);/);
});
