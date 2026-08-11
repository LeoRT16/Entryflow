import type {
  EventLayout,
  EventLayoutResource,
  EventLayoutSector,
  VenueLayout,
  VenueLayoutResource,
  VenueLayoutSector,
} from "@/features/domain/types";

export type WorkspaceLayoutCollections = {
  venueLayouts: VenueLayout[];
  venueLayoutSectors: VenueLayoutSector[];
  venueLayoutResources: VenueLayoutResource[];
  eventLayouts: EventLayout[];
  eventLayoutSectors: EventLayoutSector[];
  eventLayoutResources: EventLayoutResource[];
};

export type WorkspaceLayoutRepositories = {
  venueLayouts: { list(): Promise<VenueLayout[]> };
  venueLayoutSectors: { list(): Promise<VenueLayoutSector[]> };
  venueLayoutResources: { list(): Promise<VenueLayoutResource[]> };
  eventLayouts: { list(): Promise<EventLayout[]> };
  eventLayoutSectors: { list(): Promise<EventLayoutSector[]> };
  eventLayoutResources: { list(): Promise<EventLayoutResource[]> };
};

export function createEmptyWorkspaceLayouts(): WorkspaceLayoutCollections {
  return {
    venueLayouts: [],
    venueLayoutSectors: [],
    venueLayoutResources: [],
    eventLayouts: [],
    eventLayoutSectors: [],
    eventLayoutResources: [],
  };
}

function settle<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === "fulfilled" ? result.value : [];
}

export async function loadWorkspaceLayouts(repositories: WorkspaceLayoutRepositories): Promise<WorkspaceLayoutCollections> {
  const [venueLayouts, venueLayoutSectors, venueLayoutResources, eventLayouts, eventLayoutSectors, eventLayoutResources] = await Promise.allSettled([
    repositories.venueLayouts.list(),
    repositories.venueLayoutSectors.list(),
    repositories.venueLayoutResources.list(),
    repositories.eventLayouts.list(),
    repositories.eventLayoutSectors.list(),
    repositories.eventLayoutResources.list(),
  ]);

  return {
    venueLayouts: settle(venueLayouts),
    venueLayoutSectors: settle(venueLayoutSectors),
    venueLayoutResources: settle(venueLayoutResources),
    eventLayouts: settle(eventLayouts),
    eventLayoutSectors: settle(eventLayoutSectors),
    eventLayoutResources: settle(eventLayoutResources),
  };
}

