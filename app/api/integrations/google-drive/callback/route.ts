/* eslint-disable @typescript-eslint/no-explicit-any */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createGoogleOAuthClient, exchangeGoogleAuthorizationCode, getGoogleIdentity, readGoogleOAuthConfig, GoogleOAuthError } from "@/features/reporting/google-drive/oauth/google-oauth-client";
import { GOOGLE_OAUTH_STATE_COOKIE, parseOAuthState } from "@/features/reporting/google-drive/oauth/state";
import { createDriveRefreshTokenSecret, DriveVaultError, replaceDriveRefreshTokenSecret } from "@/features/reporting/google-drive/oauth/token-store";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { requireDriveOrganizationManager } from "@/lib/reporting/google-drive-authz";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url); const store = await cookies(); const saved = parseOAuthState(store.get(GOOGLE_OAUTH_STATE_COOKIE)?.value); const user = await getSupabaseAuthUser();
  if (!saved || !user || saved.userId !== user.id || saved.expiresAt <= Math.floor(Date.now() / 1000)) return NextResponse.json({ ok: false, error: "google_oauth_state_invalid" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { await requireDriveOrganizationManager(saved.organizationId); const client = createGoogleOAuthClient(readGoogleOAuthConfig()); const authorizationCode = url.searchParams.get("code") ?? ""; const tokens = await exchangeGoogleAuthorizationCode(client, authorizationCode, saved.verifier); if (!tokens.refresh_token) return NextResponse.json({ ok: false, error: "google_oauth_refresh_token_missing" }, { status: 400 }); const identity = await getGoogleIdentity(client, tokens.id_token ?? undefined); const db = getSupabaseServerClient() as any; const existing = await db.from("reporting_drive_integrations").select("id,oauth_secret_id,provider_account_id").eq("organization_id", saved.organizationId).is("deleted_at", null).maybeSingle(); if (existing.error) throw existing.error;
    if (existing.data?.provider_account_id && existing.data.provider_account_id !== identity.providerAccountId) throw new GoogleOAuthError("google_oauth_account_mismatch", "Google account does not match the existing organization connection."); let secretId = typeof existing.data?.oauth_secret_id === "string" ? existing.data.oauth_secret_id : null;
    let createdSecretId: string | null = null;
    if (secretId) {
      try { await replaceDriveRefreshTokenSecret(secretId, tokens.refresh_token); } catch { secretId = null; }
    }
    if (!secretId) { createdSecretId = await createDriveRefreshTokenSecret(tokens.refresh_token, `pending-${saved.organizationId}`); secretId = createdSecretId; }
    const payload = { organization_id: saved.organizationId, provider: "google_drive", auth_mode: "oauth_user", provider_account_id: identity.providerAccountId, google_account_email: identity.email, oauth_secret_id: secretId, enabled: true, status: "connected", manage_root_name: true }; const result = existing.data ? await db.from("reporting_drive_integrations").update(payload).eq("id", existing.data.id) : await db.from("reporting_drive_integrations").insert(payload); if (result.error) { if (createdSecretId) await db.rpc("drive_vault_delete_secret", { p_secret_id: createdSecretId }); throw result.error; } if (existing.data?.oauth_secret_id && existing.data.oauth_secret_id !== secretId) await db.rpc("drive_vault_delete_secret", { p_secret_id: existing.data.oauth_secret_id }); const recovery = await db.rpc("recover_reporting_google_authorization", { p_organization_id: saved.organizationId }); if (recovery.error) throw recovery.error; store.delete(GOOGLE_OAUTH_STATE_COOKIE); return NextResponse.redirect(new URL("/settings?googleDrive=connected", request.url)); } catch (error) { const code = error instanceof GoogleOAuthError || error instanceof DriveVaultError ? error.code : "google_oauth_code_exchange_failed"; if (code === "google_oauth_account_mismatch") return NextResponse.redirect(new URL("/settings?googleDrive=account_mismatch", request.url)); return NextResponse.json({ ok: false, error: code }, { status: 400 }); }
}
