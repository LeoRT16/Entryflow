export type AccreditationEventDayStatus = "active" | "inactive";

export type AccreditationEventDay = {
  id: string;
  organizationId: string;
  eventId: string;
  dayNumber: number;
  name: string;
  eventDate: string;
  startsAt?: string;
  endsAt?: string;
  status: AccreditationEventDayStatus;
  createdAt: string;
  updatedAt: string;
};

export type AccreditationFestivalDayRepository = {
  list(scope: { organizationId: string; eventId: string }): Promise<AccreditationEventDay[]>;
  getById(scope: { organizationId: string; eventId: string }, dayId: string): Promise<AccreditationEventDay | undefined>;
  isGrantValidForDay(scope: { organizationId: string; eventId: string }, grantId: string, dayId: string): Promise<boolean>;
  isEntitlementValidForDay(scope: { organizationId: string; eventId: string }, entitlementId: string, dayId: string): Promise<boolean>;
  create(input: {
    organizationId: string;
    eventId: string;
    dayNumber: number;
    name: string;
    eventDate: string;
    startsAt?: string;
    endsAt?: string;
  }): Promise<AccreditationEventDay>;
  setStatus(scope: { organizationId: string; eventId: string }, dayId: string, status: AccreditationEventDayStatus): Promise<void>;
};
