import { google, type Auth } from "googleapis";

export const GOOGLE_DRIVE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
  "profile",
] as const;

export type GoogleOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };
export type GoogleOAuthErrorCode = "google_oauth_not_configured" | "google_oauth_code_exchange_failed" | "google_oauth_refresh_failed";
export class GoogleOAuthError extends Error { constructor(public readonly code: GoogleOAuthErrorCode, message: string) { super(message); this.name = "GoogleOAuthError"; } }


export function readGoogleOAuthConfig(env: NodeJS.ProcessEnv = process.env): GoogleOAuthConfig {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new GoogleOAuthError("google_oauth_not_configured", "Google Drive OAuth is not configured.");
  return { clientId, clientSecret, redirectUri };
}

export function createGoogleOAuthClient(config = readGoogleOAuthConfig()) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export function generateGoogleAuthorizationUrl(client: Auth.OAuth2Client, state: string, codeChallenge: string, forceConsent = true) {
  return client.generateAuthUrl({ access_type: "offline", include_granted_scopes: true, prompt: forceConsent ? "consent" : undefined, response_type: "code", scope: [...GOOGLE_DRIVE_OAUTH_SCOPES], state, code_challenge: codeChallenge, code_challenge_method: "S256" as never });
}

export async function exchangeGoogleAuthorizationCode(client: Auth.OAuth2Client, code: string, verifier: string) {
  try {
    if (!code || !verifier) throw new Error("missing_exchange_parameter");
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    return tokens;
  } catch (error) {
    throw new GoogleOAuthError("google_oauth_code_exchange_failed", "Google authorization could not be completed.");
  }
}

export function setGoogleOAuthCredentials(client: Auth.OAuth2Client, refreshToken: string) { client.setCredentials({ refresh_token: refreshToken }); return client; }

export async function getGoogleIdentity(client: Auth.OAuth2Client, idToken?: string) {
  if (!idToken) throw new GoogleOAuthError("google_oauth_code_exchange_failed", "Google identity was not returned.");
  try { const ticket = await client.verifyIdToken({ idToken, audience: readGoogleOAuthConfig().clientId }); const payload = ticket.getPayload(); if (!payload?.sub || !payload.email) throw new Error(); return { providerAccountId: payload.sub, email: payload.email }; } catch { throw new GoogleOAuthError("google_oauth_code_exchange_failed", "Google identity could not be verified."); }
}
