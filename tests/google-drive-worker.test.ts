/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";
import { ensureOrganizationDriveRoot } from "../features/reporting/google-drive/provisioning/root";
import { canonicalEventDateKey, classifyDriveError, ensureChild, processDriveProvisioningJob } from "../features/reporting/google-drive/provisioning/worker";
import { FOLDER_MIME_TYPE } from "../features/reporting/google-drive/client/transport";

const folder = (id: string, parent: string[] = []) => ({ id, name: "x", mimeType: "application/vnd.google-apps.folder", trashed: false, parents: parent });

test("reuses a valid root without creating", async () => {
  let creates = 0;
  const transport = { getFileMetadata: async () => folder("root"), generateFolderId: async () => "new", createFolder: async () => { creates += 1; return folder("new"); } } as any;
  const result = await ensureOrganizationDriveRoot(transport, "root");
  assert.equal(result.id, "root"); assert.equal(creates, 0);
});

test("creates a missing root once with a reserved id", async () => {
  let created: string | undefined;
  const transport = { generateFolderId: async () => "reserved", createFolder: async (_n: string, _p?: string, id?: string) => { created = id; return folder(id!); } } as any;
  await ensureOrganizationDriveRoot(transport);
  assert.equal(created, "reserved");
});

test("rejects a child with the wrong parent without moving it", async () => {
  let moved = false;
  const transport = { getFileMetadata: async () => folder("event", ["other"]), renameFile: async () => { moved = true; } } as any;
  await assert.rejects(() => ensureChild(transport, "root", "event", "Event"), /drive_folder_drift/);
  assert.equal(moved, false);
});

test("rejects trashed and non-folder roots", async () => {
  const trashed = { getFileMetadata: async () => ({ ...folder("x"), trashed: true }) } as any;
  await assert.rejects(() => ensureOrganizationDriveRoot(trashed, "x"), /drive_root_invalid/);
  const file = { getFileMetadata: async () => ({ ...folder("x"), mimeType: "text/plain" }) } as any;
  await assert.rejects(() => ensureOrganizationDriveRoot(file, "x"), /drive_root_invalid/);
});

test("reuses valid event folder and reports folder", async () => {
  const transport = { getFileMetadata: async (id: string) => folder(id, id === "event" ? ["root"] : ["event"]) } as any;
  assert.equal((await ensureChild(transport, "root", "event", "Event")).id, "event");
  assert.equal((await ensureChild(transport, "event", "reports", "Reportes finales")).id, "reports");
});
for (const [label, trashed, mime] of [["trashed", true, "application/vnd.google-apps.folder"], ["mime", false, "text/plain"]] as const) {
  test(`rejects ${label} child`, async () => {
    const transport = { getFileMetadata: async () => ({ ...folder("x", ["root"]), trashed, mimeType: mime }) } as any;
    await assert.rejects(() => ensureChild(transport, "root", "x", "Event"), /drive_folder_drift/);
  });
}

test("creates missing child once", async () => { let count = 0; const transport = { generateFolderId: async () => "x", createFolder: async () => { count += 1; return folder("x", ["root"]); } } as any; await ensureChild(transport, "root", null, "Event"); assert.equal(count, 1); });
test("does not move an existing child", async () => { let renamed = false; const transport = { getFileMetadata: async () => folder("x", ["root"]), renameFile: async () => { renamed = true; } } as any; await ensureChild(transport, "root", "x", "Event"); assert.equal(renamed, false); });

for (const [label, error, expected] of [["404", { response: { status: 404 } }, "NOT_FOUND"], ["429", { response: { status: 429 } }, "RETRYABLE"], ["500", { response: { status: 500 } }, "RETRYABLE"], ["503", { response: { status: 503 } }, "RETRYABLE"], ["timeout", new Error("timeout"), "RETRYABLE"], ["reset", new Error("ECONNRESET"), "RETRYABLE"], ["403", { response: { status: 403 } }, "NEEDS_ACTION"], ["invalid_grant", { response: { status: 400, data: { error: "invalid_grant" } } }, "AUTH_REAUTH"]] as const) {
  test(`classifies Drive ${label}`, () => assert.equal(classifyDriveError(error), expected));
}

test("reserved recovery never lists children", async () => { let listed = false; const transport = { getFileMetadata: async () => folder("reserved", ["root"]), listChildren: async () => { listed = true; return []; } } as any; await ensureChild(transport, "root", "reserved", "Event"); assert.equal(listed, false); });

test("stateful job uses authoritative reservations and completes", async () => {
  const calls: string[] = []; const integration = { id: "i", organization_id: "o", enabled: true, status: "connected", oauth_secret_id: "s", organization_drive_folder_id: null, reserved_organization_drive_folder_id: null, manage_root_name: true }; const location = { id: "l", organization_id: "o", event_id: "e", status: "pending", revision: 1, event_drive_folder_id: null, reserved_event_drive_folder_id: null, final_reports_folder_id: null, reserved_final_reports_folder_id: null }; const event = { id: "e", name: "Evento", start_at: "2026-09-20T00:00:00Z", timezone: "UTC" };
  const table = (name: string) => { const value = name === "reporting_drive_integrations" ? integration : name === "event_drive_locations" ? location : event; const builder: any = { select: () => builder, eq: () => builder, is: () => builder, maybeSingle: async () => ({ data: value, error: null }), single: async () => ({ data: value, error: null }), update: (values: any) => { Object.assign(value, values); return builder; } }; return builder; };
  const db = { from: table, rpc: async (name: string, args: any) => { calls.push(name); if (name.startsWith("reserve")) return { data: args.p_candidate_file_id, error: null }; if (name.startsWith("confirm")) return { data: true, error: null }; if (name === "complete_drive_provisioning_job") return { data: true, error: null }; return { data: null, error: null }; } } as any;
  const files = new Map<string, any>(); let generated = 0; const transport = { generateFolderId: async () => `candidate-${++generated}`, getFileMetadata: async (id: string) => { const f = files.get(id); if (!f) throw new Error("404 not found"); return f; }, createFolder: async (name: string, parent?: string, id?: string) => { const f = folder(id!, parent ? [parent] : []); f.name = name; files.set(id!, f); return f; }, renameFile: async (id: string, name: string) => { const f = files.get(id)!; f.name = name; return f; }, listChildren: async () => { throw new Error("NAME_BASED_RECOVERY_FORBIDDEN"); } } as any;
  const ok = await processDriveProvisioningJob(db, { outbox_id: "j", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t" }, () => transport, async () => "synthetic");
  assert.equal(ok, true); assert.ok(calls.includes("complete_drive_provisioning_job")); assert.equal(generated, 3); assert.equal(files.size, 3);
});

test("ambiguous event-folder timeout recovers the same reserved ID", async () => {
  const integration: any = { id: "i", organization_id: "o", enabled: true, status: "connected", oauth_secret_id: "s", organization_drive_folder_id: "root", reserved_organization_drive_folder_id: null };
  const location: any = { id: "l", organization_id: "o", event_id: "e", status: "pending", revision: 1, event_drive_folder_id: null, reserved_event_drive_folder_id: "event-X", final_reports_folder_id: "reports", reserved_final_reports_folder_id: null };
  const event: any = { id: "e", name: "Evento", start_at: "2026-09-20T00:00:00Z", timezone: "UTC" };
  let eventLookups = 0; const files = new Map<string, any>([["root", folder("root")], ["reports", folder("reports", ["event-X"])]]); const calls: any[] = []; let run = 0; let generated = 0;
  const makeBuilder = (name: string) => { const value = name === "reporting_drive_integrations" ? integration : name === "event_drive_locations" ? location : event; const b: any = { select: () => b, eq: () => b, is: () => b, single: async () => ({ data: value, error: null }), maybeSingle: async () => ({ data: value, error: null }), update: (v: any) => { Object.assign(value, v); return b; } }; return b; };
  const db: any = { from: makeBuilder, rpc: async (name: string, args: any) => { calls.push({ name, args }); if (name === "reserve_drive_event_folder_id") return { data: location.reserved_event_drive_folder_id, error: null }; if (name === "confirm_drive_event_folder") { location.event_drive_folder_id = args.p_file_id; return { data: true, error: null }; } if (name === "complete_drive_provisioning_job") return { data: true, error: null }; if (name === "fail_drive_provisioning_job") return { data: true, error: null }; if (name === "reserve_drive_reports_folder_id") return { data: "reports-X", error: null }; if (name === "confirm_drive_reports_folder") return { data: true, error: null }; return { data: null, error: null }; } };
  const transport: any = { generateFolderId: async () => `unused-${++generated}`, getFileMetadata: async (id: string) => { if (id === "event-X" && run === 1 && eventLookups++ === 0) throw Object.assign(new Error("not found"), { response: { status: 404 } }); const file = files.get(id); if (!file) throw Object.assign(new Error("not found"), { response: { status: 404 } }); return file; }, createFolder: async (name: string, parent: string | undefined, id: string) => { calls.push({ name: "createFolder", args: { id } }); if (id === "event-X" && run === 1) { const created = folder(id, [parent!]); created.name = name; files.set(id, created); throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); } const created = folder(id, parent ? [parent] : []); created.name = name; files.set(id, created); return created; }, renameFile: async () => { throw new Error("unexpected rename"); }, listChildren: async () => { throw new Error("NAME_BASED_RECOVERY_FORBIDDEN"); } };
  run = 1; const first = await processDriveProvisioningJob(db, { outbox_id: "j", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t1" }, () => transport, async () => "sentinel"); assert.equal(first, false); assert.equal(location.reserved_event_drive_folder_id, "event-X"); assert.equal(location.event_drive_folder_id, null); assert.equal(calls.filter((c) => c.name === "createFolder").length, 1); assert.equal(generated, 0);
  run = 2; const second = await processDriveProvisioningJob(db, { outbox_id: "j", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t2" }, () => transport, async () => "sentinel"); assert.equal(second, true, JSON.stringify(calls)); assert.equal(location.event_drive_folder_id, "event-X"); assert.equal(calls.filter((c) => c.name === "createFolder").length, 1); assert.equal(generated, 0); assert.equal(calls.filter((c) => c.name === "confirm_drive_event_folder").length, 1); assert.equal(calls.filter((c) => c.name === "complete_drive_provisioning_job").length, 1);
});

for (const [label, lookupError] of [["429", { response: { status: 429 } }], ["500", { response: { status: 500 } }], ["503", { response: { status: 503 } }], ["timeout", Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })], ["ECONNRESET", Object.assign(new Error("reset"), { code: "ECONNRESET" })], ["403", { response: { status: 403 } }]] as const) {
  test(`reserved lookup ${label} never creates`, async () => {
    const integration: any = { id: "i", organization_id: "o", enabled: true, status: "connected", oauth_secret_id: "s", organization_drive_folder_id: "root" };
    const location: any = { id: "l", organization_id: "o", event_id: "e", status: "pending", revision: 1, event_drive_folder_id: null, reserved_event_drive_folder_id: "event-X", final_reports_folder_id: "reports" };
    const event: any = { id: "e", name: "Evento", start_at: "2026-09-20T00:00:00Z", timezone: "UTC" }; const calls: any[] = []; let generated = 0;
    const make = (name: string) => { const value = name === "reporting_drive_integrations" ? integration : name === "event_drive_locations" ? location : event; const b: any = { select: () => b, eq: () => b, is: () => b, single: async () => ({ data: value, error: null }), maybeSingle: async () => ({ data: value, error: null }), update: () => b }; return b; };
    const db: any = { from: make, rpc: async (name: string) => { calls.push(name); if (name === "reserve_drive_event_folder_id") return { data: "event-X", error: null }; if (name === "fail_drive_provisioning_job") return { data: true, error: null }; return { data: false, error: null }; } };
    const transport: any = { generateFolderId: async () => { generated += 1; return "new"; }, getFileMetadata: async (id: string) => id === "root" ? folder("root") : (() => { throw lookupError; })(), createFolder: async () => { calls.push("createFolder"); return folder("x", ["root"]); }, renameFile: async () => { calls.push("renameFile"); return folder("x"); }, listChildren: async () => { throw new Error("NAME_BASED_RECOVERY_FORBIDDEN"); } };
    const result = await processDriveProvisioningJob(db, { outbox_id: "j", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t" }, () => transport, async () => "synthetic");
    assert.equal(result, false); assert.equal(calls.filter((x) => x === "createFolder").length, 0); assert.equal(generated, 0); assert.equal(calls.filter((x) => x === "confirm_drive_event_folder").length, 0); assert.equal(calls.filter((x) => x === "complete_drive_provisioning_job").length, 0); assert.equal(location.reserved_event_drive_folder_id, "event-X"); assert.equal(location.event_drive_folder_id, null);
  });
}
for (const [label, parent] of [["event", "root"], ["reports", "event"], ["retry", "root"], ["reclaim", "event"], ["stale", "root"], ["tenant", "other"], ["disabled", "root"], ["drift", "other"]] as const) {
  test(`artifact metadata contract: ${label}`, async () => {
    const transport = { getFileMetadata: async () => folder(label, [parent]) } as any;
    const result = await ensureChild(transport, parent, label, label);
    assert.equal(result.parents[0], parent);
  });
}

async function runRenameScenario(previousName: string, desiredName: string, options: { manual?: boolean; failOnce?: boolean; status?: string } = {}) {
  const integration: any = { id: "i", organization_id: "o", enabled: true, status: options.status ?? "connected", oauth_secret_id: "s", organization_drive_folder_id: "root" };
  const location: any = { id: "l", organization_id: "o", event_id: "e", status: "pending", revision: 1, event_drive_folder_id: "event-X", reserved_event_drive_folder_id: "event-X", final_reports_folder_id: "reports-X", reserved_final_reports_folder_id: "reports-X", last_applied_event_name: previousName };
  const event: any = { id: "e", name: desiredName.split(" — ")[1], start_at: desiredName.slice(0, 10) + "T00:00:00Z", timezone: "UTC" }; const files: any = { root: folder("root"), "event-X": { ...folder("event-X", ["root"]), name: options.manual ? "MI CARPETA PERSONAL" : previousName }, "reports-X": { ...folder("reports-X", ["event-X"]), name: "Reportes finales" } }; const calls: any[] = []; let fail = options.failOnce;
  const make = (name: string) => { const value = name === "reporting_drive_integrations" ? integration : name === "event_drive_locations" ? location : event; const b: any = { select: () => b, eq: () => b, is: () => b, single: async () => ({ data: value, error: null }), maybeSingle: async () => ({ data: value, error: null }), update: (v: any) => { Object.assign(value, v); return b; } }; return b; };
  const db: any = { from: make, rpc: async (name: string, args: any) => { calls.push({ name, args }); if (name.startsWith("confirm")) return { data: true, error: null }; if (name === "complete_drive_provisioning_job") return { data: true, error: null }; if (name === "fail_drive_provisioning_job") return { data: true, error: null }; return { data: "event-X", error: null }; } };
  const transport: any = { generateFolderId: async () => { calls.push({ name: "generate" }); return "never"; }, getFileMetadata: async (id: string) => files[id], createFolder: async () => { calls.push({ name: "create" }); throw new Error("unexpected create"); }, renameFile: async (id: string, name: string) => { calls.push({ name: "rename", id, desiredName: name }); if (fail) { fail = false; throw Object.assign(new Error("rename unavailable"), { response: { status: 503 } }); } files[id].name = name; return files[id]; }, listChildren: async () => { throw new Error("NAME_BASED_RECOVERY_FORBIDDEN"); } };
  const job: any = { outbox_id: "j", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t" };
  const first = await processDriveProvisioningJob(db, job, () => transport, async () => "synthetic");
  return { first, location, files, calls, db, transport, job };
}

test("rename name-only preserves event ID", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta A", "2026-09-20 — Fiesta B"); assert.equal(r.first, true); assert.equal(r.location.event_drive_folder_id, "event-X"); assert.equal(r.calls.filter((c) => c.name === "rename").length, 1); assert.equal(r.calls.find((c) => c.name === "rename").desiredName, "2026-09-20 — Fiesta B"); assert.equal(r.calls.filter((c) => c.name === "create").length, 0); });
test("rename date-only preserves event ID", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta", "2026-09-21 — Fiesta"); assert.equal(r.first, true); assert.equal(r.location.event_drive_folder_id, "event-X"); assert.equal(r.calls.filter((c) => c.name === "rename").length, 1); });
test("rename name and date performs one rename", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta A", "2026-09-21 — Fiesta B"); assert.equal(r.first, true); assert.equal(r.calls.filter((c) => c.name === "rename").length, 1); assert.equal(r.files["event-X"].name, "2026-09-21 — Fiesta B"); });
test("unchanged event name performs no rename", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta", "2026-09-20 — Fiesta"); assert.equal(r.first, true); assert.equal(r.calls.filter((c) => c.name === "rename").length, 0); assert.equal(r.calls.filter((c) => c.name === "create").length, 0); });
test("manual rename is protected", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta", "2026-09-21 — Fiesta Nueva", { manual: true }); assert.equal(r.first, false); assert.equal(r.files["event-X"].name, "MI CARPETA PERSONAL"); assert.equal(r.calls.filter((c) => c.name === "rename").length, 0); assert.equal(r.location.event_drive_folder_id, "event-X"); });
test("transient rename failure retries without creating", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta", "2026-09-21 — Fiesta", { failOnce: true }); assert.equal(r.first, false); assert.equal(r.location.event_drive_folder_id, "event-X"); assert.equal(r.calls.filter((c) => c.name === "create").length, 0); });
test("rename retry succeeds on same ID", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta", "2026-09-21 — Fiesta", { failOnce: true }); const second = await processDriveProvisioningJob(r.db, r.job, () => r.transport, async () => "synthetic"); assert.equal(second, true); assert.equal(r.files["event-X"].name, "2026-09-21 — Fiesta"); assert.equal(r.location.event_drive_folder_id, "event-X"); assert.equal(r.calls.filter((c) => c.name === "create").length, 0); assert.equal(r.calls.filter((c) => c.name === "rename").length, 2); });

test("invalid_grant marks reauth, preserves identity, and never persists token sentinels", async () => {
  const refresh = "REFRESH_TOKEN_SENTINEL_DO_NOT_PERSIST_8E"; const access = "ACCESS_TOKEN_SENTINEL_DO_NOT_PERSIST_8E";
  const integration: any = { id: "i", organization_id: "o", enabled: true, status: "connected", oauth_secret_id: "secret-X", organization_drive_folder_id: "root", reserved_organization_drive_folder_id: "root-reserved" };
  const location: any = { id: "l", organization_id: "o", event_id: "e", status: "pending", event_drive_folder_id: "event-X", reserved_event_drive_folder_id: "event-reserved", final_reports_folder_id: "reports-X", reserved_final_reports_folder_id: "reports-reserved" };
  const event: any = { id: "e", name: "Evento", start_at: "2026-09-20T00:00:00Z", timezone: "UTC" }; const writes: any[] = []; const calls: any[] = [];
  const make = (name: string) => { const value = name === "reporting_drive_integrations" ? integration : name === "event_drive_locations" ? location : event; const b: any = { select: () => b, eq: () => b, is: () => b, single: async () => ({ data: value, error: null }), maybeSingle: async () => ({ data: value, error: null }), update: (v: any) => { writes.push(v); Object.assign(value, v); return b; } }; return b; };
  const db: any = { from: make, rpc: async (name: string, args: any) => { calls.push({ name, args }); return { data: true, error: null }; } };
  const transport: any = { getFileMetadata: async () => { throw Object.assign(new Error(`invalid_grant ${refresh} ${access}`), { response: { data: { error: "invalid_grant", error_description: refresh } } }); }, createFolder: async () => { throw new Error("must not create"); }, generateFolderId: async () => { throw new Error("must not generate"); } };
  const logs: any[] = []; const original = [console.log, console.warn, console.error]; console.log = (...a: any[]) => logs.push(a); console.warn = (...a: any[]) => logs.push(a); console.error = (...a: any[]) => logs.push(a);
  let result: boolean; let reads = 0; const deletes = 0; const creates = 0; const updates = 0;
  try { result = await processDriveProvisioningJob(db, { outbox_id: "j", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t" }, () => transport, async () => { reads++; return refresh; }); } finally { [console.log, console.warn, console.error] = original; }
  const serialized = JSON.stringify({ integration, location, calls, writes, logs });
  assert.equal(result!, false); assert.equal(integration.status, "needs_reauth"); assert.equal(integration.enabled, true); assert.equal(integration.oauth_secret_id, "secret-X"); assert.equal(location.event_drive_folder_id, "event-X"); assert.equal(location.reserved_event_drive_folder_id, "event-reserved"); assert.equal(reads, 1); assert.equal(deletes, 0); assert.equal(creates, 0); assert.equal(updates, 0); assert.equal(calls.some((c) => c.name === "fail_drive_provisioning_job" && c.args.p_status === "needs_action"), true); assert.equal(calls.some((c) => c.name === "complete_drive_provisioning_job"), false); assert.equal(serialized.includes(refresh), false); assert.equal(serialized.includes(access), false);
});

test("needs_reauth blocks provisioning without changing IDs", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta", "2026-09-21 — Fiesta", { status: "needs_reauth" }); assert.equal(r.first, false); assert.equal(r.location.event_drive_folder_id, "event-X"); assert.equal(r.calls.filter((c) => c.name === "create" || c.name === "rename").length, 0); assert.equal(r.calls.some((c) => c.name === "fail_drive_provisioning_job"), true); });
test("reconnected integration reuses historical event identity", async () => { const r = await runRenameScenario("2026-09-20 — Fiesta", "2026-09-20 — Fiesta"); assert.equal(r.first, true); assert.equal(r.files["event-X"].name, "2026-09-20 — Fiesta"); assert.equal(r.calls.filter((c) => c.name === "create").length, 0); });

test("double provisioning reuses the same root, event and reports folder IDs", async () => {
  const integration: any = { id: "i", organization_id: "o", enabled: true, status: "connected", oauth_secret_id: "s", organization_drive_folder_id: null, reserved_organization_drive_folder_id: null };
  const location: any = { id: "l", organization_id: "o", event_id: "e", status: "pending", revision: 1, event_drive_folder_id: null, reserved_event_drive_folder_id: null, final_reports_folder_id: null, reserved_final_reports_folder_id: null, last_applied_event_name: null };
  const event: any = { id: "e", name: "Fiesta", start_at: "2026-09-20T00:00:00Z", timezone: "UTC" }; const files: any = {}; const calls: any[] = []; const ids = ["root-X", "event-X", "reports-X"]; let generated = 0;
  const make = (name: string) => { const value = name === "reporting_drive_integrations" ? integration : name === "event_drive_locations" ? location : event; const b: any = { select: () => b, eq: () => b, is: () => b, single: async () => ({ data: value, error: null }), maybeSingle: async () => ({ data: value, error: null }), update: (v: any) => { Object.assign(value, v); return b; } }; return b; };
  const db: any = { from: make, rpc: async (name: string, args: any) => { calls.push({ name, args }); if (name === "reserve_drive_organization_folder_id") { integration.reserved_organization_drive_folder_id = args.p_candidate_file_id; return { data: args.p_candidate_file_id, error: null }; } if (name === "reserve_drive_event_folder_id") { location.reserved_event_drive_folder_id = args.p_candidate_file_id; return { data: args.p_candidate_file_id, error: null }; } if (name === "reserve_drive_reports_folder_id") { location.reserved_final_reports_folder_id = args.p_candidate_file_id; return { data: args.p_candidate_file_id, error: null }; } if (name === "confirm_drive_organization_folder") integration.organization_drive_folder_id = args.p_file_id; if (name === "confirm_drive_event_folder") location.event_drive_folder_id = args.p_file_id; if (name === "confirm_drive_reports_folder") location.final_reports_folder_id = args.p_file_id; return { data: true, error: null }; } };
  const transport: any = { generateFolderId: async () => ids[generated++], getFileMetadata: async (id: string) => { if (!files[id]) throw Object.assign(new Error("not found"), { response: { status: 404 } }); return files[id]; }, createFolder: async (name: string, parentId: string | undefined, id: string) => { calls.push({ name: "create", id, parentId }); files[id] = { id, name, parents: parentId ? [parentId] : [], mimeType: FOLDER_MIME_TYPE, trashed: false }; return files[id]; }, renameFile: async () => { calls.push({ name: "rename" }); throw new Error("unexpected rename"); }, listChildren: async () => { calls.push({ name: "listChildren" }); throw new Error("forbidden"); } };
  const job: any = { outbox_id: "j1", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t1" };
  const first = await processDriveProvisioningJob(db, job, () => transport, async () => "synthetic"); const afterFirst = { generated, creates: calls.filter((c) => c.name === "create").length, renames: calls.filter((c) => c.name === "rename").length, lists: calls.filter((c) => c.name === "listChildren").length };
  const second = await processDriveProvisioningJob(db, { ...job, outbox_id: "j2", claim_token: "t2" }, () => transport, async () => "synthetic"); const afterSecond = { generated, creates: calls.filter((c) => c.name === "create").length, renames: calls.filter((c) => c.name === "rename").length, lists: calls.filter((c) => c.name === "listChildren").length };
  assert.equal(first, true); assert.equal(second, true); assert.deepEqual([integration.organization_drive_folder_id, location.event_drive_folder_id, location.final_reports_folder_id], ids); assert.deepEqual(afterFirst, { generated: 3, creates: 3, renames: 0, lists: 0 }); assert.deepEqual(afterSecond, afterFirst); assert.equal(Object.keys(files).length, 3); assert.equal(calls.filter((c) => c.name === "complete_drive_provisioning_job").length, 2);
});

test("canonical event date preserves the operational timezone calendar day", () => {
  assert.equal(canonicalEventDateKey({ name: "Late event", start_at: "2026-08-29T23:30:00-04:00", timezone: "America/La_Paz" }), "2026-08-29");
  assert.equal(canonicalEventDateKey({ name: "Late event", start_at: "2026-08-30T03:30:00Z", timezone: "America/La_Paz" }), "2026-08-29");
  assert.equal(canonicalEventDateKey({ name: "ISO fractional event", start_at: "2026-08-30T03:30:00.123Z", timezone: "America/La_Paz" }), "2026-08-29");
  assert.equal(canonicalEventDateKey({ name: "Local event", start_at: "2026-08-29 23:30", timezone: "America/La_Paz" }), "2026-08-29");
  assert.equal(canonicalEventDateKey({ name: "Date event", start_at: "2026-08-29", timezone: "America/La_Paz" }), "2026-08-29");
  assert.throws(() => canonicalEventDateKey({ name: "Invalid local fraction", start_at: "2026-08-29T21:00:00.123", timezone: "America/La_Paz" }), /drive_event_start_at_invalid/);
  assert.throws(() => canonicalEventDateKey({ name: "Invalid offset", start_at: "2026-08-29T21:00:00+14:01", timezone: "America/La_Paz" }), /drive_event_start_at_invalid/);
});

test("localized legacy event date fails closed before generating or reserving a Drive ID", async () => {
  const integration: any = { id: "i", organization_id: "o", enabled: true, status: "connected", oauth_secret_id: "s", organization_drive_folder_id: "root" };
  const location: any = { id: "l", organization_id: "o", event_id: "e", status: "pending", revision: 1, event_drive_folder_id: null, reserved_event_drive_folder_id: null, final_reports_folder_id: null, reserved_final_reports_folder_id: null };
  const event: any = { id: "e", name: "Sábado 29 de Agosto", start_at: "29 de agosto de 2026 21:00", timezone: "America/La_Paz" };
  const rpcCalls: any[] = []; const stageLogs: any[] = []; let generated = 0;
  const make = (name: string) => { const value = name === "reporting_drive_integrations" ? integration : name === "event_drive_locations" ? location : event; const b: any = { select: () => b, eq: () => b, is: () => b, single: async () => ({ data: value, error: null }), update: (v: any) => { Object.assign(value, v); return b; } }; return b; };
  const db: any = { from: make, rpc: async (name: string, args: any) => { rpcCalls.push({ name, args }); return { data: true, error: null }; } };
  const transport: any = { getFileMetadata: async () => folder("root"), generateFolderId: async () => { generated++; return "unused"; }, createFolder: async () => { throw new Error("unexpected create"); }, listChildren: async () => { throw new Error("unexpected list"); } };
  const originalWarn = console.warn; console.warn = (...args: any[]) => stageLogs.push(args);
  let result: boolean;
  try { result = await processDriveProvisioningJob(db, { outbox_id: "j", event_location_id: "l", organization_id: "o", integration_id: "i", target_revision: 1, claim_token: "t" }, () => transport, async () => "synthetic"); } finally { console.warn = originalWarn; }
  assert.equal(result!, false); assert.equal(generated, 0); assert.equal(rpcCalls.some((call) => call.name === "reserve_drive_event_folder_id"), false); assert.equal(location.event_drive_folder_id, null); assert.equal(location.reserved_event_drive_folder_id, null);
  const failed = rpcCalls.find((call) => call.name === "fail_drive_provisioning_job"); assert.equal(failed.args.p_status, "needs_action"); assert.equal(failed.args.p_error_code, "drive_event_start_at_invalid");
  assert.equal(stageLogs.some((args) => args[0] === "drive_provisioning_stage_failure" && args[1]?.stage === "event_name_format"), true);
});
