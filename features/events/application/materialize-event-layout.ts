import type { EventLayoutMaterializationResult, SupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";

export async function materializeEventLayout(
  repositories: Pick<SupabaseWorkspaceRepositories, "eventLayouts">,
  eventId: string,
): Promise<EventLayoutMaterializationResult> {
  return repositories.eventLayouts.materializeEventLayoutAtomic(eventId);
}
