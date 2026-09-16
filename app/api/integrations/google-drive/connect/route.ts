import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createGoogleOAuthClient, generateGoogleAuthorizationUrl, readGoogleOAuthConfig, GoogleOAuthError } from "@/features/reporting/google-drive/oauth/google-oauth-client";
import { createOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from "@/features/reporting/google-drive/oauth/state";
import { requireDriveOrganizationManager } from "@/lib/reporting/google-drive-authz";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId")?.trim() ?? "";
  try { await requireDriveOrganizationManager(organizationId); const config = readGoogleOAuthConfig(); const state = createOAuthState((await requireDriveOrganizationManager(organizationId)).user.id, organizationId); (await cookies()).set(GOOGLE_OAUTH_STATE_COOKIE, state.cookieValue, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: state.maxAge, path: "/" }); return NextResponse.redirect(generateGoogleAuthorizationUrl(createGoogleOAuthClient(config), state.state, state.codeChallenge)); } catch (error) { const code = error instanceof GoogleOAuthError ? error.code : error instanceof Error && error.message === "forbidden" ? "forbidden" : "unauthenticated"; return NextResponse.json({ ok: false, error: code }, { status: code === "forbidden" ? 403 : code === "google_oauth_not_configured" ? 503 : 401 }); }
}
