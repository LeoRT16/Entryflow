import type { SupabaseClient } from "@supabase/supabase-js";

import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import type { AccountRolePreset, AccountUser, OrganizationMembership } from "@/features/accounts/types";
import type {
  Event as PlatformEvent,
  EventLayout,
  EventLayoutResource,
  EventLayoutSector,
  Organization,
  Resource,
  Sector,
  Venue,
  VenueLayout,
  VenueLayoutResource,
  VenueLayoutSector,
} from "@/features/domain/types";
import type { ReservationGuestAction, ReservationGuestInput, ReservationRecord, ReservationStatus } from "@/features/reservations/types";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import type { Database } from "@/lib/supabase/types";
import {
  createUuid,
  nowIso,
  softDeleteFilter,
  withTimestamps,
} from "@/lib/supabase/helpers";
import {
  mapCheckInRowToDomain,
  mapCheckInToRow,
  mapEventLayoutResourceRowToDomain,
  mapEventLayoutResourceToRow,
  mapEventLayoutRowToDomain,
  mapEventLayoutSectorRowToDomain,
  mapEventLayoutSectorToRow,
  mapEventLayoutToRow,
  mapEventRowToDomain,
  mapEventToRow,
  mapGuestRowToDomain,
  mapGuestToRow,
  mapOrganizationRowToDomain,
  mapOrganizationToRow,
  mapProfileRowToDomain,
  mapProfileToRow,
  mapRoleRowToDomain,
  mapRoleToRow,
  mapUserRowToDomain,
  mapUserToRow,
  mapVenueLayoutResourceRowToDomain,
  mapVenueLayoutResourceToRow,
  mapVenueLayoutRowToDomain,
  mapVenueLayoutSectorRowToDomain,
  mapVenueLayoutSectorToRow,
  mapVenueLayoutToRow,
  mapResourceRowToDomain,
  mapResourceToRow,
  mapReservationRowToDomain,
  mapReservationToRow,
  mapSectorRowToDomain,
  mapSectorToRow,
  mapTableRowToDomain,
  mapTableToRow,
  mapTimelineRowToDomain,
  mapTimelineToRow,
  mapVenueRowToDomain,
  mapVenueToRow,
} from "@/lib/supabase/mappers";
import type {
  CheckInRow,
  EventLayoutResourceRow,
  EventLayoutRow,
  EventLayoutSectorRow,
  EventRow,
  GuestRow,
  OrganizationRow,
  ProfileRow,
  ResourceRow,
  ReservationRow,
  RoleRow,
  SectorRow,
  TableRow,
  TimelineRow,
  VenueLayoutResourceRow,
  VenueLayoutRow,
  VenueLayoutSectorRow,
  VenueRow,
  UserRow,
} from "@/lib/supabase/types";

type AnyTable = keyof Database["public"]["Tables"];

type SupabaseCrudRepository<TEntity> = {
  list(): Promise<TEntity[]>;
  findById(id: string): Promise<TEntity | undefined>;
  getById(id: string): Promise<TEntity | undefined>;
  create(input: Partial<TEntity>): Promise<TEntity>;
  upsert(input: Partial<TEntity>): Promise<TEntity>;
  update(id: string, patch: Partial<TEntity>): Promise<TEntity | undefined>;
  delete(id: string): Promise<boolean>;
};

type VenueLayoutRepository = SupabaseCrudRepository<VenueLayout> & {
  getByVenue(venueId: string): Promise<VenueLayout[]>;
  getDefaultByVenue(venueId: string): Promise<VenueLayout | undefined>;
};

type VenueLayoutSectorRepository = SupabaseCrudRepository<VenueLayoutSector> & {
  getByVenueLayout(venueLayoutId: string): Promise<VenueLayoutSector[]>;
};

type VenueLayoutResourceRepository = SupabaseCrudRepository<VenueLayoutResource> & {
  getByVenueLayout(venueLayoutId: string): Promise<VenueLayoutResource[]>;
};

type EventLayoutRepository = SupabaseCrudRepository<EventLayout> & {
  getByEvent(eventId: string): Promise<EventLayout[]>;
  getByVenue(venueId: string): Promise<EventLayout[]>;
};

type EventLayoutSectorRepository = SupabaseCrudRepository<EventLayoutSector> & {
  getByEventLayout(eventLayoutId: string): Promise<EventLayoutSector[]>;
};

type EventLayoutResourceRepository = SupabaseCrudRepository<EventLayoutResource> & {
  getByEventLayout(eventLayoutId: string): Promise<EventLayoutResource[]>;
};

function createNoopCrudRepository<TEntity>(): SupabaseCrudRepository<TEntity> {
  const unavailable = async () => {
    throw new Error("Supabase client is unavailable.");
  };

  return {
    list: unavailable,
    findById: unavailable,
    getById: unavailable,
    create: unavailable,
    upsert: unavailable,
    update: unavailable,
    delete: unavailable,
  };
}

type SupabaseWorkspaceRepositories = {
  users: SupabaseCrudRepository<AccountUser> & {
    getByEmail(email: string): Promise<AccountUser | undefined>;
  };
  roles: SupabaseCrudRepository<AccountRolePreset> & {
    getBySlug(slug: string): Promise<AccountRolePreset | undefined>;
  };
  profiles: SupabaseCrudRepository<OrganizationMembership> & {
    getByOrganization(organizationId: string): Promise<OrganizationMembership[]>;
    getByUser(userId: string): Promise<OrganizationMembership[]>;
    getByOrganizationAndUser(organizationId: string, userId: string): Promise<OrganizationMembership | undefined>;
  };
  organizations: SupabaseCrudRepository<Organization> & {
    getBySlug(slug: string): Promise<Organization | undefined>;
    setActive(organizationId: string): Promise<void>;
  };
  venues: SupabaseCrudRepository<Venue> & {
    setStatus(venueId: string, status: Venue["status"]): Promise<void>;
  };
  sectors: SupabaseCrudRepository<Sector> & {
    setStatus(sectorId: string, status: Sector["status"]): Promise<void>;
  };
  resources: SupabaseCrudRepository<Resource> & {
    setStatus(resourceId: string, status: Resource["status"]): Promise<void>;
    moveToSector(resourceId: string, sectorId: string): Promise<void>;
  };
  events: SupabaseCrudRepository<PlatformEvent> & {
    setActive(eventId: string): Promise<void>;
    setStatus(eventId: string, status: PlatformEvent["status"]): Promise<void>;
  };
  reservations: SupabaseCrudRepository<ReservationRecord> & {
    addGuest(reservationId: string, guest: ReservationGuestInput): Promise<void>;
    updateGuest(params: { reservationId: string; guestId: string; action: ReservationGuestAction }): Promise<void>;
    setStatus(reservationId: string, status: ReservationStatus): Promise<void>;
    assignToTable(reservationId: string, tableId: string): Promise<void>;
  };
  guests: SupabaseCrudRepository<Guest> & {
    moveToTable(guestId: string, tableId: string): Promise<void>;
    checkIn(query: string): Promise<CheckInAttempt | null>;
  };
  tables: SupabaseCrudRepository<TableRecord> & {
    assignReservation(reservationId: string, tableId: string): Promise<void>;
    moveGuest(guestId: string, tableId: string): Promise<void>;
    release(tableId: string): Promise<void>;
    close(tableId: string): Promise<void>;
  };
  venueLayouts: VenueLayoutRepository;
  venueLayoutSectors: VenueLayoutSectorRepository;
  venueLayoutResources: VenueLayoutResourceRepository;
  eventLayouts: EventLayoutRepository;
  eventLayoutSectors: EventLayoutSectorRepository;
  eventLayoutResources: EventLayoutResourceRepository;
  checkIns: SupabaseCrudRepository<CheckIn> & {
    register(query: string, method: "QR" | "Manual", operator?: string): Promise<CheckInAttempt | null>;
  };
  timeline: SupabaseCrudRepository<TimelineEvent>;
};

function buildCrudRepository<TEntity extends { id: string }, TRow extends { id: string; deleted_at: string | null }>({
  client,
  table,
  fromRow,
  toRow,
}: {
  client: SupabaseClient<Database> | null;
  table: AnyTable;
  fromRow: (row: TRow) => TEntity;
  toRow: (entity: TEntity) => Omit<TRow, "created_at" | "updated_at" | "deleted_at">;
}) {
  if (!client) {
    return createNoopCrudRepository<TEntity>();
  }

  const safeClient = client;

  const list = async () => {
    const { data, error } = await safeClient.from(table).select("*").is("deleted_at", null);

    if (error) {
      throw error;
    }

    return softDeleteFilter((data ?? []) as TRow[]).map(fromRow);
  };

  const findById = async (id: string) => {
    const { data, error } = await safeClient.from(table).select("*").eq("id", id).is("deleted_at", null).maybeSingle();

    if (error) {
      throw error;
    }

    return data ? fromRow(data as TRow) : undefined;
  };

  const create = async (input: Partial<TEntity>) => {
    const row = withTimestamps({
      ...toRow(input as TEntity),
      id: (input as { id?: string }).id ?? createUuid(),
    } as Record<string, unknown>, true) as Omit<TRow, "created_at" | "updated_at" | "deleted_at"> & { created_at: string; updated_at: string; deleted_at: string | null };

    const { data, error } = await safeClient.from(table).insert(row as never).select("*").single();

    if (error) {
      throw error;
    }

    return fromRow(data as TRow);
  };

  const upsert = async (input: Partial<TEntity>) => {
    const row = withTimestamps({
      ...toRow(input as TEntity),
      id: (input as { id?: string }).id ?? createUuid(),
    } as Record<string, unknown>, true) as Omit<TRow, "created_at" | "updated_at" | "deleted_at"> & { created_at: string; updated_at: string; deleted_at: string | null };

    const { data, error } = await safeClient.from(table).upsert(row as never, { onConflict: "id" }).select("*").single();

    if (error) {
      throw error;
    }

    return fromRow(data as TRow);
  };

  const update = async (id: string, patch: Partial<TEntity>) => {
    const current = await findById(id);

    if (!current) {
      return undefined;
    }

    const row = withTimestamps({
      ...toRow({ ...current, ...patch } as TEntity),
      id,
    } as Record<string, unknown>) as Omit<TRow, "created_at" | "updated_at" | "deleted_at"> & { created_at?: string; updated_at?: string; deleted_at?: string | null };

    const { data, error } = await safeClient.from(table).upsert(row as never, { onConflict: "id" }).select("*").single();

    if (error) {
      throw error;
    }

    return data ? fromRow(data as TRow) : undefined;
  };

  const del = async (id: string) => {
    const { error, data } = await safeClient
      .from(table)
      .update({ deleted_at: nowIso(), updated_at: nowIso() } as never)
      .eq("id", id)
      .select("id");

    if (error) {
      throw error;
    }

    return (data?.length ?? 0) > 0;
  };

  return { list, findById, getById: findById, create, upsert, update, delete: del };
}

function buildUsersRepository(client: SupabaseClient<Database> | null) {
  const base = buildCrudRepository<AccountUser, UserRow>({
    client,
    table: "users",
    fromRow: mapUserRowToDomain,
    toRow: mapUserToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByEmail() {
        return undefined;
      },
    };
  }

  return {
    ...base,
    async getByEmail(email: string) {
      const { data, error } = await client.from("users").select("*").eq("email", email).is("deleted_at", null).maybeSingle();

      if (error) {
        throw error;
      }

      return data ? mapUserRowToDomain(data as UserRow) : undefined;
    },
  };
}

function buildRolesRepository(client: SupabaseClient<Database> | null) {
  const base = buildCrudRepository<AccountRolePreset, RoleRow>({
    client,
    table: "roles",
    fromRow: mapRoleRowToDomain,
    toRow: mapRoleToRow,
  });

  if (!client) {
    return {
      ...base,
      async getBySlug() {
        return undefined;
      },
    };
  }

  return {
    ...base,
    async getBySlug(slug: string) {
      const { data, error } = await client.from("roles").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();

      if (error) {
        throw error;
      }

      return data ? mapRoleRowToDomain(data as RoleRow) : undefined;
    },
  };
}

function buildProfilesRepository(client: SupabaseClient<Database> | null) {
  const base = buildCrudRepository<OrganizationMembership, ProfileRow>({
    client,
    table: "profiles",
    fromRow: mapProfileRowToDomain,
    toRow: mapProfileToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByOrganization() {
        return [];
      },
      async getByUser() {
        return [];
      },
      async getByOrganizationAndUser() {
        return undefined;
      },
    };
  }

  const listByOrganization = async (organizationId: string) => {
    const { data, error } = await client.from("profiles").select("*").eq("organization_id", organizationId);

    if (error) {
      throw error;
    }

    return sortByCreatedAt(softDeleteFilter((data ?? []) as ProfileRow[]).map(mapProfileRowToDomain));
  };

  const listByUser = async (userId: string) => {
    const { data, error } = await client.from("profiles").select("*").eq("user_id", userId);

    if (error) {
      throw error;
    }

    return sortByCreatedAt(softDeleteFilter((data ?? []) as ProfileRow[]).map(mapProfileRowToDomain));
  };

  return {
    ...base,
    getByOrganization: listByOrganization,
    getByUser: listByUser,
    async getByOrganizationAndUser(organizationId: string, userId: string) {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? mapProfileRowToDomain(data as ProfileRow) : undefined;
    },
  };
}

function sortByDisplayOrder<T extends { id: string; order: number; createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
  });
}

function sortByCreatedAt<T extends { id: string; createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
  });
}

function buildVenueLayoutRepository(client: SupabaseClient<Database> | null): VenueLayoutRepository {
  const base = buildCrudRepository<VenueLayout, VenueLayoutRow>({
    client,
    table: "venue_layouts",
    fromRow: mapVenueLayoutRowToDomain,
    toRow: mapVenueLayoutToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByVenue() {
        return [];
      },
      async getDefaultByVenue() {
        return undefined;
      },
    };
  }

  const listByVenue = async (venueId: string) => {
    const { data, error } = await client.from("venue_layouts").select("*").eq("venue_id", venueId).is("deleted_at", null);

    if (error) {
      throw error;
    }

    const layouts = softDeleteFilter((data ?? []) as VenueLayoutRow[]).map(mapVenueLayoutRowToDomain);

    return sortByCreatedAt(layouts).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  };

  return {
    ...base,
    getByVenue: listByVenue,
    async getDefaultByVenue(venueId: string) {
      return (await listByVenue(venueId)).find((layout) => layout.isDefault);
    },
  };
}

function buildVenueLayoutSectorRepository(client: SupabaseClient<Database> | null): VenueLayoutSectorRepository {
  const base = buildCrudRepository<VenueLayoutSector, VenueLayoutSectorRow>({
    client,
    table: "venue_layout_sectors",
    fromRow: mapVenueLayoutSectorRowToDomain,
    toRow: mapVenueLayoutSectorToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByVenueLayout() {
        return [];
      },
    };
  }

  const listByVenueLayout = async (venueLayoutId: string) => {
    const { data, error } = await client.from("venue_layout_sectors").select("*").eq("venue_layout_id", venueLayoutId).is("deleted_at", null);

    if (error) {
      throw error;
    }

    return sortByDisplayOrder(softDeleteFilter((data ?? []) as VenueLayoutSectorRow[]).map(mapVenueLayoutSectorRowToDomain));
  };

  return {
    ...base,
    getByVenueLayout: listByVenueLayout,
  };
}

function buildVenueLayoutResourceRepository(client: SupabaseClient<Database> | null): VenueLayoutResourceRepository {
  const base = buildCrudRepository<VenueLayoutResource, VenueLayoutResourceRow>({
    client,
    table: "venue_layout_resources",
    fromRow: mapVenueLayoutResourceRowToDomain,
    toRow: mapVenueLayoutResourceToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByVenueLayout() {
        return [];
      },
    };
  }

  const listByVenueLayout = async (venueLayoutId: string) => {
    const { data, error } = await client.from("venue_layout_resources").select("*").eq("venue_layout_id", venueLayoutId).is("deleted_at", null);

    if (error) {
      throw error;
    }

    return sortByDisplayOrder(softDeleteFilter((data ?? []) as VenueLayoutResourceRow[]).map(mapVenueLayoutResourceRowToDomain));
  };

  return {
    ...base,
    getByVenueLayout: listByVenueLayout,
  };
}

function buildEventLayoutRepository(client: SupabaseClient<Database> | null): EventLayoutRepository {
  const base = buildCrudRepository<EventLayout, EventLayoutRow>({
    client,
    table: "event_layouts",
    fromRow: mapEventLayoutRowToDomain,
    toRow: mapEventLayoutToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByEvent() {
        return [];
      },
      async getByVenue() {
        return [];
      },
    };
  }

  const listByEvent = async (eventId: string) => {
    const { data, error } = await client.from("event_layouts").select("*").eq("event_id", eventId).is("deleted_at", null);

    if (error) {
      throw error;
    }

    return sortByCreatedAt(softDeleteFilter((data ?? []) as EventLayoutRow[]).map(mapEventLayoutRowToDomain));
  };

  const listByVenue = async (venueId: string) => {
    const { data, error } = await client.from("event_layouts").select("*").eq("venue_id", venueId).is("deleted_at", null);

    if (error) {
      throw error;
    }

    return sortByCreatedAt(softDeleteFilter((data ?? []) as EventLayoutRow[]).map(mapEventLayoutRowToDomain));
  };

  return {
    ...base,
    getByEvent: listByEvent,
    getByVenue: listByVenue,
  };
}

function buildEventLayoutSectorRepository(client: SupabaseClient<Database> | null): EventLayoutSectorRepository {
  const base = buildCrudRepository<EventLayoutSector, EventLayoutSectorRow>({
    client,
    table: "event_layout_sectors",
    fromRow: mapEventLayoutSectorRowToDomain,
    toRow: mapEventLayoutSectorToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByEventLayout() {
        return [];
      },
    };
  }

  const listByEventLayout = async (eventLayoutId: string) => {
    const { data, error } = await client.from("event_layout_sectors").select("*").eq("event_layout_id", eventLayoutId).is("deleted_at", null);

    if (error) {
      throw error;
    }

    return sortByDisplayOrder(softDeleteFilter((data ?? []) as EventLayoutSectorRow[]).map(mapEventLayoutSectorRowToDomain));
  };

  return {
    ...base,
    getByEventLayout: listByEventLayout,
  };
}

function buildEventLayoutResourceRepository(client: SupabaseClient<Database> | null): EventLayoutResourceRepository {
  const base = buildCrudRepository<EventLayoutResource, EventLayoutResourceRow>({
    client,
    table: "event_layout_resources",
    fromRow: mapEventLayoutResourceRowToDomain,
    toRow: mapEventLayoutResourceToRow,
  });

  if (!client) {
    return {
      ...base,
      async getByEventLayout() {
        return [];
      },
    };
  }

  const listByEventLayout = async (eventLayoutId: string) => {
    const { data, error } = await client.from("event_layout_resources").select("*").eq("event_layout_id", eventLayoutId).is("deleted_at", null);

    if (error) {
      throw error;
    }

    return sortByDisplayOrder(softDeleteFilter((data ?? []) as EventLayoutResourceRow[]).map(mapEventLayoutResourceRowToDomain));
  };

  return {
    ...base,
    getByEventLayout: listByEventLayout,
  };
}

export function createSupabaseWorkspaceRepositories(client: SupabaseClient<Database> | null): SupabaseWorkspaceRepositories {
  const users = buildUsersRepository(client);
  const roles = buildRolesRepository(client);
  const profiles = buildProfilesRepository(client);

  const organizations = buildCrudRepository<Organization, OrganizationRow>({
    client,
    table: "organizations",
    fromRow: mapOrganizationRowToDomain,
    toRow: mapOrganizationToRow,
  });

  const venues = buildCrudRepository<Venue, VenueRow>({
    client,
    table: "venues",
    fromRow: mapVenueRowToDomain,
    toRow: mapVenueToRow,
  });

  const sectors = buildCrudRepository<Sector, SectorRow>({
    client,
    table: "sectors",
    fromRow: mapSectorRowToDomain,
    toRow: mapSectorToRow,
  });

  const resources = buildCrudRepository<Resource, ResourceRow>({
    client,
    table: "resources",
    fromRow: mapResourceRowToDomain,
    toRow: mapResourceToRow,
  });

  const events = buildCrudRepository<PlatformEvent, EventRow>({
    client,
    table: "events",
    fromRow: mapEventRowToDomain,
    toRow: mapEventToRow,
  });

  const reservations = buildCrudRepository<ReservationRecord, ReservationRow>({
    client,
    table: "reservations",
    fromRow: mapReservationRowToDomain,
    toRow: mapReservationToRow,
  });

  const guests = buildCrudRepository<Guest, GuestRow>({
    client,
    table: "guests",
    fromRow: mapGuestRowToDomain,
    toRow: mapGuestToRow,
  });

  const tables = buildCrudRepository<TableRecord, TableRow>({
    client,
    table: "tables",
    fromRow: mapTableRowToDomain,
    toRow: mapTableToRow,
  });

  const checkIns = buildCrudRepository<CheckIn, CheckInRow>({
    client,
    table: "checkins",
    fromRow: mapCheckInRowToDomain,
    toRow: mapCheckInToRow,
  });

  const timeline = buildCrudRepository<TimelineEvent, TimelineRow>({
    client,
    table: "timeline_events",
    fromRow: mapTimelineRowToDomain,
    toRow: (event) => mapTimelineToRow(event, event.eventId ?? event.reservationId ?? event.tableId ?? event.guestId ?? event.id),
  });

  const venueLayouts = buildVenueLayoutRepository(client);
  const venueLayoutSectors = buildVenueLayoutSectorRepository(client);
  const venueLayoutResources = buildVenueLayoutResourceRepository(client);
  const eventLayouts = buildEventLayoutRepository(client);
  const eventLayoutSectors = buildEventLayoutSectorRepository(client);
  const eventLayoutResources = buildEventLayoutResourceRepository(client);

  return {
    users,
    roles,
    profiles,
    organizations: {
      ...organizations,
      async getBySlug(slug: string) {
        if (!client) {
          return undefined;
        }

        const { data, error } = await client.from("organizations").select("*").eq("slug", slug).maybeSingle();

        if (error) {
          throw error;
        }

        return data ? mapOrganizationRowToDomain(data as OrganizationRow) : undefined;
      },
      async setActive(organizationId: string) {
        if (!client) {
          return;
        }

        await client.from("organizations").update({ updated_at: nowIso() } as never).eq("id", organizationId).select("id");
      },
    },
    venues: {
      ...venues,
      async setStatus(venueId: string, status: Venue["status"]) {
        if (!client) {
          return;
        }

        await client.from("venues").update({ status, updated_at: nowIso() } as never).eq("id", venueId).select("id");
      },
    },
    sectors: {
      ...sectors,
      async setStatus(sectorId: string, status: Sector["status"]) {
        if (!client) {
          return;
        }

        await client.from("sectors").update({ status, updated_at: nowIso() } as never).eq("id", sectorId).select("id");
      },
    },
    resources: {
      ...resources,
      async setStatus(resourceId: string, status: Resource["status"]) {
        if (!client) {
          return;
        }

        await client.from("resources").update({ status, updated_at: nowIso() } as never).eq("id", resourceId).select("id");
      },
      async moveToSector(resourceId: string, sectorId: string) {
        if (!client) {
          return;
        }

        await client.from("resources").update({ sector_id: sectorId, updated_at: nowIso() } as never).eq("id", resourceId).select("id");
      },
    },
    events: {
      ...events,
      async setActive(eventId: string) {
        if (!client) {
          return;
        }

        await client.from("events").update({ updated_at: nowIso() } as never).eq("id", eventId).select("id");
      },
      async setStatus(eventId: string, status: PlatformEvent["status"]) {
        if (!client) {
          return;
        }

        await client.from("events").update({ status, updated_at: nowIso() } as never).eq("id", eventId).select("id");
      },
    },
    reservations: {
      ...reservations,
      async addGuest(reservationId: string, guest: ReservationGuestInput) {
        const currentReservation = await reservations.findById(reservationId);

        if (!currentReservation) {
          return;
        }

        const row = await guests.create({
          id: createUuid(),
          guestName: guest.guestName,
          reservationName: currentReservation.name,
          reservationCode: currentReservation.code,
          reservationId: currentReservation.id,
          eventId: currentReservation.eventId,
          eventName: currentReservation.eventName,
          tableId: currentReservation.tableId,
          tableName: currentReservation.tableName,
          eventStatus: "Próximo",
          invitationSequence: `${currentReservation.guestIds.length + 1} de ${currentReservation.guestIds.length + 1}`,
          invitationCode: `${currentReservation.code}-${String(currentReservation.guestIds.length + 1).padStart(2, "0")}`,
          carnet: guest.carnet,
          whatsapp: guest.whatsapp,
          seat: undefined,
          deliveryStatus: "Enviada",
          admissionStatus: "Pendiente",
          reservationStatus: currentReservation.status,
          checkInTime: undefined,
          checkInMethod: undefined,
          gate: undefined,
          method: undefined,
          attention: undefined,
          attentionTone: undefined,
          recentChange: false,
          noWhatsApp: false,
          noInvitationSent: false,
          manualAdmission: false,
          incidents: undefined,
          auditRows: undefined,
          deliveryHistory: [{ time: nowIso().slice(11, 16), title: "Enviada", detail: "Invitación generada desde Supabase" }],
          operatorActivity: [{ time: nowIso().slice(11, 16), action: "Invitado agregado", operator: "Recepción" }],
          internalNotes: undefined,
          qrStatus: "Válido",
        } as Guest);

        await reservations.update(reservationId, {
          guestIds: [...currentReservation.guestIds, row.id],
          updatedAt: nowIso(),
        } as never);
      },
      async updateGuest(params: { reservationId: string; guestId: string; action: ReservationGuestAction }) {
        const guest = await guests.findById(params.guestId);

        if (!guest) {
          return;
        }

        if (params.action === "remove") {
          await guests.delete(params.guestId);
          return;
        }

        const nextGuest: Guest = {
          ...guest,
          reservationStatus:
            params.action === "cancel"
              ? "Cancelled"
              : params.action === "revert"
                ? "Confirmed"
                : "Confirmed",
          admissionStatus:
            params.action === "cancel"
              ? guest.admissionStatus === "Ingresó" ? guest.admissionStatus : "Anulada"
              : params.action === "revert"
                ? "Pendiente"
                : guest.admissionStatus,
          qrStatus:
            params.action === "cancel"
              ? guest.admissionStatus === "Ingresó" ? guest.qrStatus : "Anulado"
              : params.action === "revert"
                ? "Válido"
                : guest.qrStatus,
          checkInTime: params.action === "revert" ? undefined : guest.checkInTime,
          checkInMethod: params.action === "revert" ? undefined : guest.checkInMethod,
          gate: params.action === "revert" ? undefined : guest.gate,
          manualAdmission: params.action === "revert" ? false : guest.manualAdmission,
        };

        await guests.update(params.guestId, nextGuest as never);
      },
      async setStatus(reservationId: string, status: ReservationStatus) {
        await reservations.update(reservationId, { status } as never);
      },
      async assignToTable(reservationId: string, tableId: string) {
        const targetTable = await tables.findById(tableId);
        const currentReservation = await reservations.findById(reservationId);

        if (!targetTable || !currentReservation) {
          return;
        }

        await reservations.update(reservationId, {
          tableId,
          tableName: targetTable.name,
        } as never);

        await tables.update(tableId, {
          status: "Reserved",
          closed: false,
        } as never);
      },
    },
    guests: {
      ...guests,
      async moveToTable(guestId: string, tableId: string) {
        const targetTable = await tables.findById(tableId);

        if (!targetTable) {
          return;
        }

        await guests.update(guestId, {
          tableId,
          tableName: targetTable.name,
        } as never);
      },
      async checkIn(query: string) {
        const allGuests = await guests.list();
        const found = allGuests.find((guest) =>
          [guest.guestName, guest.reservationName, guest.reservationCode, guest.invitationCode, guest.accessCode ?? "", guest.qrToken ?? "", guest.carnet, guest.whatsapp]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        );

        return found
          ? {
              id: createUuid(),
              eventId: found.eventId,
              query,
              method: "QR",
              timestamp: nowIso().slice(11, 16),
              result: "Encontrado",
              guestId: found.id,
              guestName: found.guestName,
              note: "Coincidencia encontrada.",
            }
          : null;
      },
    },
    tables: {
      ...tables,
      async assignReservation(reservationId: string, tableId: string) {
        await reservations.update(reservationId, { tableId } as never);
      },
      async moveGuest(guestId: string, tableId: string) {
        await guests.update(guestId, { tableId } as never);
      },
      async release(tableId: string) {
        await tables.update(tableId, { status: "Available", closed: false } as never);
      },
      async close(tableId: string) {
        await tables.update(tableId, { status: "Closed", closed: true } as never);
      },
    },
    venueLayouts,
    venueLayoutSectors,
    venueLayoutResources,
    eventLayouts,
    eventLayoutSectors,
    eventLayoutResources,
    checkIns: {
      ...checkIns,
      async register(query: string, method: "QR" | "Manual", operator = method === "Manual" ? "Recepción" : "Escáner") {
        const allGuests = await guests.list();
        const found = allGuests.find((guest) =>
          [guest.guestName, guest.reservationName, guest.reservationCode, guest.invitationCode, guest.accessCode ?? "", guest.qrToken ?? "", guest.carnet, guest.whatsapp]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        );

        if (!found) {
          const attempt: CheckInAttempt = {
            id: createUuid(),
            eventId: "",
            query,
            method,
            timestamp: nowIso().slice(11, 16),
            result: "No encontrado",
            note: "Código inválido.",
          };
          return attempt;
        }

        const checkIn: CheckIn = {
          id: createUuid(),
          accessType: found.manualAdmission ? "manual" : "invitation",
          guestId: found.id,
          reservationId: found.reservationId,
          eventId: found.eventId,
          accessGrantId: found.accessGrantId ?? found.id,
          method,
          checkedInAt: nowIso().slice(11, 16),
          checkedOutAt: undefined,
          operator,
          gate: method === "Manual" ? "Recepción" : found.gate ?? "Principal",
          notes: method === "Manual" ? "Ingreso manual registrado." : "QR validado correctamente.",
          auditTrail: [
            {
              id: createUuid(),
              timestamp: nowIso().slice(11, 16),
              kind: "access.checked_in",
              title: method === "Manual" ? "Check-in manual" : "Check-in exitoso",
              description: method === "Manual" ? "Ingreso manual registrado." : "QR validado correctamente.",
              tone: "success",
              operator,
              gate: method === "Manual" ? "Recepción" : found.gate ?? "Principal",
              metadata: { method, query },
            },
          ],
          reentryAllowed: true,
          maxEntries: 1,
          reentryWindowMinutes: undefined,
          attemptCount: 1,
          lastAttemptAt: nowIso().slice(11, 16),
          status: "Checked In",
          source: method === "Manual" ? "manual" : "qr",
        };

        await checkIns.create(checkIn as never);
        await guests.update(found.id, {
          admissionStatus: "Ingresó",
          reservationStatus: "Checked In",
          qrStatus: "Usado",
          checkInTime: checkIn.checkedInAt,
          checkInMethod: method,
          gate: method === "Manual" ? "Recepción" : found.gate ?? "Principal",
          manualAdmission: method === "Manual",
        } as never);

        const attempt: CheckInAttempt = {
          id: createUuid(),
          eventId: found.eventId,
          query,
          method,
          timestamp: checkIn.checkedInAt,
          result: "Encontrado",
          guestId: found.id,
          guestName: found.guestName,
          note: method === "Manual" ? "Ingreso manual registrado." : "QR validado correctamente.",
        };

        return attempt;
      },
    },
    timeline,
  };
}

export type { SupabaseWorkspaceRepositories };
