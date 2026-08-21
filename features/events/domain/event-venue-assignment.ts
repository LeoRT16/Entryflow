type EventRowLike = {
  eventId: string;
};

type EventTableRowLike = {
  eventId?: string;
};

export function hasOperationalEventData({
  eventId,
  reservations,
  guests,
  tables,
  checkIns,
}: {
  eventId: string;
  reservations: EventRowLike[];
  guests: EventRowLike[];
  tables: EventTableRowLike[];
  checkIns: EventRowLike[];
}) {
  return (
    reservations.some((item) => item.eventId === eventId) ||
    guests.some((item) => item.eventId === eventId) ||
    tables.some((item) => item.eventId === eventId) ||
    checkIns.some((item) => item.eventId === eventId)
  );
}

export function shouldWarnBeforeChangingEventVenue({
  eventId,
  currentVenueId,
  nextVenueId,
  reservations,
  guests,
  tables,
  checkIns,
}: {
  eventId: string;
  currentVenueId?: string;
  nextVenueId?: string;
  reservations: EventRowLike[];
  guests: EventRowLike[];
  tables: EventTableRowLike[];
  checkIns: EventRowLike[];
}) {
  const normalizedCurrentVenueId = currentVenueId?.trim() ?? "";
  const normalizedNextVenueId = nextVenueId?.trim() ?? "";

  return normalizedCurrentVenueId !== normalizedNextVenueId && hasOperationalEventData({ eventId, reservations, guests, tables, checkIns });
}
