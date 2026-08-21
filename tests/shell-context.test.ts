import assert from "node:assert/strict";
import test from "node:test";

import { buildShellContextSummary, formatShellEventStatus, getShellEventStatusTone, getShellRouteContext } from "../components/shell-context";

test("shell context makes the current module immediately visible", () => {
  const route = getShellRouteContext("/tables");

  assert.equal(route.label, "Espacios");
  assert.match(route.description, /espacios físicos/i);
});

test("shell context keeps organization and event hierarchy compact", () => {
  assert.equal(buildShellContextSummary("La Rota Carlota", "Sabado 22 de Agosto"), "La Rota Carlota · Sabado 22 de Agosto");
  assert.equal(buildShellContextSummary("La Rota Carlota", ""), "La Rota Carlota");
});

test("terminal event status keeps a distinct shell tone", () => {
  assert.equal(formatShellEventStatus("live"), "En curso");
  assert.equal(formatShellEventStatus("published"), "Publicado");
  assert.equal(formatShellEventStatus("finished"), "Finalizado");
  assert.equal(getShellEventStatusTone("live"), "success");
  assert.equal(getShellEventStatusTone("published"), "info");
  assert.equal(getShellEventStatusTone("draft"), "warning");
  assert.equal(getShellEventStatusTone("finished"), "danger");
});
