import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { ensureSupabaseServiceConfig } from "@/lib/supabase/helpers";

let serverClient: SupabaseClient<Database> | null = null;

export function getSupabaseServerClient() {
  return getSupabaseServerClientFromEnv(process.env);
}

export function getSupabaseServerClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  if (serverClient) {
    return serverClient;
  }

  // Server-only service role client. Tenant scope must be enforced by the
  // caller, ideally through the canonical workspace loader.
  const { url, serviceRoleKey } = ensureSupabaseServiceConfig(env);

  serverClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return serverClient;
}

export function resetSupabaseServerClientForTests() {
  serverClient = null;
}
