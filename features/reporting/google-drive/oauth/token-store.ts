import { getSupabaseServerClient } from "@/lib/supabase/server";

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> };
function rpcClient(): RpcClient { return getSupabaseServerClient() as unknown as RpcClient; }

export class DriveVaultError extends Error {
  constructor(public readonly code: string, options?: { cause?: unknown }) { super(code, options); this.name = "DriveVaultError"; }
}


export async function createDriveRefreshTokenSecret(refreshToken: string, integrationId: string) {
  if (!refreshToken || !integrationId) throw new Error("drive_token_invalid_input");
  const { data, error } = await rpcClient().rpc("drive_vault_create_secret", {
    p_secret: refreshToken,
    p_name: `entryflow_drive_oauth_${integrationId}`,
    p_description: "EntryFlow Google Drive OAuth refresh token",
  });
  if (error || typeof data !== "string") {
    throw new DriveVaultError("drive_vault_create_failed", { cause: error ?? undefined });
  }
  return data;
}

export async function readDriveRefreshTokenSecret(secretId: string) {
  const { data, error } = await rpcClient().rpc("drive_vault_read_secret", { p_secret_id: secretId });
  if (error || typeof data !== "string" || !data) throw new Error("drive_vault_read_failed");
  return data;
}

export async function replaceDriveRefreshTokenSecret(secretId: string, refreshToken: string) {
  if (!secretId || !refreshToken) throw new Error("drive_token_invalid_input");
  const { error } = await rpcClient().rpc("drive_vault_update_secret", { p_secret_id: secretId, p_secret: refreshToken });
  if (error) throw new Error("drive_vault_update_failed");
}

export async function deleteDriveRefreshTokenSecret(secretId: string) {
  if (!secretId) return;
  const { data, error } = await rpcClient().rpc("drive_vault_delete_secret", { p_secret_id: secretId });
  if (error || data !== true) throw new Error("drive_vault_delete_failed");
}
