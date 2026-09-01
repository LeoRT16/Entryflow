import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import type { TheatreSeat, TheatreSeatAssignment, TheatreSeatRepository, TheatreSeatStatus } from "@/features/accreditation/theatre/types";

type SeatRow = {
  id: string;
  organization_id: string;
  event_id: string;
  venue_id: string;
  section: string;
  row_label: string;
  seat_label: string;
  status: TheatreSeatStatus;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  organization_id: string;
  event_id: string;
  seat_id: string;
  enrollment_id: string;
  access_grant_id: string | null;
  assigned_by_profile_id: string;
  assigned_at: string;
  released_at: string | null;
};

function mapSeat(row: SeatRow): TheatreSeat {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    venueId: row.venue_id,
    section: row.section,
    rowLabel: row.row_label,
    seatLabel: row.seat_label,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssignment(row: AssignmentRow): TheatreSeatAssignment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    seatId: row.seat_id,
    enrollmentId: row.enrollment_id,
    accessGrantId: row.access_grant_id ?? undefined,
    assignedByProfileId: row.assigned_by_profile_id,
    assignedAt: row.assigned_at,
    releasedAt: row.released_at ?? undefined,
  };
}

export function createSupabaseAccreditationTheatreRepository(client: SupabaseClient<Database> | null): TheatreSeatRepository {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  if (!client) {
    return {
      listSeats: unavailable,
      listAssignments: unavailable,
      createSeats: unavailable,
      setSeatStatus: unavailable,
      assignSeat: unavailable,
    };
  }

  const seats = client.from("accreditation_theatre_seats" as never);
  const assignments = client.from("accreditation_theatre_seat_assignments" as never);

  return {
    async listSeats(scope) {
      const { data, error } = await seats
        .select("*")
        .eq("organization_id", scope.organizationId)
        .eq("event_id", scope.eventId)
        .is("deleted_at", null)
        .order("section")
        .order("row_label")
        .order("seat_label");
      if (error) throw error;
      return ((data ?? []) as unknown as SeatRow[]).map(mapSeat);
    },
    async listAssignments(scope) {
      const { data, error } = await assignments
        .select("*")
        .eq("organization_id", scope.organizationId)
        .eq("event_id", scope.eventId)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as AssignmentRow[]).map(mapAssignment);
    },
    async createSeats(input) {
      const rows = input.seatLabels.map((seatLabel) => ({
        organization_id: input.organizationId,
        event_id: input.eventId,
        venue_id: input.venueId,
        section: input.section,
        row_label: input.rowLabel,
        seat_label: seatLabel,
        status: "active" as const,
      }));
      const { data, error } = await seats.insert(rows as never).select("*");
      if (error) throw error;
      return ((data ?? []) as unknown as SeatRow[]).map(mapSeat);
    },
    async setSeatStatus(scope, seatId, status) {
      const { error } = await seats.update({ status, updated_at: new Date().toISOString() } as never)
        .eq("id", seatId)
        .eq("organization_id", scope.organizationId)
        .eq("event_id", scope.eventId)
        .select("id");
      if (error) throw error;
    },
    async assignSeat(input) {
      const { data, error } = await client.rpc("accreditation_theatre_assign_seat" as never, {
        assignment_organization_id: input.organizationId,
        assignment_event_id: input.eventId,
        assignment_seat_id: input.seatId,
        assignment_enrollment_id: input.enrollmentId,
        assignment_access_grant_id: input.accessGrantId ?? null,
        assignment_operator_profile_id: input.operatorProfileId,
      } as never);
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as { status?: string; assignment_id?: string } | null;
      return {
        status: String(result?.status ?? "unknown"),
        assignmentId: result?.assignment_id ? String(result.assignment_id) : undefined,
      };
    },
  };
}
