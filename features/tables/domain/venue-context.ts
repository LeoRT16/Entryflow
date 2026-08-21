import type { Resource, Sector, Venue } from "@/features/domain/types";

const STORAGE_KEY_PREFIX = "entryflow.currentVenueId";

export type TablesVenueContext = {
  currentVenue: Venue | null;
  currentVenueId: string;
  venueOptions: Venue[];
  currentVenueSectors: Sector[];
  currentVenueResources: Resource[];
};

type VenueStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function pickVenue(venues: Venue[], preferredVenueId?: string, fallbackVenueId?: string) {
  return (
    venues.find((venue) => venue.id === preferredVenueId && venue.status === "active") ??
    venues.find((venue) => venue.id === preferredVenueId) ??
    venues.find((venue) => venue.id === fallbackVenueId && venue.status === "active") ??
    venues.find((venue) => venue.id === fallbackVenueId) ??
    venues.find((venue) => venue.status === "active") ??
    venues[0] ??
    null
  );
}

export function getVenueContextStorageKey(organizationId: string) {
  return `${STORAGE_KEY_PREFIX}.${organizationId}`;
}

export function readVenueContextPreference(storage: VenueStorageLike, organizationId: string) {
  return storage.getItem(getVenueContextStorageKey(organizationId)) ?? "";
}

export function writeVenueContextPreference(storage: VenueStorageLike, organizationId: string, venueId: string) {
  const key = getVenueContextStorageKey(organizationId);

  if (!venueId) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, venueId);
}

export function resolveTablesVenueContext({
  venues,
  sectors,
  resources,
  preferredVenueId,
  fallbackVenueId,
}: {
  venues: Venue[];
  sectors: Sector[];
  resources: Resource[];
  preferredVenueId?: string;
  fallbackVenueId?: string;
}): TablesVenueContext {
  const currentVenue = pickVenue(venues, preferredVenueId, fallbackVenueId);
  const currentVenueId = currentVenue?.id ?? "";

  return {
    currentVenue,
    currentVenueId,
    venueOptions: venues,
    currentVenueSectors: currentVenueId ? sectors.filter((sector) => sector.venueId === currentVenueId) : [],
    currentVenueResources: currentVenueId ? resources.filter((resource) => resource.venueId === currentVenueId) : [],
  };
}

export function resolveVenueSectorName(sectors: Sector[], sectorId?: string | null) {
  return sectors.find((sector) => sector.id === sectorId)?.name ?? "Sin zona";
}
