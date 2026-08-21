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
