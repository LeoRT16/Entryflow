import { NextResponse } from "next/server";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

type ArchivedRow = { id:string; organization_id:string; name:string; description:string|null; event_type:string; status:string; start_at:string; end_at:string|null; timezone:string; venue_id:string|null; venue:string|null; deleted_at:string|null };
type EventsQuery = { eq(column:string,value:string): EventsQuery; not(column:string,operator:string,value:string): Promise<{data:ArchivedRow[]|null;error:Error|null}> };
type EventsTable = { select(columns:string): EventsQuery };
export async function GET(request: Request) {
  const user = await getSupabaseAuthUser();
  if (!user) return NextResponse.json({ok:false,error:{code:"unauthenticated"}},{status:401});
  const workspace = await loadWorkspaceBootstrap({id:user.id,email:user.email});
  if (workspace.authState.status !== "ready") return NextResponse.json({ok:false,error:{code:"forbidden"}},{status:403});
  const profile = workspace.profiles.find((item)=>item.id===workspace.currentProfileId && !item.deletedAt);
  const role = workspace.roles.find((item)=>item.id===profile?.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({permissions:profile?.metadata?.permissions,rolePermissions:role.permissions,roleMetadata:role.metadata,accountMetadata:profile?.metadata});
  if (!permissions.includes("event.view")) return NextResponse.json({ok:false,error:{code:"event_history_forbidden"}},{status:403});
  const client = await getSupabaseServerClient();
  const table = (client as unknown as {from(name:string):EventsTable}).from("events");
  const requestedOrganizationId = new URL(request.url).searchParams.get("organizationId") ?? workspace.currentOrganizationId;
  const allowedOrganization = workspace.organizations.some((organization) => organization.id === requestedOrganizationId);
  if (!allowedOrganization) return NextResponse.json({ok:false,error:{code:"event_history_forbidden"}},{status:403});
  const lookup = table.select("id,organization_id,name,description,event_type,status,start_at,end_at,timezone,venue_id,venue,deleted_at").eq("organization_id",requestedOrganizationId);
  const result = await lookup.not("deleted_at","is","null");
  if (result.error) return NextResponse.json({ok:false,error:{code:"event_history_failed"}},{status:500});
  return NextResponse.json({ok:true,events:result.data ?? []});
}
