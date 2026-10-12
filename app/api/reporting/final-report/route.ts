import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

type Db = { from(table:string): { select(columns:string): { eq(column:string,value:string): { maybeSingle(): Promise<{data:Record<string,unknown>|null;error:Error|null}> } } }; rpc(name:string,args:Record<string,unknown>): Promise<{data:unknown;error:{message?:string;code?:string}|null}> };
async function authorizeEvent(eventId:string, permission:"event.view"|"event.edit") {
  const user=await getSupabaseAuthUser();
  if (!user) return { response: NextResponse.json({error:"unauthorized"},{status:401}) } as const;
  const workspace=await loadWorkspaceBootstrap({id:user.id,email:user.email});
  if (workspace.authState.status!=="ready") return { response: NextResponse.json({error:"forbidden"},{status:403}) } as const;
  const event=workspace.events.find((candidate)=>candidate.id===eventId && candidate.organizationId===workspace.currentOrganizationId);
  const profile=workspace.profiles.find((candidate)=>candidate.id===workspace.currentProfileId && candidate.organizationId===workspace.currentOrganizationId && !candidate.deletedAt);
  const role=workspace.roles.find((candidate)=>candidate.id===profile?.roleId) ?? getRolePresetBySlug("administrator");
  const permissions=resolveAccountPermissions({permissions:profile?.metadata?.permissions,rolePermissions:role.permissions,roleMetadata:role.metadata,accountMetadata:profile?.metadata});
  if (!event || !permissions.includes(permission)) return { response: NextResponse.json({error:"forbidden"},{status:403}) } as const;
  return { event } as const;
}
function eventIdFrom(request:Request) { return new URL(request.url).searchParams.get("eventId") ?? ""; }
export async function GET(request:Request) {
  const eventId=eventIdFrom(request); if (!eventId) return NextResponse.json({error:"event_required"},{status:400});
  const authorized=await authorizeEvent(eventId,"event.view"); if ("response" in authorized) return authorized.response;
  const client=await createSupabaseAuthServerClient(); if (!client) return NextResponse.json({error:"supabase_unconfigured"},{status:503});
  const result=await (client as unknown as Db).from("reporting_final_report_jobs").select("id,event_id,status,attempts,drive_file_id,drive_file_url,last_error_code,updated_at").eq("event_id",eventId).maybeSingle();
  if (result.error) return NextResponse.json({error:"final_report_unavailable"},{status:500});
  return NextResponse.json({job:result.data ?? null});
}
export async function POST(request:Request) {
  const client=await createSupabaseAuthServerClient(); if (!client) return NextResponse.json({error:"supabase_unconfigured"},{status:503});
  const body=await request.json().catch(()=>({})); const eventId=typeof body.eventId==="string"?body.eventId:""; if (!eventId) return NextResponse.json({error:"event_required"},{status:400});
  const authorized=await authorizeEvent(eventId,"event.edit"); if ("response" in authorized) return authorized.response;
  const db=client as unknown as Db; const first=await db.from("reporting_event_revisions").select("revision").eq("event_id",eventId).maybeSingle();
  if (first.error || first.data?.revision===undefined) return NextResponse.json({error:"reporting_revision_unavailable"},{status:409});
  const {loadEventReportForWorker}=await import("@/features/reporting/server/event-report-worker-loader");
  const report=await loadEventReportForWorker(client as never,{eventId,organizationId:authorized.event.organizationId});
  const second=await db.from("reporting_event_revisions").select("revision").eq("event_id",eventId).maybeSingle();
  if (second.error || second.data?.revision!==first.data.revision) return NextResponse.json({error:"final_report_revision_conflict"},{status:409});
  const result=await db.rpc("transition_event_status",{p_event_id:eventId,p_next_status:"finished",p_report:report,p_expected_revision:first.data.revision});
  if (result.error) return NextResponse.json({error:result.error.message ?? "finalization_failed"},{status:result.error.code==="40001"?409:400});
  return NextResponse.json(result.data);
}
export async function PATCH(request:Request) {
  const client=await createSupabaseAuthServerClient(); if (!client) return NextResponse.json({error:"supabase_unconfigured"},{status:503});
  const body=await request.json().catch(()=>({})); const eventId=typeof body.eventId==="string"?body.eventId:""; if (!eventId) return NextResponse.json({error:"event_required"},{status:400});
  const authorized=await authorizeEvent(eventId,"event.edit"); if ("response" in authorized) return authorized.response;
  const result=await (client as unknown as Db).rpc("retry_reporting_final_report_job",{p_event_id:eventId});
  if (result.error) return NextResponse.json({error:result.error.message ?? "retry_not_eligible"},{status:400});
  return NextResponse.json({ok:true});
}
