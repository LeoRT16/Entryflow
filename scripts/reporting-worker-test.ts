import { execFileSync } from "node:child_process";
import { createGoogleSheetsTransport } from "../features/reporting/google-sheets/client";
import { createReportingWorkerRepository, processReportingSyncBatch } from "../features/reporting/sync/worker";
import { getSupabaseServerClient } from "../lib/supabase/server";
import { loadWorkspaceBootstrap } from "../services/workspace-loader";
import { buildEventReport } from "../features/reporting/domain/event-report";

function configureLocalSupabase() {
  const output = execFileSync("npx", ["supabase@2.117.0", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const values = new Map(output.split("\n").flatMap((line) => { const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/); return match ? [[match[1], match[2] ?? match[3] ?? ""]] : []; }));
  const url = values.get("API_URL") ?? ""; const anon = values.get("ANON_KEY") ?? values.get("PUBLISHABLE_KEY") ?? ""; const service = values.get("SERVICE_ROLE_KEY") ?? "";
  if (url !== "http://127.0.0.1:54321" || !anon || !service) throw new Error("Aborted: Supabase local status could not be verified safely.");
  process.env.NEXT_PUBLIC_SUPABASE_URL = url; process.env.SUPABASE_URL = url; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon; process.env.SUPABASE_ANON_KEY = anon; process.env.SUPABASE_SERVICE_ROLE_KEY = service;
}

async function main() {
  configureLocalSupabase();
  const workerId = process.env.REPORTING_WORKER_ID ?? `manual-${process.pid}`;
  const eventId = process.env.REPORTING_EVENT_ID;
  const authUserId = process.env.LOCAL_AUTH_USER_ID;
  if (!eventId || !authUserId) throw new Error("REPORTING_EVENT_ID and LOCAL_AUTH_USER_ID are required.");
  const workspace = await loadWorkspaceBootstrap({ id: authUserId, email: process.env.LOCAL_AUTH_EMAIL ?? undefined });
  const event = workspace.events.find((item) => item.id === eventId);
  const organization = workspace.organizations.find((item) => item.id === event?.organizationId);
  const venue = workspace.venues.find((item) => item.id === event?.venueId);
  if (!event || !organization) throw new Error("Requested local Event was not found.");
  const client = getSupabaseServerClient();
  const result = await processReportingSyncBatch({ repository: createReportingWorkerRepository(client), transport: createGoogleSheetsTransport(), loadReport: async (requestedEventId) => { if (requestedEventId !== eventId) throw new Error("Worker event scope mismatch."); return buildEventReport({ organization, event, venue, resources: workspace.resources, sectors: workspace.sectors, tables: workspace.tables, eventLayoutResources: workspace.eventLayoutResources, eventLayoutSectors: workspace.eventLayoutSectors, eventLayouts: workspace.eventLayouts, reservations: workspace.reservations, guests: workspace.guests, extraWristbandSales: workspace.extraWristbandSales ?? [], checkIns: workspace.checkIns, timelineEvents: workspace.timelineEvents, generatedAt: new Date().toISOString() }); } }, workerId, 1);
  console.log(JSON.stringify(result));
}

main().catch(() => { console.error("Reporting worker test failed safely."); process.exitCode = 1; });
