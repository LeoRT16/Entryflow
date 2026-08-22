export function resolveEventVenueDisplayName({
  currentVenueName,
  eventVenue,
}: {
  currentVenueName?: string | null;
  eventVenue?: string | null;
}) {
  const resolvedCurrentVenueName = currentVenueName?.trim();
  if (resolvedCurrentVenueName) {
    return resolvedCurrentVenueName;
  }

  const resolvedEventVenue = eventVenue?.trim();
  if (resolvedEventVenue) {
    return resolvedEventVenue;
  }

  return "Sin sede";
}

export function resolveCanonicalCurrentVenue<TVenue extends { id: string }>({
  currentEventVenueId,
  venues,
}: {
  currentEventVenueId?: string | null;
  venues: TVenue[];
}) {
  const normalizedVenueId = currentEventVenueId?.trim();

  if (!normalizedVenueId) {
    return null;
  }

  return venues.find((venue) => venue.id === normalizedVenueId) ?? null;
}

export function resolveManagedVenueById<TVenue extends { id: string }>({
  venueId,
  venues,
}: {
  venueId?: string | null;
  venues: TVenue[];
}) {
  const normalizedVenueId = venueId?.trim();

  if (!normalizedVenueId) {
    return null;
  }

  return venues.find((venue) => venue.id === normalizedVenueId) ?? null;
}
