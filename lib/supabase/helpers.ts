import type { Database, Json } from "@/lib/supabase/types";

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
}

export function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function hasSupabaseConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function ensureSupabaseConfig() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return { url, anonKey };
}

export function ensureSupabaseServiceConfig() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey() || getSupabaseAnonKey();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return { url, serviceRoleKey };
}

export function nowIso() {
  return new Date().toISOString();
}

export function createUuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function asJson<T extends Json>(value: T): T {
  return value;
}

export function softDeleteFilter<T extends { deleted_at: string | null }>(items: T[]) {
  return items.filter((item) => item.deleted_at === null);
}

export function withTimestamps<T extends Record<string, unknown>>(input: T, isNew = false) {
  const timestamp = nowIso();

  return {
    ...input,
    created_at: isNew ? timestamp : (input as { created_at?: string }).created_at ?? timestamp,
    updated_at: timestamp,
    deleted_at: (input as { deleted_at?: string | null }).deleted_at ?? null,
  };
}

export type SupabaseTableName = keyof Database["public"]["Tables"];
