import { createHash, createHmac, randomBytes } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "entryflow_google_drive_oauth_state";
const TTL_SECONDS = 600;
type OAuthState = { nonce: string; userId: string; organizationId: string; verifier: string; expiresAt: number };
function key() { const value = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!value) throw new Error("oauth_state_key_missing"); return value; }
function encode(value: OAuthState) { const body = Buffer.from(JSON.stringify(value)).toString("base64url"); const sig = createHmac("sha256", key()).update(body).digest("base64url"); return `${body}.${sig}`; }
function decode(value: string): OAuthState | null { const [body, sig] = value.split("."); if (!body || !sig) return null; const expected = createHmac("sha256", key()).update(body).digest("base64url"); if (sig.length !== expected.length || !createHash("sha256").update(sig).digest().equals(createHash("sha256").update(expected).digest())) return null; try { const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState; return parsed.expiresAt > Math.floor(Date.now() / 1000) ? parsed : null; } catch { return null; } }
export function createOAuthState(userId: string, organizationId: string) { const verifier = randomBytes(32).toString("base64url"); const state: OAuthState = { nonce: randomBytes(24).toString("base64url"), userId, organizationId, verifier, expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS }; return { cookieValue: encode(state), state: state.nonce, verifier, codeChallenge: createHash("sha256").update(verifier).digest("base64url"), maxAge: TTL_SECONDS }; }
export function parseOAuthState(value: string | undefined) { return value ? decode(value) : null; }
