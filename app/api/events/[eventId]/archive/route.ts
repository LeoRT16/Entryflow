import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

type EventRow = { id:string; organization_id:string; status:string; deleted_at:string|null };
type Result = { data:EventRow|null; error:Error|null };
type Chain = { eq(column:string,value:string): Chain; is(column:string,value:null): Chain; not(column:string,operator:string,value:string): Chain; maybeSingle(): Promise<Result>; select(columns:string): Chain };
type Table = { select(columns:string): Chain; update(values:{deleted_at:string|null}): Chain };
async function authorize(eventId:string) {
  const user = await getSupabaseAuthUser();
  if (!user) return {response:NextResponse.json({ok:false,error:{code:"unauthenticated"}},{status:401})} as const;
  const workspace = await loadWorkspaceBootstrap({id:user.id,email:user.email});
  if (workspace.authState.status !== "ready") return {response:NextResponse.json({ok:false,error:{code:"forbidden"}},{status:403})} as const;
  const profile = workspace.profiles.find((item)=>item.id===workspace.currentProfileId && !item.deletedAt);
  const role = workspace.roles.find((item)=>item.id===profile?.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({permissions:profile?.metadata?.permissions,rolePermissions:role.permissions,roleMetadata:role.metadata,accountMetadata:profile?.metadata});
  if (!workspace.isPlatformRoot && !permissions.includes("event.delete")) return {response:NextResponse.json({ok:false,error:{code:"event_archive_forbidden"}},{status:403})} as const;
  const client = await getSupabaseServerClient();
  const table = (client as unknown as {from(name:string):Table}).from("events");
  const lookup = table.select("id,organization_id,status,deleted_at").eq("id",eventId);
  const found = await (workspace.isPlatformRoot ? lookup : lookup.eq("organization_id",workspace.currentOrganizationId)).maybeSingle();
  if (found.error || !found.data) return {response:NextResponse.json({ok:false,error:{code:"event_not_found"}},{status:404})} as const;
  return {table,event:found.data} as const;
}
export async function PATCH(request:Request, context:{params:Promise<{eventId:string}>}) {
  const {eventId}=await context.params; const authorized=await authorize(eventId); if ("response" in authorized) return authorized.response;
  const body=await request.json().catch(()=>({})); const archived=body?.archived===true;
  if (archived && authorized.event.deleted_at !== null) return NextResponse.json({ok:true,eventId,archived:true,status:authorized.event.status});
  if (!archived && authorized.event.deleted_at === null) return NextResponse.json({ok:true,eventId,archived:false,status:authorized.event.status});
  if (archived && authorized.event.status !== "finished") return NextResponse.json({ok:false,error:{code:"event_must_be_finished"}},{status:422});
  const chain=authorized.table.update({deleted_at:archived?new Date().toISOString():null}).eq("id",eventId).eq("organization_id",authorized.event.organization_id);
  if (archived) chain.eq("status", "finished");
  const result=await (archived?chain.is("deleted_at",null):chain.not("deleted_at","is","null")).select("id,organization_id,status,deleted_at").maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ok:false,error:{code:"event_archive_conflict"}},{status:409});
  return NextResponse.json({ok:true,eventId,archived:result.data.deleted_at!==null,status:result.data.status});
}
