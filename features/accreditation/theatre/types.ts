export type TheatreSeatStatus = "active" | "inactive";

export type TheatreSeat = {
  id: string;
  organizationId: string;
  eventId: string;
  venueId: string;
  section: string;
  rowLabel: string;
  seatLabel: string;
  status: TheatreSeatStatus;
  createdAt: string;
  updatedAt: string;
};

export type TheatreSeatAssignment = {
  id: string;
  organizationId: string;
  eventId: string;
  seatId: string;
  enrollmentId: string;
  accessGrantId?: string;
  assignedByProfileId: string;
  assignedAt: string;
  releasedAt?: string;
};

export type TheatreSeatRepository = {
  listSeats(scope: { organizationId: string; eventId: string }): Promise<TheatreSeat[]>;
  listAssignments(scope: { organizationId: string; eventId: string }): Promise<TheatreSeatAssignment[]>;
  createSeats(input: {
    organizationId: string;
    eventId: string;
    venueId: string;
    section: string;
    rowLabel: string;
    seatLabels: string[];
  }): Promise<TheatreSeat[]>;
  setSeatStatus(scope: { organizationId: string; eventId: string }, seatId: string, status: TheatreSeatStatus): Promise<void>;
  assignSeat(input: {
    organizationId: string;
    eventId: string;
    seatId: string;
    enrollmentId: string;
    accessGrantId?: string;
    operatorProfileId: string;
  }): Promise<{ status: string; assignmentId?: string }>;
};
