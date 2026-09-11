import { buildEventReport } from "../features/reporting/domain/event-report";
import { buildGoogleSheetsProjection, buildWorkbookDatasetHashInput, hashWorkbookDataset } from "../features/reporting/google-sheets/workbook-projection";
import { writeWorkbookProjection, createGoogleSheetsTransport } from "../features/reporting/google-sheets/client";
import { loadWorkspaceBootstrap } from "../services/workspace-loader";
import { getSupabaseUrl } from "../lib/supabase/helpers";
import { execFileSync } from "node:child_process";

function readLocalSupabaseEnv() {
  const output = execFileSync("npx", ["supabase@2.117.0", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const values = new Map(output.split("\n").flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/);
    return match ? [[match[1], match[2] ?? match[3] ?? ""]] : [];
  }));
  const url = values.get("API_URL") ?? "";
  const anonKey = values.get("ANON_KEY") ?? values.get("PUBLISHABLE_KEY") ?? "";
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") ?? "";
  if (url !== "http://127.0.0.1:54321" || !anonKey || !serviceRoleKey) throw new Error("Aborted: Supabase local status could not be verified safely.");
  return { url, anonKey, serviceRoleKey };
}

async function main() {
  const args = new Map(process.argv.slice(2).reduce<Array<[string, string]>>((pairs, value, index, values) => value.startsWith("--") ? [...pairs, [value.slice(2), values[index + 1] ?? ""]] : pairs, []));
  const eventId = args.get("event");
  const spreadsheetId = args.get("spreadsheet");
  const authUserId = process.env.LOCAL_AUTH_USER_ID;
  if (!eventId || !spreadsheetId || !authUserId) throw new Error("Usage: npm run reporting:google-test -- --event <id> --spreadsheet <id> with LOCAL_AUTH_USER_ID set.");
  const localSupabase = readLocalSupabaseEnv();
  process.env.NEXT_PUBLIC_SUPABASE_URL = localSupabase.url;
  process.env.SUPABASE_URL = localSupabase.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = localSupabase.anonKey;
  process.env.SUPABASE_ANON_KEY = localSupabase.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = localSupabase.serviceRoleKey;
  if (getSupabaseUrl() !== "http://127.0.0.1:54321") throw new Error("Aborted: reporting Google test only permits Supabase local at http://127.0.0.1:54321.");

  const workspace = await loadWorkspaceBootstrap({ id: authUserId, email: process.env.LOCAL_AUTH_EMAIL ?? undefined });
  const event = workspace.events.find((item) => item.id === eventId);
  const organization = workspace.organizations.find((item) => item.id === event?.organizationId);
  const venue = workspace.venues.find((item) => item.id === event?.venueId);
  if (!event || !organization) throw new Error("Requested local Event was not found.");
  const report = buildEventReport({ organization, event, venue, resources: workspace.resources, sectors: workspace.sectors, tables: workspace.tables, eventLayoutResources: workspace.eventLayoutResources, eventLayoutSectors: workspace.eventLayoutSectors, eventLayouts: workspace.eventLayouts, reservations: workspace.reservations, guests: workspace.guests, extraWristbandSales: workspace.extraWristbandSales ?? [], checkIns: workspace.checkIns, timelineEvents: workspace.timelineEvents, generatedAt: new Date().toISOString() });
  const projection = buildGoogleSheetsProjection(report);
  const datasetHash = hashWorkbookDataset(buildWorkbookDatasetHashInput(projection));
  const result = await writeWorkbookProjection(createGoogleSheetsTransport(), spreadsheetId, projection, datasetHash);
  console.log(JSON.stringify({ eventId, spreadsheetId: result.spreadsheetId, datasetHash, rowCounts: Object.fromEntries(Object.entries(projection.sheets).map(([name, sheet]) => [name, sheet.rows.length])), sheetsUpdated: result.sheetsUpdated }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Reporting Google test failed.";
  console.error(message.includes("private key") || message.includes("token") || message.includes("secret") ? "Reporting Google test failed safely." : message);
  process.exitCode = 1;
});
