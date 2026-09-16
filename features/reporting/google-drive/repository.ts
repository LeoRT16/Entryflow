/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type GoogleDriveIntegrationStatus = { connected: boolean; enabled: boolean; status: "connected" | "needs_reauth" | "error" | "disabled" | null; accountEmail: string | null; rootFolderId: string | null; lastVerifiedAt: string | null; errorCode: string | null };
export async function getGoogleDriveIntegrationStatus(client: SupabaseClient<Database>, organizationId: string): Promise<GoogleDriveIntegrationStatus> {
  const { data, error } = await (client as any).from("reporting_drive_integrations").select("enabled,status,google_account_email,organization_drive_folder_id,last_verified_at,last_error_code").eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  if (error) throw error; const row = data as any;
  return { connected: row?.status === "connected" && row?.enabled === true, enabled: row?.enabled === true, status: row?.status ?? null, accountEmail: row?.google_account_email ?? null, rootFolderId: row?.organization_drive_folder_id ?? null, lastVerifiedAt: row?.last_verified_at ?? null, errorCode: row?.last_error_code ?? null };
}
