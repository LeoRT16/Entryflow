import assert from "node:assert/strict";
import test from "node:test";
import type { GoogleSpreadsheetDriveTransport, ManagedSpreadsheetMetadata } from "../features/reporting/google-sheets/provisioning/transports";
import { ENTRYFLOW_SPREADSHEET_MARKER, GOOGLE_SPREADSHEET_MIME_TYPE, createGoogleOAuthTransports, createGoogleOAuthTransportsFromAuth, createGoogleSheetsOAuthMetadataTransportFromAuth, createGoogleSpreadsheetDriveTransportFromApi } from "../features/reporting/google-sheets/provisioning/transports";
import { classifySpreadsheetProvisioningError } from "../features/reporting/google-sheets/provisioning/errors";
import { processReportingSpreadsheetProvisioningJob, processReportingSpreadsheetProvisioningBatch, reportingSpreadsheetTitle, type SpreadsheetProvisioningContext, type SpreadsheetProvisioningDependencies, type SpreadsheetProvisioningRepository } from "../features/reporting/google-sheets/provisioning/worker";
import { google } from "googleapis";

const refreshTokenSentinel = "REFRESH_TOKEN_SENTINEL_NOT_FOR_LOGGING";
const eventId = "f4000000-0000-4000-8000-000000000015";
const organizationId = "f4000000-0000-4000-8000-000000000012";
const folderId = "event-folder-id";
const title = "EntryFlow — Reporting test — 2026-09-20";
const markers = { ...ENTRYFLOW_SPREADSHEET_MARKER, eventId, organizationId };

test("canonical title adds the EntryFlow prefix exactly once", () => {
  assert.equal(reportingSpreadsheetTitle({ name: "Sábado 29 de Agosto", start_at: "2026-08-29T21:00", timezone: "America/La_Paz" }), "EntryFlow — Sábado 29 de Agosto — 2026-08-29");
  assert.equal(reportingSpreadsheetTitle({ name: "EntryFlow — Boliche Reporting E2E — NO OPERAR", start_at: "2026-09-25T21:00", timezone: "America/La_Paz" }), "EntryFlow — Boliche Reporting E2E — NO OPERAR — 2026-09-25");
  assert.equal(reportingSpreadsheetTitle({ name: "Fiesta EntryFlow interna", start_at: "2026-09-25T21:00", timezone: "America/La_Paz" }), "EntryFlow — Fiesta EntryFlow interna — 2026-09-25");
});

function file(id: string, options: Partial<ManagedSpreadsheetMetadata> = {}): ManagedSpreadsheetMetadata {
  return { id, name: title, mimeType: GOOGLE_SPREADSHEET_MIME_TYPE, trashed: false, parents: [folderId], appProperties: markers, ...options };
}

function makeTransport(overrides: Partial<GoogleSpreadsheetDriveTransport> = {}) {
  const calls = { gets: [] as string[], searches: 0, creates: 0, renames: [] as Array<[string, string]> };
  const transport: GoogleSpreadsheetDriveTransport = {
    async getFile(id) {
      calls.gets.push(id);
      if (id === folderId) return file(folderId, { mimeType: "application/vnd.google-apps.folder", appProperties: {} });
      if (id === "definitive-spreadsheet") return file(id);
      throw new Error("Google file not found.");
    },
    async findManagedSpreadsheets() { calls.searches += 1; return []; },
    async createSpreadsheet(name, parentId, appProperties) { calls.creates += 1; return file("created-spreadsheet", { name, parents: [parentId], appProperties }); },
    async renameFile(id, name) { calls.renames.push([id, name]); return file(id, { name }); },
    ...overrides,
  };
  return { calls, transport };
}

function makeRepository(overrides: Partial<SpreadsheetProvisioningContext> = {}) {
  const context: SpreadsheetProvisioningContext = {
    event: { name: "Reporting test", start_at: "2026-09-20T20:00:00Z", timezone: "UTC" },
    location: { status: "ready", event_drive_folder_id: folderId, revision: 7 },
    integration: { enabled: true, status: "connected", oauth_secret_id: "vault-secret-reference" },
    destination: { spreadsheet_id: null, last_applied_spreadsheet_title: null, writer_mode: "oauth_user" },
    ...overrides,
  };
  let clock = new Date("2026-09-17T12:00:00.000Z");
  let claimSequence = 0;
  let state: "pending" | "processing" | "retry" | "uncertain" | "ready" | "needs_action" | "needs_reauth" | "blocked" = "pending";
  let attempts = 0;
  let token: string | null = null;
  let leaseUntil = 0;
  let createStartedAt: number | null = null;
  const failures: Array<{ status: string; errorCode: string; nextAvailableAt?: string }> = [];
  const completions: Array<{ spreadsheetId: string; lastAppliedTitle: string; updateLastAppliedTitle: boolean }> = [];
  const repository: SpreadsheetProvisioningRepository = {
    async claim() {
      if (!["pending", "retry", "uncertain"].includes(state) && !(state === "processing" && leaseUntil < clock.getTime())) return [];
      const reconcile_only = state === "uncertain" || (state === "processing" && leaseUntil < clock.getTime() && createStartedAt !== null);
      attempts += 1;
      claimSequence += 1;
      state = "processing";
      token = `claim-${claimSequence}`;
      leaseUntil = clock.getTime() + 5 * 60_000;
      return [{ outbox_id: "outbox-1", destination_id: "destination-1", event_id: eventId, organization_id: organizationId, target_revision: 7, attempts, claim_token: token, reconcile_only }];
    },
    async loadContext() { return context; },
    async beginCreate(job, requestedFolderId) {
      if (state !== "processing" || job.claim_token !== token || leaseUntil <= clock.getTime() || requestedFolderId !== context.location.event_drive_folder_id || context.destination.spreadsheet_id) return false;
      createStartedAt = clock.getTime();
      leaseUntil = clock.getTime() + 10 * 60_000;
      return true;
    },
    async complete(job, requestedFolderId, spreadsheetId, lastAppliedTitle, updateLastAppliedTitle) {
      if (state !== "processing" || job.claim_token !== token || leaseUntil <= clock.getTime()) return "stale";
      if (context.location.revision !== job.target_revision || context.location.event_drive_folder_id !== requestedFolderId) { state = "needs_action"; return "needs_action"; }
      if (context.destination.spreadsheet_id && context.destination.spreadsheet_id !== spreadsheetId) { state = "needs_action"; return "needs_action"; }
      context.destination.spreadsheet_id ??= spreadsheetId;
      if (context.destination.last_applied_spreadsheet_title === null || updateLastAppliedTitle) context.destination.last_applied_spreadsheet_title = lastAppliedTitle;
      state = "ready";
      token = null;
      leaseUntil = 0;
      createStartedAt = null;
      completions.push({ spreadsheetId, lastAppliedTitle, updateLastAppliedTitle });
      return "completed";
    },
    async fail(job, status, errorCode, nextAvailableAt) {
      if (state !== "processing" || job.claim_token !== token || leaseUntil <= clock.getTime()) return false;
      state = status as typeof state;
      token = null;
      leaseUntil = 0;
      if (status !== "uncertain" && status !== "needs_action") createStartedAt = null;
      if (status === "needs_reauth") context.integration.status = "needs_reauth";
      failures.push({ status, errorCode, nextAvailableAt });
      return true;
    },
  };
  return {
    repository,
    context,
    failures,
    completions,
    get state() { return state; },
    get leaseUntil() { return leaseUntil; },
    get token() { return token; },
    advance(ms: number) { clock = new Date(clock.getTime() + ms); },
    now() { return new Date(clock); },
    setState(value: typeof state) { state = value; },
    setLeaseUntil(value: number) { leaseUntil = value; },
  };
}

function dependencies(repository: ReturnType<typeof makeRepository>, transport: GoogleSpreadsheetDriveTransport, readToken: (id: string) => Promise<string> = async () => refreshTokenSentinel): SpreadsheetProvisioningDependencies {
  return { repository: repository.repository, transportFactory: () => transport, readToken, now: repository.now };
}

async function runOne(deps: SpreadsheetProvisioningDependencies) {
  const jobs = await deps.repository.claim("test-worker", 1);
  return jobs.length ? processReportingSpreadsheetProvisioningJob(deps, jobs[0]!) : "no-job";
}

test("no spreadsheet creates exactly once and persists the ID only on reporting_destinations", async () => {
  const db = makeRepository();
  const { calls, transport } = makeTransport();
  assert.equal(await runOne(dependencies(db, transport)), "ready");
  assert.equal(calls.searches, 1);
  assert.equal(calls.creates, 1);
  assert.equal(db.context.destination.spreadsheet_id, "created-spreadsheet");
  assert.equal(db.context.destination.last_applied_spreadsheet_title, title);
});

test("one existing exact appProperties marker is adopted without a create", async () => {
  const db = makeRepository();
  const { calls, transport } = makeTransport({ findManagedSpreadsheets: async (_parent, requestedMarkers) => { assert.deepEqual(requestedMarkers, markers); return [file("existing-marker")]; } });
  assert.equal(await runOne(dependencies(db, transport)), "ready");
  assert.equal(db.context.destination.spreadsheet_id, "existing-marker");
  assert.equal(calls.creates, 0);
});

test("duplicate exact markers require action and never pick a file", async () => {
  const db = makeRepository();
  const { calls, transport } = makeTransport({ findManagedSpreadsheets: async () => [file("match-a"), file("match-b")] });
  assert.equal(await runOne(dependencies(db, transport)), "needs_action");
  assert.equal(calls.creates, 0);
  assert.equal(db.failures[0]?.errorCode, "spreadsheet_marker_duplicates");
});

test("a create timeout is reconciled later and adopts the created marker without a second create", async () => {
  const db = makeRepository();
  let stored: ManagedSpreadsheetMetadata | null = null;
  const { calls, transport } = makeTransport({
    async createSpreadsheet(name, parent, appProperties) { calls.creates += 1; stored = file("ambiguous-created", { name, parents: [parent], appProperties }); throw new Error("socket timeout"); },
    async findManagedSpreadsheets() { calls.searches += 1; return stored ? [stored] : []; },
  });
  const deps = dependencies(db, transport);
  assert.equal(await runOne(deps), "failed");
  assert.equal(db.state, "uncertain");
  db.advance(6_000);
  assert.equal(await runOne(deps), "ready");
  assert.equal(db.context.destination.spreadsheet_id, "ambiguous-created");
  assert.equal(calls.creates, 1);
});

test("ambiguous create followed by zero reconciliation results stays uncertain without a blind create", async () => {
  const db = makeRepository();
  const { calls, transport } = makeTransport({ createSpreadsheet: async () => { calls.creates += 1; throw new Error("request timed out"); } });
  const deps = dependencies(db, transport);
  assert.equal(await runOne(deps), "failed");
  db.advance(6_000);
  assert.equal(await runOne(deps), "failed");
  assert.equal(db.state, "uncertain");
  assert.equal(calls.creates, 1);
  assert.equal(calls.searches, 2);
});

test("concurrent workers receive one lease and only the owner can create", async () => {
  const db = makeRepository();
  const { calls, transport } = makeTransport({ async findManagedSpreadsheets() { await new Promise((resolve) => setTimeout(resolve, 5)); return []; } });
  const deps = dependencies(db, transport);
  const results = await Promise.all([processReportingSpreadsheetProvisioningBatch(deps, "worker-a"), processReportingSpreadsheetProvisioningBatch(deps, "worker-b")]);
  assert.equal(results.reduce((sum, result) => sum + result.claimed, 0), 1);
  assert.equal(calls.creates, 1);
});

test("expired create lease reclaims reconciliation-only; stale token cannot start or persist", async () => {
  const db = makeRepository();
  const first = (await db.repository.claim("a", 1))[0]!;
  assert.equal(await db.repository.beginCreate(first, folderId), true);
  db.advance(10 * 60_000 + 1);
  const second = (await db.repository.claim("b", 1))[0]!;
  assert.equal(second.reconcile_only, true);
  assert.notEqual(second.claim_token, first.claim_token);
  assert.equal(await db.repository.beginCreate(first, folderId), false);
  assert.equal(await db.repository.complete(first, folderId, "stale-id", "stale title", true), "stale");
  assert.equal(db.context.destination.spreadsheet_id, null);
});

test("a definitive persisted spreadsheet is inspected directly without marker search or create", async () => {
  const db = makeRepository({ destination: { spreadsheet_id: "definitive-spreadsheet", last_applied_spreadsheet_title: title, writer_mode: "oauth_user" } });
  const { calls, transport } = makeTransport();
  assert.equal(await runOne(dependencies(db, transport)), "ready");
  assert.equal(calls.searches, 0);
  assert.equal(calls.creates, 0);
  assert.deepEqual(calls.gets, [folderId, "definitive-spreadsheet"]);
});

test("a definitive spreadsheet 404 needs action and never searches or replaces it", async () => {
  const db = makeRepository({ destination: { spreadsheet_id: "definitive-spreadsheet", last_applied_spreadsheet_title: title, writer_mode: "oauth_user" } });
  const { calls, transport } = makeTransport({ getFile: async (id) => { calls.gets.push(id); if (id === folderId) return file(id, { mimeType: "application/vnd.google-apps.folder", appProperties: {} }); throw Object.assign(new Error("not found"), { response: { status: 404 } }); } });
  assert.equal(await runOne(dependencies(db, transport)), "needs_action");
  assert.equal(calls.searches, 0);
  assert.equal(calls.creates, 0);
  assert.equal(db.context.destination.spreadsheet_id, "definitive-spreadsheet");
});

test("manual spreadsheet rename is preserved", async () => {
  const db = makeRepository({ destination: { spreadsheet_id: "definitive-spreadsheet", last_applied_spreadsheet_title: "EntryFlow managed title", writer_mode: "oauth_user" } });
  const { calls, transport } = makeTransport({ getFile: async (id) => id === folderId ? file(id, { mimeType: "application/vnd.google-apps.folder", appProperties: {} }) : file(id, { name: "Human chosen title" }) });
  assert.equal(await runOne(dependencies(db, transport)), "ready");
  assert.deepEqual(calls.renames, []);
  assert.equal(db.context.destination.last_applied_spreadsheet_title, "EntryFlow managed title");
});

test("EntryFlow-managed title follows event rename on the same spreadsheet id", async () => {
  const db = makeRepository({
    event: { name: "Renamed event", start_at: "2026-09-20T20:00:00Z", timezone: "UTC" },
    destination: { spreadsheet_id: "definitive-spreadsheet", last_applied_spreadsheet_title: title, writer_mode: "oauth_user" },
  });
  const { calls, transport } = makeTransport({ getFile: async (id) => id === folderId ? file(id, { mimeType: "application/vnd.google-apps.folder", appProperties: {} }) : file(id, { name: title }) });
  assert.equal(await runOne(dependencies(db, transport)), "ready");
  assert.deepEqual(calls.renames, [["definitive-spreadsheet", "EntryFlow — Renamed event — 2026-09-20"]]);
  assert.equal(db.context.destination.spreadsheet_id, "definitive-spreadsheet");
  assert.equal(db.context.destination.last_applied_spreadsheet_title, "EntryFlow — Renamed event — 2026-09-20");
});

test("a Spreadsheet moved outside its Event folder needs action without move or replacement", async () => {
  const db = makeRepository({ destination: { spreadsheet_id: "definitive-spreadsheet", last_applied_spreadsheet_title: title, writer_mode: "oauth_user" } });
  const { calls, transport } = makeTransport({ getFile: async (id) => id === folderId ? file(id, { mimeType: "application/vnd.google-apps.folder", appProperties: {} }) : file(id, { parents: ["another-folder"] }) });
  assert.equal(await runOne(dependencies(db, transport)), "needs_action");
  assert.equal(calls.creates, 0);
  assert.deepEqual(calls.renames, []);
});

test("invalid_grant marks needs_reauth but preserves the Vault reference and secret", async () => {
  const db = makeRepository();
  const { calls, transport } = makeTransport({ getFile: async () => { throw new Error("invalid_grant"); } });
  const result = await runOne(dependencies(db, transport, async () => refreshTokenSentinel));
  assert.equal(result, "needs_reauth");
  assert.equal(db.context.integration.status, "needs_reauth");
  assert.equal(db.context.integration.oauth_secret_id, "vault-secret-reference");
  assert.equal(calls.creates, 0);
  assert.equal(JSON.stringify(db.failures).includes(refreshTokenSentinel), false);
});

test("429 and metadata/search 5xx are retryable", async () => {
  const rateDb = makeRepository();
  const rateTransport = makeTransport({ findManagedSpreadsheets: async () => { throw Object.assign(new Error("busy"), { response: { status: 429 } }); } });
  assert.equal(await runOne(dependencies(rateDb, rateTransport.transport)), "failed");
  assert.equal(rateDb.state, "retry");
  assert.equal(rateDb.failures[0]?.errorCode, "google_rate_limited");

  const serverDb = makeRepository();
  const serverTransport = makeTransport({ getFile: async () => { throw Object.assign(new Error("server error"), { response: { status: 503 } }); } });
  assert.equal(await runOne(dependencies(serverDb, serverTransport.transport)), "failed");
  assert.equal(serverDb.state, "retry");
  assert.equal(serverDb.failures[0]?.errorCode, "google_temporarily_unavailable");
});

test("403 scope insufficiency and permission denial are distinct structured outcomes", () => {
  const scope = classifySpreadsheetProvisioningError({ response: { status: 403, data: { error: { errors: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } } } }, "spreadsheet_search");
  const permission = classifySpreadsheetProvisioningError({ response: { status: 403, data: { error: { errors: [{ reason: "insufficientFilePermissions" }] } } } }, "spreadsheet_search");
  assert.deepEqual(scope, { status: "needs_action", code: "google_scope_insufficient" });
  assert.deepEqual(permission, { status: "needs_action", code: "google_permission_denied" });
});

test("token sentinel cannot enter failure metadata or returned errors", async () => {
  const db = makeRepository();
  const transport = makeTransport({ getFile: async () => { throw new Error(`untrusted provider detail ${refreshTokenSentinel}`); } });
  const result = await runOne(dependencies(db, transport.transport));
  assert.equal(result, "needs_action");
  assert.equal(JSON.stringify(db.failures).includes(refreshTokenSentinel), false);
  assert.equal(JSON.stringify(result).includes(refreshTokenSentinel), false);
});

test("OAuth transports share one refresh-token auth client and require no Service Account", () => {
  const auth = new google.auth.OAuth2("synthetic-client-id", "synthetic-client-secret", "http://localhost/callback");
  auth.setCredentials({ refresh_token: refreshTokenSentinel });
  let captured: unknown;
  const metadata = createGoogleSheetsOAuthMetadataTransportFromAuth(auth, (value) => {
    captured = value;
    return { spreadsheets: { get: async () => ({ data: { spreadsheetId: "s", properties: { title: "Test" } } }) } } as never;
  });
  const unified = createGoogleOAuthTransports;
  assert.equal(typeof unified, "function");
  assert.equal(captured, auth);
  assert.equal(auth.credentials.refresh_token, refreshTokenSentinel);
  assert.equal(typeof metadata.getSpreadsheetTitle, "function");
});

test("unified Drive and Sheets factories receive the identical OAuth client", async () => {
  const auth = new google.auth.OAuth2("synthetic-client-id", "synthetic-client-secret", "http://localhost/callback");
  const captured: unknown[] = [];
  const unified = createGoogleOAuthTransportsFromAuth(auth, {
    drive: (value) => { captured.push(value); return makeTransport().transport; },
    sheetsMetadata: (value) => {
      captured.push(value);
      return createGoogleSheetsOAuthMetadataTransportFromAuth(value, (client) => {
        assert.equal(client, auth);
        return { spreadsheets: { get: async (args: Record<string, unknown>) => {
          assert.deepEqual(args, { spreadsheetId: "synthetic-sheet-id", fields: "spreadsheetId,properties(title)" });
          return { data: { spreadsheetId: "synthetic-sheet-id", properties: { title: "Synthetic title" } } };
        } } } as never;
      });
    },
  });
  assert.deepEqual(captured, [auth, auth]);
  assert.deepEqual(await unified.sheetsMetadata.getSpreadsheetTitle("synthetic-sheet-id"), { spreadsheetId: "synthetic-sheet-id", title: "Synthetic title" });
  assert.equal("updateValues" in unified.sheetsMetadata, false);
});

test("Drive transport applies private exact appProperties and Event-folder parent on create/search", async () => {
  const auth = new google.auth.OAuth2("synthetic-client-id", "synthetic-client-secret", "http://localhost/callback");
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const api = {
    files: {
      list: async (args: Record<string, unknown>) => { calls.push({ method: "list", args }); return { data: { files: [] } }; },
      create: async (args: Record<string, unknown>) => { calls.push({ method: "create", args }); return { data: { id: "new-id", name: title, mimeType: GOOGLE_SPREADSHEET_MIME_TYPE, parents: [folderId], appProperties: markers } }; },
      get: async () => ({ data: {} }),
      update: async () => ({ data: {} }),
    },
  };
  const transport = createGoogleSpreadsheetDriveTransportFromApi(api as never);
  await transport.findManagedSpreadsheets(folderId, markers);
  await transport.createSpreadsheet(title, folderId, markers);
  const query = String(calls[0]?.args.q);
  assert.match(query, /appProperties has \{ key='eventId' and value='f4000000-0000-4000-8000-000000000015' \}/);
  assert.match(query, /appProperties has \{ key='organizationId' and value='f4000000-0000-4000-8000-000000000012' \}/);
  const requestBody = calls[1]?.args.requestBody as Record<string, unknown>;
  assert.deepEqual(requestBody.parents, [folderId]);
  assert.equal(requestBody.mimeType, GOOGLE_SPREADSHEET_MIME_TYPE);
  assert.deepEqual(requestBody.appProperties, markers);
  assert.equal(auth.credentials.refresh_token, undefined);
});
