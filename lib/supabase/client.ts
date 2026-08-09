"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { hasSupabaseConfig, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/helpers";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  if (!hasSupabaseConfig()) {
    return null;
  }

  browserClient = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return browserClient;
}
