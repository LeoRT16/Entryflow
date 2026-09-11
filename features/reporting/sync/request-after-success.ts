import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requestEventReportingSync } from "@/repositories/reporting-sync-repositories";

export async function requestReportingSyncAfterSuccess(client: SupabaseClient<Database> | null, eventId: string, onFailure?: (error: unknown) => void) {
  if (!client || !eventId) return false;
  try { await requestEventReportingSync(client, eventId); return true; } catch (error) { onFailure?.(error); return false; }
}
