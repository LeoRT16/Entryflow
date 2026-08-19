import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { hasSupabaseConfig, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/helpers";

let serverClient: SupabaseClient<Database> | null = null;

export function getSupabaseServerClient() {
  if (serverClient) {
    return serverClient;
  }

  if (!hasSupabaseConfig()) {
    return null;
  }

  // Server-only service role client. Tenant scope must be enforced by the
  // caller, ideally through the canonical workspace loader.
  serverClient = createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey() || "", {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return serverClient;
}
