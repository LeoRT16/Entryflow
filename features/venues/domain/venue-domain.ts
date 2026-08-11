import type { Organization, Sector, Venue } from "@/features/domain/types";

// Compatibility fallback only.
// The persistent source of truth for venues/sectors lives in Supabase tables.
// Organization.metadata can still be read/written during transition, but it is
// not the definitive physical catalog.
type VenueCatalogMetadata = {
  venues?: Venue[];
  sectors?: Sector[];
};

function clone<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readVenueCatalogMetadata(organization: Organization) {
  const metadata = organization.metadata && typeof organization.metadata === "object" && !Array.isArray(organization.metadata)
    ? (organization.metadata as Record<string, unknown>)
    : {};

  const venues = Array.isArray(metadata.venues) ? (metadata.venues as Venue[]) : [];
  const sectors = Array.isArray(metadata.sectors) ? (metadata.sectors as Sector[]) : [];

  return { venues, sectors };
}

function writeVenueCatalogMetadata(organization: Organization, nextCatalog: VenueCatalogMetadata): Organization {
  const metadata = organization.metadata && typeof organization.metadata === "object" && !Array.isArray(organization.metadata)
    ? (organization.metadata as Record<string, unknown>)
    : {};

  return {
    ...organization,
    metadata: {
      ...metadata,
      venues: clone(nextCatalog.venues ?? []),
      sectors: clone(nextCatalog.sectors ?? []),
    },
  };
}

export function getOrganizationVenues(organization: Organization) {
  return readVenueCatalogMetadata(organization).venues;
}

export function getOrganizationSectors(organization: Organization, venueId?: string) {
  const catalog = readVenueCatalogMetadata(organization);

  if (!venueId) {
    return catalog.sectors;
  }

  return catalog.sectors.filter((sector) => sector.venueId === venueId);
}

export function getVenueById(organization: Organization, venueId: string) {
  return getOrganizationVenues(organization).find((venue) => venue.id === venueId);
}

export function upsertVenueInOrganization(organization: Organization, venue: Venue) {
  const catalog = readVenueCatalogMetadata(organization);
  const nextVenues = catalog.venues.some((item) => item.id === venue.id)
    ? catalog.venues.map((item) => (item.id === venue.id ? venue : item))
    : [venue, ...catalog.venues];

  return writeVenueCatalogMetadata(organization, {
    venues: nextVenues,
    sectors: catalog.sectors,
  });
}

export function setVenueStatusInOrganization(organization: Organization, venueId: string, status: Venue["status"]) {
  const venue = getVenueById(organization, venueId);

  if (!venue) {
    return organization;
  }

  return upsertVenueInOrganization(organization, {
    ...venue,
    status,
    updatedAt: new Date().toISOString(),
  });
}

export function upsertSectorInOrganization(organization: Organization, sector: Sector) {
  const catalog = readVenueCatalogMetadata(organization);
  const nextSectors = catalog.sectors.some((item) => item.id === sector.id)
    ? catalog.sectors.map((item) => (item.id === sector.id ? sector : item))
    : [...catalog.sectors, sector];

  return writeVenueCatalogMetadata(organization, {
    venues: catalog.venues,
    sectors: nextSectors,
  });
}

export function getVenueCatalogCounts(organization: Organization, venueId?: string) {
  const catalog = readVenueCatalogMetadata(organization);
  const sectorCount = venueId ? catalog.sectors.filter((sector) => sector.venueId === venueId).length : catalog.sectors.length;

  return {
    venueCount: catalog.venues.length,
    sectorCount,
  };
}
