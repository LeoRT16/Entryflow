"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { hasSupabaseConfig, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/helpers";

let browserClient: SupabaseClient<Database> | null = null;

const JWT_ISSUED_AT_FUTURE_SKEW_SECONDS = 60;

function decodeJwtPayload(token: string) {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = globalThis.atob(paddedBase64);
    return JSON.parse(json) as { iat?: number; nbf?: number } | null;
  } catch {
    return null;
  }
}

function hasJwtIssuedAtFuture(accessToken: string) {
  const payload = decodeJwtPayload(accessToken);

  if (!payload?.iat) {
    return false;
  }

  const issuedAt = Number(payload.iat);

  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  return issuedAt > currentTime + JWT_ISSUED_AT_FUTURE_SKEW_SECONDS;
}

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  if (!hasSupabaseConfig()) {
    return null;
  }

  browserClient = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return browserClient;
}

export async function clearInvalidSupabaseBrowserSession(client = getSupabaseBrowserClient()) {
  if (!client || typeof window === "undefined") {
    return false;
  }

  const { data } = await client.auth.getSession();
  const session = data.session;

  if (!session?.access_token) {
    return false;
  }

  if (!hasJwtIssuedAtFuture(session.access_token)) {
    return false;
  }

  await client.auth.signOut({ scope: "local" });
  return true;
}
