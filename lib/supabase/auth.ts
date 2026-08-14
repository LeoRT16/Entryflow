import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/types";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseConfig } from "@/lib/supabase/helpers";

type CookieSnapshot = {
  name: string;
  value: string;
};

type CookieStoreLike = {
  getAll(): CookieSnapshot[];
  set(name: string, value: string, options?: CookieOptions): void;
};

function createCookieAdapter(cookieStore: CookieStoreLike) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
      try {
        for (const cookie of cookiesToSet) {
          cookieStore.set(cookie.name, cookie.value, cookie.options);
        }
      } catch {
        // Server components can expose a read-only cookie store. Middleware
        // and route handlers handle the actual refresh writes.
      }
    },
  };
}

export async function createSupabaseAuthServerClient() {
  const cookieStore = await cookies();

  if (!hasSupabaseConfig()) {
    return null;
  }

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: createCookieAdapter(cookieStore as unknown as CookieStoreLike),
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export async function getSupabaseAuthUser() {
  const client = await createSupabaseAuthServerClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
}
