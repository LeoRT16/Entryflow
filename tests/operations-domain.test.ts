import assert from "node:assert/strict";
import test from "node:test";

import { buildOperationsIncidents } from "../features/operations/domain/operations-domain";
import type { WorkspacePriorityItem } from "../domain/workspace-priority";

const item = (overrides: Partial<WorkspacePriorityItem> = {}) => ({
  id: "item-1",
  priority: "high" as const,
  module: "Reservations" as const,
  title: "Reserva sin mesa",
  description: "Reserva pendiente",
  route: "/reservations",
  requiresAction: true,
  blocking: false,
  ...overrides,
}) as WorkspacePriorityItem;

test("operations projection separates critical and attention incidents", () => {
  const result = buildOperationsIncidents({
    criticalItems: [item({ id: "critical", priority: "critical" })],
    attentionNow: [item({ id: "attention", priority: "medium", module: "Tables", route: "/tables" })],
  });
  assert.equal(result.critical[0]?.tone, "danger");
  assert.equal(result.critical[0]?.priority, "critical");
  assert.equal(result.attention[0]?.tone, "warning");
  assert.equal(result.attention[0]?.priority, "attention");
});

test("operations projection preserves priority ordering and safe deduplication", () => {
  const result = buildOperationsIncidents({
    criticalItems: [item({ id: "critical", priority: "critical" }), item({ id: "other", priority: "critical", title: "Otra incidencia" })],
    attentionNow: [item({ id: "duplicate", priority: "critical" })],
  });
  assert.deepEqual(result.critical.map(({ title }) => title), ["Reserva sin mesa", "Otra incidencia"]);
});

test("stalled check-in keeps its canonical destination and presentation label", () => {
  const result = buildOperationsIncidents({
    criticalItems: [item({ id: "stalled", priority: "critical", module: "Check-in", title: "Puerta congestionada", route: "/events" })],
    attentionNow: [],
  });
  assert.deepEqual(result.critical[0], {
    id: "checkin-stalled-visible",
    title: "Ingreso detenido",
    description: "Reserva pendiente",
    route: "/check-in",
    module: "Check-in",
    priority: "critical",
    tone: "danger",
  });
});
