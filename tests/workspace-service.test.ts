import assert from "node:assert/strict";
import test from "node:test";

import { getWorkspaceReloadStatus } from "../services/workspace-service";

test("workspace reload keeps already-visible content stable during background refresh", () => {
  assert.equal(getWorkspaceReloadStatus("ready"), "ready");
  assert.equal(getWorkspaceReloadStatus("loading"), "loading");
  assert.equal(getWorkspaceReloadStatus("empty"), "loading");
  assert.equal(getWorkspaceReloadStatus("error"), "loading");
});
