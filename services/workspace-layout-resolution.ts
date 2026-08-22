import type { EventLayout, EventLayoutResource, EventLayoutSector, Resource, Sector, VenueLayout, VenueLayoutResource, VenueLayoutSector } from "@/features/domain/types";

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function sortByOrderThenId<T extends { id: string; order?: number; createdAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
  });
}

export function resolveCurrentEventLayout({
  currentEventId,
  currentVenueId,
  eventLayouts,
}: {
  currentEventId: string;
  currentVenueId?: string;
  eventLayouts: EventLayout[];
}) {
  return (
    eventLayouts.find((layout) => layout.eventId === currentEventId && layout.status === "active") ??
    eventLayouts.find((layout) => layout.eventId === currentEventId) ??
    (currentVenueId
      ? eventLayouts.find((layout) => layout.venueId === currentVenueId && layout.status === "active") ??
        eventLayouts.find((layout) => layout.venueId === currentVenueId)
      : undefined) ??
    null
  );
}

export function resolveCurrentVenueLayout({
  currentVenueId,
  currentEventLayout,
  venueLayouts,
}: {
  currentVenueId?: string;
  currentEventLayout: EventLayout | null;
  venueLayouts: VenueLayout[];
}) {
  if (currentEventLayout?.sourceVenueLayoutId) {
    return venueLayouts.find((layout) => layout.id === currentEventLayout.sourceVenueLayoutId) ?? null;
  }

  if (!currentVenueId) {
    return null;
  }

  return (
    venueLayouts.find((layout) => layout.venueId === currentVenueId && layout.isDefault) ??
    venueLayouts.find((layout) => layout.venueId === currentVenueId) ??
    null
  );
}

export function resolveCurrentVenueSectors({
  currentVenueId,
  currentEventLayout,
  venueLayout,
  sectors,
  venueLayoutSectors,
  eventLayoutSectors,
}: {
  currentVenueId?: string;
  currentEventLayout: EventLayout | null;
  venueLayout: VenueLayout | null;
  sectors: Sector[];
  venueLayoutSectors: VenueLayoutSector[];
  eventLayoutSectors: EventLayoutSector[];
}) {
  const sectorsById = new Map(sectors.map((sector) => [sector.id, sector]));
  const venueLayoutSectorsById = new Map(venueLayoutSectors.map((layoutSector) => [layoutSector.id, layoutSector]));

  const orderedSectorIds = currentEventLayout
    ? unique(
        eventLayoutSectors
          .filter((layoutSector) => layoutSector.eventLayoutId === currentEventLayout.id)
          .map((layoutSector) => {
            const venueLayoutSector = layoutSector.sourceVenueLayoutSectorId
              ? venueLayoutSectorsById.get(layoutSector.sourceVenueLayoutSectorId)
              : undefined;

            return venueLayoutSector?.sourceSectorId ?? undefined;
          })
          .filter((sectorId): sectorId is string => Boolean(sectorId)),
      )
    : venueLayout
      ? unique(
          venueLayoutSectors
            .filter((layoutSector) => layoutSector.venueLayoutId === venueLayout.id)
            .map((layoutSector) => layoutSector.sourceSectorId ?? undefined)
            .filter((sectorId): sectorId is string => Boolean(sectorId)),
        )
      : [];

  if (!orderedSectorIds.length) {
    return currentVenueId ? sortByOrderThenId(sectors.filter((sector) => sector.venueId === currentVenueId)) : sortByOrderThenId(sectors);
  }

  const orderMap = new Map(orderedSectorIds.map((sectorId, index) => [sectorId, index]));
  const resolvedSectors = orderedSectorIds
    .map((sectorId) => sectorsById.get(sectorId))
    .filter((sector): sector is Sector => Boolean(sector))
    .filter((sector) => !currentVenueId || sector.venueId === currentVenueId);
  const remainingSectors = currentVenueId
    ? sectors.filter((sector) => sector.venueId === currentVenueId && !orderMap.has(sector.id))
    : sectors.filter((sector) => !orderMap.has(sector.id));

  return [...resolvedSectors, ...sortByOrderThenId(remainingSectors)];
}

export function resolveCurrentVenueResources({
  currentVenueId,
  currentEventLayout,
  venueLayout,
  resources,
  venueLayoutResources,
  eventLayoutResources,
}: {
  currentVenueId?: string;
  currentEventLayout: EventLayout | null;
  venueLayout: VenueLayout | null;
  resources: Resource[];
  venueLayoutResources: VenueLayoutResource[];
  eventLayoutResources: EventLayoutResource[];
}) {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const venueLayoutResourcesById = new Map(venueLayoutResources.map((layoutResource) => [layoutResource.id, layoutResource]));

  const orderedResourceIds = currentEventLayout
    ? unique(
        eventLayoutResources
          .filter((layoutResource) => layoutResource.eventLayoutId === currentEventLayout.id)
          .map((layoutResource) => {
            const venueLayoutResource = layoutResource.sourceVenueLayoutResourceId
              ? venueLayoutResourcesById.get(layoutResource.sourceVenueLayoutResourceId)
              : undefined;

            return venueLayoutResource?.sourceResourceId ?? undefined;
          })
          .filter((resourceId): resourceId is string => Boolean(resourceId)),
      )
    : venueLayout
      ? unique(
          venueLayoutResources
            .filter((layoutResource) => layoutResource.venueLayoutId === venueLayout.id)
            .map((layoutResource) => layoutResource.sourceResourceId ?? undefined)
            .filter((resourceId): resourceId is string => Boolean(resourceId)),
        )
      : [];

  if (!orderedResourceIds.length) {
    return currentVenueId ? sortByOrderThenId(resources.filter((resource) => resource.venueId === currentVenueId)) : sortByOrderThenId(resources);
  }

  const orderMap = new Map(orderedResourceIds.map((resourceId, index) => [resourceId, index]));
  const resolvedResources = orderedResourceIds
    .map((resourceId) => resourcesById.get(resourceId))
    .filter((resource): resource is Resource => Boolean(resource))
    .filter((resource) => !currentVenueId || resource.venueId === currentVenueId);
  const remainingResources = currentVenueId
    ? resources.filter((resource) => resource.venueId === currentVenueId && !orderMap.has(resource.id))
    : resources.filter((resource) => !orderMap.has(resource.id));

  return [...resolvedResources, ...sortByOrderThenId(remainingResources)];
}

export function resolveCurrentEventLayoutResource({
  currentEventLayout,
  resourceId,
  venueLayoutResources,
  eventLayoutResources,
}: {
  currentEventLayout: EventLayout | null;
  resourceId: string;
  venueLayoutResources: VenueLayoutResource[];
  eventLayoutResources: EventLayoutResource[];
}) {
  if (!currentEventLayout) {
    return null;
  }

  const venueLayoutResourcesById = new Map(venueLayoutResources.map((layoutResource) => [layoutResource.id, layoutResource]));

  return (
    eventLayoutResources.find((layoutResource) => {
      if (layoutResource.eventLayoutId !== currentEventLayout.id) {
        return false;
      }

      if (!layoutResource.sourceVenueLayoutResourceId) {
        return false;
      }

      return venueLayoutResourcesById.get(layoutResource.sourceVenueLayoutResourceId)?.sourceResourceId === resourceId;
    }) ?? null
  );
}
