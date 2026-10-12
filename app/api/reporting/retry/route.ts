import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { classifyReportingFailure, isOperatorRetryEligible } from "@/features/reporting/recovery";

export const runtime="nodejs"; export const dynamic="force-dynamic";
// The generated Supabase schema omits reporting tables; keep this adapter scoped to this route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db={from(table:string):any;rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:Error|null}>};
async function canAccess(eventId:string, requireEdit=false) {
  const user=await getSupabaseAuthUser(); if(!user) return false;
  const workspace=await loadWorkspaceBootstrap({id:user.id,email:user.email}); if(workspace.authState.status!=="ready") return false;
  const event=workspace.events.find((candidate)=>candidate.id===eventId && candidate.organizationId===workspace.currentOrganizationId); if(!event) return false;
  const profile=workspace.profiles.find((candidate)=>candidate.id===workspace.currentProfileId && candidate.organizationId===workspace.currentOrganizationId && !candidate.deletedAt);
  const role=workspace.roles.find((candidate)=>candidate.id===profile?.roleId) ?? getRolePresetBySlug("administrator");
  const permissions=resolveAccountPermissions({permissions:profile?.metadata?.permissions,rolePermissions:role.permissions,roleMetadata:role.metadata,accountMetadata:profile?.metadata});
  return permissions.includes(requireEdit?"event.edit":"event.view");
}
export async function GET(request:Request) {
  const eventId=new URL(request.url).searchParams.get("eventId")??""; if(!eventId) return NextResponse.json({eligible:false});
  if(!(await canAccess(eventId))) return NextResponse.json({eligible:false});
  const client=await getSupabaseAuthUser(); if(!client) return NextResponse.json({eligible:false});
  const db=await getSupabaseServerClient() as unknown as Db;
  const destination=await db.from("reporting_destinations").select("id").eq("event_id",eventId).is("deleted_at",null).maybeSingle();
  if(destination.error||!destination.data?.id) return NextResponse.json({eligible:false});
  const outbox=await db.from("reporting_outbox").select("id,status,last_error,updated_at").eq("destination_id",destination.data.id).maybeSingle();
  if(outbox.error||!outbox.data) return NextResponse.json({eligible:false});
  const code=typeof outbox.data.last_error==="string"?outbox.data.last_error.split(":",1)[0]:null;
  return NextResponse.json({eligible:outbox.data.status==="dead"&&isOperatorRetryEligible(code),outboxId:outbox.data.id,category:classifyReportingFailure(code,true),lastFailureAt:outbox.data.updated_at??null});
}
export async function POST(request:Request) {
  const body=await request.json().catch(()=>null) as {outboxId?:unknown}|null; const outboxId=typeof body?.outboxId==="string"?body.outboxId:""; if(!outboxId) return NextResponse.json({error:"outbox_required"},{status:400});
  const db=await getSupabaseServerClient() as unknown as Db; const outbox=await db.from("reporting_outbox").select("event_id").eq("id",outboxId).maybeSingle();
  if(outbox.error||!outbox.data?.event_id||!(await canAccess(String(outbox.data.event_id),true))) return NextResponse.json({error:"reporting_retry_rejected"},{status:403});
  const {data,error}=await db.rpc("retry_reporting_terminal_work",{p_outbox_id:outboxId}); if(error) return NextResponse.json({error:"reporting_retry_rejected"},{status:error.message.includes("forbidden")?403:409});
  return NextResponse.json({ok:data===true});
}
