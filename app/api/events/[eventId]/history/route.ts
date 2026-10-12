import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

type Row = Record<string, unknown>;
type Query = { data: Row[] | Row | null; error: Error | null };
type Builder = { eq(column:string,value:string): Builder; is(column:string,value:null): Builder; select(columns:string): Builder; maybeSingle(): Promise<Query> };
type Client = { from(name:string): { select(columns:string): Builder } };

export async function GET(_request: Request, context: { params: Promise<{ eventId:string }> }) {
  const user = await getSupabaseAuthUser();
  if (!user) return NextResponse.json({ok:false,error:{code:"unauthenticated"}},{status:401});
  const workspace = await loadWorkspaceBootstrap({id:user.id,email:user.email});
  if (workspace.authState.status !== "ready") return NextResponse.json({ok:false,error:{code:"forbidden"}},{status:403});
  const profile = workspace.profiles.find((item)=>item.id===workspace.currentProfileId && !item.deletedAt);
  const role = workspace.roles.find((item)=>item.id===profile?.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({permissions:profile?.metadata?.permissions,rolePermissions:role.permissions,roleMetadata:role.metadata,accountMetadata:profile?.metadata});
  if (!permissions.includes("event.view")) return NextResponse.json({ok:false,error:{code:"event_history_forbidden"}},{status:403});
  const client = (await getSupabaseServerClient()) as unknown as Client;
  const eventResult = await client.from("events").select("*").eq("id",(await context.params).eventId).eq("organization_id",workspace.currentOrganizationId).maybeSingle();
  const event = eventResult.data as Row | null;
  if (eventResult.error || !event) return NextResponse.json({ok:false,error:{code:"event_not_found"}},{status:404});
  if (event.deleted_at === null || event.deleted_at === undefined) return NextResponse.json({ok:false,error:{code:"event_not_archived"}},{status:409});
  const eventId = String(event.id);
  const read = async (table:string, columns="*") => {
    const result = await (client.from(table).select(columns).eq("event_id",eventId) as unknown as Promise<Query>);
    return result.error ? [] : (Array.isArray(result.data) ? result.data : []);
  };
  const [reservations, guests, checkins, activity, extraWristbands, destinations, outbox, finalSnapshots, finalReportJobs, driveLocations, eventLayouts, layoutResources] = await Promise.all([
    read("reservations"), read("guests"), read("check_ins"), read("timeline_events"), read("extra_wristband_sales"),
    read("reporting_destinations"), read("reporting_outbox"), read("reporting_final_snapshots"), read("reporting_final_report_jobs"),
    read("event_drive_locations"), read("event_layouts"), read("event_layout_resources"),
  ]);
  const admitted = checkins.filter((item) => item.status === "completed" || item.status === "admitted" || item.status === "used").length;
  const statistics = { reservations: reservations.length, guests: guests.length, admissions: admitted, pendingGuests: Math.max(guests.length - admitted, 0), extraWristbands: extraWristbands.length };
  return NextResponse.json({ok:true,event,reservations,guests,checkins,activity,extraWristbands,statistics,resources:{eventLayouts,layoutResources},reporting:{destinations,outbox,finalSnapshots,finalReportJobs,driveLocations},readOnly:true});
}
