import type { Event as PlatformEvent } from "@/features/domain/types";

export type UpdateEventDeps = {
  assertPermission: (permission: "event.edit") => void;
  assertOwnership: (event: PlatformEvent) => void;
  persist: (event: PlatformEvent) => Promise<void>;
  requestReporting: (eventId: string) => Promise<unknown>;
};

export async function updateEventOperation(event: PlatformEvent, deps: UpdateEventDeps): Promise<PlatformEvent> {
  deps.assertPermission("event.edit");
  deps.assertOwnership(event);
  await deps.persist(event);
  await deps.requestReporting(event.id);
  return event;
}
