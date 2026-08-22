import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { QrCameraControls } from "../features/check-in/components/qr-camera-scanner";
import { createQrDetectionGate } from "../features/check-in/domain/qr-detection-gate";

type ReactTreeNode = {
  type: unknown;
  props: {
    children?: unknown;
    [key: string]: unknown;
  };
};

function isElement(node: unknown): node is ReactTreeNode {
  if (!node || typeof node !== "object") {
    return false;
  }

  return "type" in node && "props" in node;
}

function walkTree(node: unknown, visitor: (element: ReactTreeNode) => void) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkTree(child, visitor);
    }
    return;
  }

  if (!isElement(node)) {
    return;
  }

  visitor(node);
  walkTree(node.props.children, visitor);
}

function findButton(tree: unknown, label: string): ReactTreeNode | null {
  let match: ReactTreeNode | null = null;

  walkTree(tree, (element) => {
    if (element.type !== "button") {
      return;
    }

    if (element.props.children === label) {
      match = element;
    }
  });

  return match;
}

test("scanner controls wire stop and restart to different handlers", () => {
  const handlers = {
    activate: () => undefined,
    stop: () => undefined,
    restart: () => undefined,
  };

  const tree = QrCameraControls({
    status: "scanning",
    onActivate: handlers.activate,
    onStop: handlers.stop,
    onRestart: handlers.restart,
  });

  const stopButton = findButton(tree, "Detener cámara");
  const restartButton = findButton(tree, "Reiniciar");

  assert.ok(stopButton, "The stop button should render while scanning");
  assert.ok(restartButton, "The restart button should always render");
  assert.equal((stopButton as ReactTreeNode).props.onClick, handlers.stop);
  assert.equal((restartButton as ReactTreeNode).props.onClick, handlers.restart);
});

test("scanner controls keep activate separate from restart when idle", () => {
  const handlers = {
    activate: () => undefined,
    stop: () => undefined,
    restart: () => undefined,
  };

  const tree = QrCameraControls({
    status: "idle",
    onActivate: handlers.activate,
    onStop: handlers.stop,
    onRestart: handlers.restart,
  });

  const activateButton = findButton(tree, "Activar cámara");
  const restartButton = findButton(tree, "Reiniciar");

  assert.ok(activateButton, "The activate button should render while idle");
  assert.ok(restartButton, "The restart button should always render");
  assert.equal((activateButton as ReactTreeNode).props.onClick, handlers.activate);
  assert.equal((restartButton as ReactTreeNode).props.onClick, handlers.restart);
});

test("scanner locks a detected QR until a fresh scan session explicitly resets it", () => {
  const gate = createQrDetectionGate();

  assert.equal(gate.shouldAccept(" qr-123 "), true);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(gate.shouldAccept("qr-123"), false);
  }

  assert.equal(gate.shouldAccept("qr-456"), false);
  gate.reset();
  assert.equal(gate.shouldAccept("qr-123"), true);

  const source = readFileSync(new URL("../features/check-in/components/qr-camera-scanner.tsx", import.meta.url), "utf8");

  assert.match(source, /const detectionGateRef = useRef\(createQrDetectionGate\(\)\);/);
  assert.match(source, /detectionGateRef\.current\.reset\(\);/);
  assert.match(source, /if \(rawValue && detectionGateRef\.current\.shouldAccept\(rawValue\)\)/);
});
