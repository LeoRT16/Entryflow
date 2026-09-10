import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { WorkspaceIntelligence } from "../domain/workspace-intelligence";
import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildStatisticsViewModel } from "../features/reporting/domain/statistics-view-model";
import {
  canDeleteResource,
  describeResourceDeleteError,
  removeResourceFromWorkspace,
  runOptimisticResourceDelete,
} from "../features/tables/domain/resource-lifecycle";
import { buildEventReportFixtureInput } from "./fixtures/event-report-fixture";

const noDependencies = {
  reservations: [],
  guests: [],
  venueLayoutResources: [],
  eventLayoutResources: [],
  tables: [],
  timelineEvents: [],
};

test("an unused Resource is deletable and successful deletion removes it from workspace state", () => {
  const decision = canDeleteResource({ resourceId: "unused", ...noDependencies });
  const resources = buildEventReportFixtureInput().resources;

  assert.equal(decision.allowed, true);
  assert.deepEqual(removeResourceFromWorkspace([...resources, { ...resources[0]!, id: "unused" }], "unused"), resources);
});

test("a Resource with Reservation or Guest history cannot be deleted", () => {
  const input = buildEventReportFixtureInput();
  const resourceId = "mesa-1";
  const decision = canDeleteResource({
    resourceId,
    reservations: input.reservations,
    guests: input.guests,
    venueLayoutResources: [],
    eventLayoutResources: [],
    tables: [],
    timelineEvents: [],
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "history_associated");
  assert.deepEqual(decision.dependencies.reservations, ["mesa-active"]);
  assert.equal(decision.dependencies.guests.length, 7);
  assert.deepEqual(decision.allowed ? removeResourceFromWorkspace(input.resources, resourceId) : input.resources, input.resources);
});

test("venue and event layout references block Resource deletion", () => {
  const input = buildEventReportFixtureInput();
  const venueLayoutResource = {
    id: "venue-layout-resource-1",
    venueLayoutId: "venue-layout-1",
    sourceResourceId: "mesa-1",
    type: "table" as const,
    name: "Mesa 1",
    capacity: 5,
    status: "active" as const,
    order: 1,
    createdAt: input.resources[0]!.createdAt,
    updatedAt: input.resources[0]!.updatedAt,
  };
  const eventLayoutResource = {
    ...input.eventLayoutResources[0]!,
    sourceVenueLayoutResourceId: venueLayoutResource.id,
  };
  const decision = canDeleteResource({
    resourceId: "mesa-1",
    reservations: [],
    guests: [],
    venueLayoutResources: [venueLayoutResource],
    eventLayoutResources: [eventLayoutResource],
    tables: [],
    timelineEvents: [],
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.dependencies.venueLayoutResources, [venueLayoutResource.id]);
  assert.deepEqual(decision.dependencies.eventLayoutResources, [eventLayoutResource.id]);
});

test("a deactivated historical Resource remains resolvable but leaves active Statistics capacity", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.eventLayouts = [];
  input.eventLayoutResources = [];
  input.eventLayoutSectors = [];
  input.resources.forEach((resource) => { resource.capacity = 5; });
  input.resources.find((resource) => resource.id === "mesa-1")!.status = "Closed";
  for (const reservation of input.reservations) {
    reservation.eventLayoutId = undefined;
    reservation.eventLayoutResourceId = undefined;
  }
  const report = buildEventReport(input);
  const intelligence = { statistics: { cards: { checkInsPerMinute: 0, averageCheckInIntervalMinutes: 0 } } } as Pick<WorkspaceIntelligence, "statistics">;
  const statistics = buildStatisticsViewModel(report, intelligence);

  assert.equal(report.resources.find((resource) => resource.resourceId === "mesa-1")?.activeInventory, false);
  assert.equal(report.resources.find((resource) => resource.resourceId === "mesa-1")?.reservationIds.includes("mesa-active"), true);
  assert.equal(statistics.resources.some((resource) => resource.resourceId === "mesa-1"), false);
  assert.equal(statistics.capacity.physicalCapacity, 5);
});

test("a truly deleted unused Resource is absent from EventReport", () => {
  const input = structuredClone(buildEventReportFixtureInput());
  input.resources.push({ ...input.resources[0]!, id: "unused", name: "Sin uso", capacity: 2 });
  input.resources = removeResourceFromWorkspace(input.resources, "unused");

  assert.equal(buildEventReport(input).resources.some((resource) => resource.resourceId === "unused"), false);
});

test("Spaces UI exposes explanatory delete UX through the canonical service", () => {
  const source = readFileSync(new URL("../features/tables/components/tables-flow.tsx", import.meta.url), "utf8");
  assert.match(source, /canDeleteResource/);
  assert.match(source, /title: "Eliminar espacio"/);
  assert.match(source, /Este espacio ya tiene historial asociado\. Puedes desactivarlo, pero no eliminarlo\./);
  assert.match(source, /deleteResource\(resource\.id\)/);
  assert.doesNotMatch(source, /window\.location\.reload/);
});

test("successful Resource deletion keeps the optimistic removal", async () => {
  const transitions: string[] = [];

  await runOptimisticResourceDelete({
    resourceId: "unused",
    removeOptimistically: () => transitions.push("removed"),
    persistDelete: async (resourceId) => {
      assert.equal(resourceId, "unused");
      transitions.push("persisted");
      return true;
    },
    restoreSnapshot: () => transitions.push("restored"),
  });

  assert.deepEqual(transitions, ["removed", "persisted"]);
});

test("failed Resource deletion restores the snapshot and normalizes structured errors", async () => {
  const transitions: string[] = [];

  await assert.rejects(
    () => runOptimisticResourceDelete({
      resourceId: "unused",
      removeOptimistically: () => transitions.push("removed"),
      persistDelete: async () => {
        throw { code: "42501", message: "new row violates row-level security policy for table resources" };
      },
      restoreSnapshot: () => transitions.push("restored"),
    }),
    (error: unknown) => error instanceof Error
      && error.message === "No se pudo eliminar el espacio.",
  );

  assert.deepEqual(transitions, ["removed", "restored"]);
});

test("Resource delete error normalization includes only safe contextual detail", () => {
  assert.equal(
    describeResourceDeleteError({ message: "Revisa tu conexión e inténtalo nuevamente." }),
    "No se pudo eliminar el espacio. Revisa tu conexión e inténtalo nuevamente.",
  );
  assert.equal(describeResourceDeleteError({}), "No se pudo eliminar el espacio.");
  assert.doesNotMatch(describeResourceDeleteError({}), /\[object Object\]/);
});

test("Resource delete translates server authority domain errors without SQL leakage", () => {
  assert.equal(
    describeResourceDeleteError({ code: "P0001", message: "resource_has_history" }),
    "Este espacio ya tiene historial asociado. Puedes desactivarlo, pero no eliminarlo.",
  );
  assert.equal(
    describeResourceDeleteError({ code: "42501", message: "resource_forbidden" }),
    "No tienes permiso para eliminar este espacio.",
  );
});

test("server-side history discovered after preflight rolls back optimistic deletion", async () => {
  const transitions: string[] = [];

  await assert.rejects(
    () => runOptimisticResourceDelete({
      resourceId: "unused-at-preflight",
      removeOptimistically: () => transitions.push("removed"),
      persistDelete: async () => {
        throw { code: "P0001", message: "resource_has_history" };
      },
      restoreSnapshot: () => transitions.push("restored"),
    }),
    (error: unknown) => error instanceof Error
      && error.message === "Este espacio ya tiene historial asociado. Puedes desactivarlo, pero no eliminarlo.",
  );

  assert.deepEqual(transitions, ["removed", "restored"]);
});

test("Resource history guard remains before optimistic deletion and repository persistence", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const deleteResource = useCallback(");
  const end = source.indexOf("const moveResourceToSector = useCallback(", start);
  const block = source.slice(start, end);

  assert.ok(block.indexOf("if (!decision.allowed)") < block.indexOf("runOptimisticResourceDelete"));
  assert.match(block, /persistDelete: repositories\.resources\.delete/);
  assert.doesNotMatch(block, /setResourceStatus/);
});

test("Resource deactivation remains a status update and does not use soft delete", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const setResourceStatus = useCallback(");
  const end = source.indexOf("const deleteResource = useCallback(", start);
  const block = source.slice(start, end);

  assert.match(block, /repositories\.resources\.setStatus/);
  assert.doesNotMatch(block, /repositories\.resources\.delete/);
});
