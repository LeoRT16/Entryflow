import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getWorkspaceReloadStatus } from "../services/workspace-service";

test("workspace reload keeps already-visible content stable during background refresh", () => {
  assert.equal(getWorkspaceReloadStatus("ready"), "ready");
  assert.equal(getWorkspaceReloadStatus("loading"), "loading");
  assert.equal(getWorkspaceReloadStatus("empty"), "loading");
  assert.equal(getWorkspaceReloadStatus("error"), "loading");
});

test("guest additions use one atomic repository operation before revalidating the workspace", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const addReservationGuest = useCallback(");
  const end = source.indexOf("const updateReservationGuest = useCallback(", start);
  const addGuestBlock = source.slice(start, end);

  assert.match(addGuestBlock, /await repositories\.reservations\.addGuestAtomic\(/);
  assert.doesNotMatch(addGuestBlock, /repositories\.timeline\.upsert/);
  assert.doesNotMatch(addGuestBlock, /repositories\.reservations\.upsert\(\{/);
  assert.match(addGuestBlock, /await reloadWorkspace\(\);/);
});

test("courtesy timeline events use UUID ids accepted by timeline_events", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function buildCourtesyAddedTimelineEvent");
  const end = source.indexOf("function buildAttemptTimelineEvent", start);
  const builder = source.slice(start, end);

  assert.match(builder, /id: createUuid\(\)/);
  assert.doesNotMatch(builder, /courtesy-added-\$\{/);
});

test("individual guest cancellation uses the atomic repository operation and persists Activity", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const updateReservationGuest = useCallback(");
  const end = source.indexOf("const setReservationStatus = useCallback(", start);
  const block = source.slice(start, end);
  const cancellationBlock = block.slice(
    block.indexOf('if (action === "cancel") {'),
    block.indexOf("const nextGuests: Guest[]", block.indexOf('if (action === "cancel") {')),
  );

  assert.match(cancellationBlock, /await repositories\.reservations\.cancelGuestAtomic\(/);
  assert.match(cancellationBlock, /upsertPersistedTimelineEvent\(cancellation\.timelineEvent\)/);
  assert.match(cancellationBlock, /await reloadWorkspace\(\);/);
  assert.doesNotMatch(cancellationBlock, /repositories\.guests\.upsert\(nextGuest\)/);
});
