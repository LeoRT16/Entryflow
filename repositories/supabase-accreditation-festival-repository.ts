import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import type { AccreditationEventDay, AccreditationFestivalDayRepository, AccreditationEventDayStatus } from "@/features/accreditation/festival";

type EventDayRow = {
  id: string;
  organization_id: string;
  event_id: string;
  day_number: number;
  name: string;
  event_date: string;
  starts_at: string | null;
  ends_at: string | null;
  status: AccreditationEventDayStatus;
  created_at: string;
  updated_at: string;
};

function mapDay(row: EventDayRow): AccreditationEventDay {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    dayNumber: row.day_number,
    name: row.name,
    eventDate: row.event_date,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseAccreditationFestivalDayRepository(client: SupabaseClient<Database> | null): AccreditationFestivalDayRepository {
  if (!client) {
    const unavailable = async () => { throw new Error("Supabase client is unavailable."); };
    return { list: unavailable, getById: unavailable, isGrantValidForDay: unavailable, isEntitlementValidForDay: unavailable, create: unavailable, setStatus: unavailable };
  }

  const table = client.from("accreditation_event_days" as never);
  return {
    async list(scope) {
      const { data, error } = await table.select("*").eq("organization_id", scope.organizationId).eq("event_id", scope.eventId).is("deleted_at", null).order("event_date");
      if (error) throw error;
      return ((data ?? []) as unknown as EventDayRow[]).map(mapDay);
    },
    async getById(scope, dayId) {
      const { data, error } = await table.select("*").eq("id", dayId).eq("organization_id", scope.organizationId).eq("event_id", scope.eventId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapDay(data as unknown as EventDayRow) : undefined;
    },
    async isGrantValidForDay(scope, grantId, dayId) {
      const { data, error } = await client.from("accreditation_access_grant_days" as never).select("event_day_id").eq("organization_id", scope.organizationId).eq("event_id", scope.eventId).eq("access_grant_id", grantId);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ event_day_id: string }>;
      return rows.length === 0 || rows.some((row) => row.event_day_id === dayId);
    },
    async isEntitlementValidForDay(scope, entitlementId, dayId) {
      const { data, error } = await client.from("accreditation_access_entitlement_days" as never).select("event_day_id").eq("organization_id", scope.organizationId).eq("event_id", scope.eventId).eq("entitlement_id", entitlementId);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ event_day_id: string }>;
      return rows.length === 0 || rows.some((row) => row.event_day_id === dayId);
    },
    async create(input) {
      const { data, error } = await table.insert({
        organization_id: input.organizationId,
        event_id: input.eventId,
        day_number: input.dayNumber,
        name: input.name,
        event_date: input.eventDate,
        starts_at: input.startsAt ?? null,
        ends_at: input.endsAt ?? null,
      } as never).select("*").single();
      if (error) throw error;
      return mapDay(data as unknown as EventDayRow);
    },
    async setStatus(scope, dayId, status) {
      const { error } = await table.update({ status, updated_at: new Date().toISOString() } as never).eq("id", dayId).eq("organization_id", scope.organizationId).eq("event_id", scope.eventId).select("id");
      if (error) throw error;
    },
  };
}
