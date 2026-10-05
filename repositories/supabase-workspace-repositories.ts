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
import { cancelExtraWristbandSale, createExtraWristbandSale, mapExtraWristbandSaleRowToDomain, type ExtraWristbandPerson, type ExtraWristbandSale } from "@/features/reservations/domain/extra-wristbands";
import type { TableRecord } from "@/features/tables/types";
import type { TimelineEvent } from "@/features/timeline/types";
import type { Database } from "@/lib/supabase/types";
import { getQrToken } from "@/features/access/domain/access-ledger";
import { logAccessPreparationDiagnostic, toAccessPreparationError } from "@/features/check-in/domain/access-preparation-error";
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
  ExtraWristbandSaleRow,
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
import type { GuestMoveAtomicResult } from "@/repositories/workspace-repositories";

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
  materializeEventLayoutAtomic(eventId: string): Promise<EventLayoutMaterializationResult>;
};

export type EventLayoutMaterializationResult = {
  changed: boolean;
  event_id: string;
  event_layout_id: string;
  venue_id: string;
  source_venue_layout_id: string | null;
  resource_count: number;
};

type EventLayoutSectorRepository = SupabaseCrudRepository<EventLayoutSector> & {
  getByEventLayout(eventLayoutId: string): Promise<EventLayoutSector[]>;
};

type EventLayoutResourceRepository = SupabaseCrudRepository<EventLayoutResource> & {
  getByEventLayout(eventLayoutId: string): Promise<EventLayoutResource[]>;
};

export async function softDeleteResource(
  client: SupabaseClient<Database>,
  resourceId: string,
) {
  const { data, error } = await client.rpc("soft_delete_resource" as never, {
    p_resource_id: resourceId,
  } as never);

  if (error) {
    throw error;
  }

  return data === true;
}

async function runBooleanLifecycleRpc(
  client: SupabaseClient<Database>,
  name: "soft_delete_guest" | "soft_delete_reservation" | "cancel_reservation_atomic",
  argument: "p_guest_id" | "p_reservation_id",
  id: string,
) {
  const { data, error } = await client.rpc(name as never, { [argument]: id } as never);
  if (error) throw error;
  return data === true;
}

export function softDeleteGuest(client: SupabaseClient<Database>, guestId: string) {
  return runBooleanLifecycleRpc(client, "soft_delete_guest", "p_guest_id", guestId);
}

export function softDeleteReservation(client: SupabaseClient<Database>, reservationId: string) {
  return runBooleanLifecycleRpc(client, "soft_delete_reservation", "p_reservation_id", reservationId);
}

export function cancelReservationAtomic(client: SupabaseClient<Database>, reservationId: string) {
  return runBooleanLifecycleRpc(client, "cancel_reservation_atomic", "p_reservation_id", reservationId);
}

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

export type SupabaseWorkspaceRepositories = {
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
    activate(eventId: string): Promise<import('./workspace-repositories').EventActivationResult>;
    setVenueAtomic(eventId: string, venueId: string | null): Promise<import('./workspace-repositories').EventVenueAtomicResult>;
  };
  reservations: SupabaseCrudRepository<ReservationRecord> & {
    createPhysicalAtomic(input: { reservation: ReservationRecord; guests: Guest[] }): Promise<{ reservation: ReservationRecord; guests: Guest[] }>;
    createPresaleAtomic(input: { reservation: ReservationRecord; guests: Guest[] }): Promise<{ reservation: ReservationRecord; guests: Guest[] }>;
    createCourtesyAtomic(input: { reservation: ReservationRecord; guests: Guest[] }): Promise<{ reservation: ReservationRecord; guests: Guest[] }>;
    addPresaleGuestAtomic(input: { reservationId: string; guest: Guest; accessEvent: TimelineEvent }): Promise<Guest>;
    addCourtesyGuestAtomic(input: { reservationId: string; guest: Guest; accessEvent: TimelineEvent }): Promise<Guest>;
    addGuest(reservationId: string, guest: ReservationGuestInput): Promise<void>;
    addGuestAtomic(input: { reservationId: string; guest: Guest; courtesyEvent?: TimelineEvent; accessEvent: TimelineEvent }): Promise<Guest>;
    cancelGuestAtomic(input: { reservationId: string; guestId: string; reason: string }): Promise<{ guest: Guest; timelineEvent: TimelineEvent }>;
    cancelAtomic(reservationId: string): Promise<boolean>;
    updateGuest(params: { reservationId: string; guestId: string; action: ReservationGuestAction }): Promise<void>;
    setStatus(reservationId: string, status: ReservationStatus): Promise<void>;
    setStatusAtomic(reservationId: string, status: ReservationStatus): Promise<{ reservationId: string; previousStatus: ReservationStatus; status: ReservationStatus; changed: boolean }>;
    assignToTable(reservationId: string, tableId: string): Promise<void>;
    assignReservationTableAtomic(input: { reservationId: string; resourceId: string }): Promise<import('./workspace-repositories').ReservationTableAtomicResult>;
    swapResourceReservationsAtomic(input: { reservationAId: string; reservationBId?: string; resourceAId: string; resourceBId: string; idempotencyKey: string }): Promise<Record<string, unknown>>;
    releaseReservationTableAtomic(input: { reservationId: string; expectedResourceId: string }): Promise<import('./workspace-repositories').ReleaseReservationTableAtomicResult>;
  };
  extraWristbandSales: {
    list(): Promise<ExtraWristbandSale[]>;
    create(input: { reservationId: string; eventId: string; people: ExtraWristbandPerson[]; actor: string }): Promise<unknown>;
    cancel(input: { saleId: string; reason: string; actor: string }): Promise<unknown>;
  };
  guests: SupabaseCrudRepository<Guest> & {
    createWithAccessOrdinal(guest: Guest): Promise<Guest>;
    prepareAuthoritativeAccess(guest: Guest): Promise<Guest>;
    rotateGuestAccessCredential(guestId: string): Promise<{ guestId: string; accessGrantId: string; accessCode: string; qrToken: string }>;
    replaceReservationGuest(input: { reservationId: string; guestId: string; replacement: Pick<Guest, "guestName" | "carnet" | "whatsapp">; reason?: string }): Promise<{ guest: Guest; accessGrantId: string; accessCode: string; qrToken: string; sourceGuestId: string }>;
    moveToTable(guestId: string, tableId: string): Promise<void>;
    moveGuestToResourceAtomic(input: { guestId: string; destinationResourceId: string }): Promise<GuestMoveAtomicResult>;
    checkIn(query: string): Promise<CheckInAttempt | null>;
  };
  tables: SupabaseCrudRepository<TableRecord> & {
    assignReservation(reservationId: string, tableId: string): Promise<void>;
    moveGuest(guestId: string, tableId: string): Promise<void>;
    release(tableId: string): Promise<void>;
    close(tableId: string): Promise<void>;
    closeTableAtomic(input: { resourceId: string }): Promise<{ table_id: string; status: string; closed: boolean; changed: boolean }>;
  };
  venueLayouts: VenueLayoutRepository;
  venueLayoutSectors: VenueLayoutSectorRepository;
  venueLayoutResources: VenueLayoutResourceRepository;
  eventLayouts: EventLayoutRepository;
  eventLayoutSectors: EventLayoutSectorRepository;
  eventLayoutResources: EventLayoutResourceRepository;
  checkIns: SupabaseCrudRepository<CheckIn> & {
    isAuthoritativeConsumed(accessGrantId: string): Promise<boolean>;
    persistCompletedAtomic(input: { guestId: string; accessGrantId: string; operatorProfileId: string; source: string; method: string; operator: string; gate: string; checkedInAt: string; notes: string; auditTrail: unknown; timeline: unknown; presentedCredential: string; credentialKind: "qr_token" | "access_code" | "manual" | "invalid" }): Promise<void>;
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
      async materializeEventLayoutAtomic() {
        throw new Error("Supabase client is unavailable.");
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
    async materializeEventLayoutAtomic(eventId: string) {
      const { data, error } = await client.rpc("materialize_event_layout_atomic" as never, { p_event_id: eventId } as never);
      if (error) throw error;
      return data as EventLayoutMaterializationResult;
    },
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

  const eventsBase = buildCrudRepository<PlatformEvent, EventRow>({
    client,
    table: "events",
    fromRow: mapEventRowToDomain,
    toRow: mapEventToRow,
  });

  const events = eventsBase;

  const reservations = buildCrudRepository<ReservationRecord, ReservationRow>({
    client,
    table: "reservations",
    fromRow: mapReservationRowToDomain,
    toRow: mapReservationToRow,
  });
  (reservations as SupabaseWorkspaceRepositories["reservations"]).createPhysicalAtomic = async ({ reservation, guests: inputGuests }) => {
    if (!client) throw new Error("Supabase client is unavailable.");
    const { data, error } = await client.rpc("create_physical_reservation_atomic" as never, {
      p_reservation: mapReservationToRow(reservation),
      p_guests: inputGuests.map(mapGuestToRow),
    } as never);
    if (error) throw error;
    const result = data as { reservation?: ReservationRow; guests?: GuestRow[] };
    if (!result?.reservation || !Array.isArray(result.guests)) throw new Error("Malformed physical reservation RPC response.");
    return { reservation: mapReservationRowToDomain(result.reservation), guests: result.guests.map(mapGuestRowToDomain) };
  };
  (reservations as SupabaseWorkspaceRepositories["reservations"]).createPresaleAtomic = async ({ reservation, guests: inputGuests }) => {
    if (!client) throw new Error("Supabase client is unavailable.");
    const { data, error } = await client.rpc("create_presale_reservation_atomic" as never, {
      p_reservation: mapReservationToRow(reservation),
      p_guests: inputGuests.map(mapGuestToRow),
    } as never);
    if (error) throw error;
    const result = data as { reservation?: ReservationRow; guests?: GuestRow[] };
    if (!result?.reservation || !Array.isArray(result.guests)) throw new Error("Malformed presale reservation RPC response.");
    return { reservation: mapReservationRowToDomain(result.reservation), guests: result.guests.map(mapGuestRowToDomain) };
  };
  (reservations as SupabaseWorkspaceRepositories["reservations"]).createCourtesyAtomic = async ({ reservation, guests: inputGuests }) => {
    if (!client) throw new Error("Supabase client is unavailable.");
    const { data, error } = await client.rpc("create_courtesy_reservation_atomic" as never, {
      p_reservation: mapReservationToRow(reservation),
      p_guests: inputGuests.map(mapGuestToRow),
    } as never);
    if (error) throw error;
    const result = data as { reservation?: ReservationRow; guests?: GuestRow[] };
    if (!result?.reservation || !Array.isArray(result.guests)) throw new Error("Malformed house list reservation RPC response.");
    return { reservation: mapReservationRowToDomain(result.reservation), guests: result.guests.map(mapGuestRowToDomain) };
  };

  const extraWristbandSales = {
    async list() {
      if (!client) return [];
      const { data, error } = await client.from("reservation_extra_wristband_sales").select("*");
      if (error) throw error;
      return ((data ?? []) as ExtraWristbandSaleRow[]).map(mapExtraWristbandSaleRowToDomain);
    },
    async create(input: { reservationId: string; eventId: string; people: ExtraWristbandPerson[]; actor: string }) {
      if (!client) throw new Error("Supabase client is unavailable.");
      return createExtraWristbandSale(client, input);
    },
    async cancel(input: { saleId: string; reason: string; actor: string }) {
      if (!client) throw new Error("Supabase client is unavailable.");
      return cancelExtraWristbandSale(client, input);
    },
  };

  const guests = buildCrudRepository<Guest, GuestRow>({
    client,
    table: "guests",
    fromRow: mapGuestRowToDomain,
    toRow: mapGuestToRow,
  }) as SupabaseWorkspaceRepositories["guests"];

  guests.delete = async (guestId: string) => {
    if (!client) throw new Error("Supabase client is unavailable.");
    return softDeleteGuest(client, guestId);
  };

  guests.createWithAccessOrdinal = async (guest) => {
    if (!client) throw new Error("Supabase client is unavailable.");

    const { data, error } = await client.rpc("create_guest_with_access_ordinal" as never, {
      p_reservation_id: guest.reservationId,
      p_guest: mapGuestToRow(guest),
    } as never);

    if (error) throw error;
    return mapGuestRowToDomain(data as GuestRow);
  };

  guests.replaceReservationGuest = async ({ reservationId, guestId, replacement, reason }) => {
    if (!client) throw new Error("Supabase client is unavailable.");
    const replacementPayload = {
      guest_name: replacement.guestName,
      carnet: replacement.carnet,
      whatsapp: replacement.whatsapp,
    };
    const { data, error } = await client.rpc("replace_reservation_guest_atomic" as never, {
      p_reservation_id: reservationId, p_guest_id: guestId, p_replacement: replacementPayload, p_reason: reason ?? null,
    } as never);
    if (error) throw error;
    const result = data as { guest?: GuestRow; accessGrantId?: string; accessCode?: string; qrToken?: string; sourceGuestId?: string } | null;
    if (!result?.guest || !result.accessGrantId || !result.accessCode || !result.qrToken || !result.sourceGuestId) throw new Error("Malformed guest replacement response.");
    return { guest: mapGuestRowToDomain(result.guest), accessGrantId: result.accessGrantId, accessCode: result.accessCode, qrToken: result.qrToken, sourceGuestId: result.sourceGuestId };
  };

  guests.prepareAuthoritativeAccess = async (guest) => {
    if (!client) throw new Error("Supabase client is unavailable.");
    const { data, error } = await client.rpc("prepare_guest_access_atomic" as never, {
      p_guest_id: guest.id,
      p_access_code: guest.accessCode ?? guest.invitationCode,
      p_qr_token: guest.qrToken ?? getQrToken(guest),
    } as never);
    if (error) {
      const diagnostic = toAccessPreparationError(error);
      logAccessPreparationDiagnostic(diagnostic);
      throw diagnostic;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { access_grant_id?: string; access_code?: string; qr_token?: string } | null;
    if (!row?.access_grant_id) throw new Error("Malformed authoritative access response.");
    return { ...guest, accessGrantId: row.access_grant_id, accessCode: row.access_code ?? guest.accessCode, qrToken: row.qr_token ?? guest.qrToken };
  };

  guests.rotateGuestAccessCredential = async (guestId) => {
    if (!client) throw new Error("Supabase client is unavailable.");
    const { data, error } = await client.rpc("rotate_guest_access_credential_atomic" as never, { p_guest_id: guestId } as never);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { guest_id?: string; access_grant_id?: string; access_code?: string; qr_token?: string } | null;
    if (!row?.guest_id || !row.access_grant_id || !row.access_code || !row.qr_token) throw new Error("Malformed credential rotation response.");
    return { guestId: row.guest_id, accessGrantId: row.access_grant_id, accessCode: row.access_code, qrToken: row.qr_token };
  };

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
      async delete(resourceId: string) {
        if (!client) {
          return resources.delete(resourceId);
        }

        return softDeleteResource(client, resourceId);
      },
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
      async activate(eventId: string) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("activate_event" as never, { p_event_id: eventId } as never);
        if (error) throw error;
        return data as import("./workspace-repositories").EventActivationResult;
      },
      async setVenueAtomic(eventId: string, venueId: string | null) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("set_event_venue_atomic" as never, { p_event_id: eventId, p_venue_id: venueId } as never);
        if (error) throw error;
        return data as import('./workspace-repositories').EventVenueAtomicResult;
      },
    },
    reservations: {
      ...reservations,
      async createPhysicalAtomic({ reservation, guests: inputGuests }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("create_physical_reservation_atomic" as never, {
          p_reservation: mapReservationToRow(reservation),
          p_guests: inputGuests.map(mapGuestToRow),
        } as never);
        if (error) throw error;
        const result = data as { reservation?: ReservationRow; guests?: GuestRow[] };
        if (!result?.reservation || !Array.isArray(result.guests)) throw new Error("Malformed physical reservation RPC response.");
        return { reservation: mapReservationRowToDomain(result.reservation), guests: result.guests.map(mapGuestRowToDomain) };
      },
      async createPresaleAtomic({ reservation, guests: inputGuests }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("create_presale_reservation_atomic" as never, {
          p_reservation: mapReservationToRow(reservation),
          p_guests: inputGuests.map(mapGuestToRow),
        } as never);
        if (error) throw error;
        const result = data as { reservation?: ReservationRow; guests?: GuestRow[] };
        if (!result?.reservation || !Array.isArray(result.guests)) throw new Error("Malformed presale reservation RPC response.");
        return { reservation: mapReservationRowToDomain(result.reservation), guests: result.guests.map(mapGuestRowToDomain) };
      },
      async createCourtesyAtomic({ reservation, guests: inputGuests }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("create_courtesy_reservation_atomic" as never, {
          p_reservation: mapReservationToRow(reservation),
          p_guests: inputGuests.map(mapGuestToRow),
        } as never);
        if (error) throw error;
        const result = data as { reservation?: ReservationRow; guests?: GuestRow[] };
        if (!result?.reservation || !Array.isArray(result.guests)) throw new Error("Malformed house list reservation RPC response.");
        return { reservation: mapReservationRowToDomain(result.reservation), guests: result.guests.map(mapGuestRowToDomain) };
      },
      async addPresaleGuestAtomic({ reservationId, guest, accessEvent }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("add_presale_guest_atomic" as never, {
          p_reservation_id: reservationId,
          p_guest: mapGuestToRow(guest),
          p_access_event: accessEvent,
        } as never);
        if (error) throw error;
        return mapGuestRowToDomain(data as GuestRow);
      },
      async addCourtesyGuestAtomic({ reservationId, guest, accessEvent }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("add_courtesy_guest_atomic" as never, {
          p_reservation_id: reservationId, p_guest: mapGuestToRow(guest), p_access_event: accessEvent,
        } as never);
        if (error) throw error;
        return mapGuestRowToDomain(data as GuestRow);
      },
      async delete(reservationId: string) {
        if (!client) throw new Error("Supabase client is unavailable.");
        return softDeleteReservation(client, reservationId);
      },
      async cancelAtomic(reservationId: string) {
        if (!client) throw new Error("Supabase client is unavailable.");
        return cancelReservationAtomic(client, reservationId);
      },
      async cancelGuestAtomic({ reservationId, guestId, reason }) {
        if (!client) throw new Error("Supabase client is unavailable.");

        const { data, error } = await client.rpc("cancel_reservation_guest_atomic" as never, {
          p_reservation_id: reservationId,
          p_guest_id: guestId,
          p_reason: reason,
          p_timeline_id: null,
        } as never);

        if (error) throw error;
        const result = data as { guest: GuestRow; timelineEvent: TimelineRow };
        return {
          guest: mapGuestRowToDomain(result.guest),
          timelineEvent: mapTimelineRowToDomain(result.timelineEvent),
        };
      },
      async addGuestAtomic({ reservationId, guest, courtesyEvent, accessEvent }) {
        if (!client) throw new Error("Supabase client is unavailable.");

        const { data, error } = await client.rpc("add_reservation_guest_atomic" as never, {
          p_reservation_id: reservationId,
          p_guest: mapGuestToRow(guest),
          p_courtesy_event: courtesyEvent ? mapTimelineToRow(courtesyEvent, guest.eventId) : null,
          p_access_event: mapTimelineToRow(accessEvent, guest.eventId),
        } as never);

        if (error) throw error;
        return mapGuestRowToDomain(data as GuestRow);
      },
      async addGuest(reservationId: string, guest: ReservationGuestInput) {
        const currentReservation = await reservations.findById(reservationId);

        if (!currentReservation) {
          return;
        }

        const row = await guests.createWithAccessOrdinal({
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
          invitationSequence: "1 de 1",
          invitationCode: currentReservation.code,
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
      async setStatusAtomic(reservationId: string, status: ReservationStatus) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("set_reservation_status_atomic" as never, {
          p_reservation_id: reservationId,
          p_target_status: status,
        } as never);
        if (error) throw error;
        const result = data as { reservation_id: string; previous_status: ReservationStatus; status: ReservationStatus; changed: boolean };
        return { reservationId: result.reservation_id, previousStatus: result.previous_status, status: result.status, changed: result.changed };
      },
      async swapResourceReservationsAtomic({ reservationAId, reservationBId, resourceAId, resourceBId, idempotencyKey }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("swap_resource_reservations_atomic" as never, {
          p_reservation_a: reservationAId,
          p_reservation_b: reservationBId ?? null,
          p_resource_a: resourceAId,
          p_resource_b: resourceBId,
          p_idempotency_key: idempotencyKey,
        } as never);
        if (error) throw error;
        return data as Record<string, unknown>;
      },
      async assignReservationTableAtomic({ reservationId, resourceId }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("assign_reservation_table_atomic" as never, { p_reservation_id: reservationId, p_destination_table_id: resourceId } as never);
        if (error) throw error;
        return data as never;
      },
      async releaseReservationTableAtomic({ reservationId, expectedResourceId }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("release_reservation_table_atomic" as never, { p_reservation_id: reservationId, p_expected_table_id: expectedResourceId } as never);
        if (error) throw error;
        return data as never;
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
    extraWristbandSales,
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
      async moveGuestToResourceAtomic({ guestId, destinationResourceId }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("move_guest_to_resource_atomic" as never, {
          p_guest_id: guestId,
          p_destination_resource_id: destinationResourceId,
        } as never);
        if (error) throw error;
        const result = data as Partial<GuestMoveAtomicResult> | null;
        if (!result || typeof result.guest_id !== "string" || typeof result.reservation_id !== "string" || typeof result.destination_resource_id !== "string" || typeof result.destination_resource_name !== "string") {
          throw new Error("Invalid move_guest_to_resource_atomic response.");
        }
        return {
          changed: result.changed === true,
          guest_id: result.guest_id,
          reservation_id: result.reservation_id,
          source_resource_id: result.source_resource_id ?? null,
          destination_resource_id: result.destination_resource_id,
          destination_resource_name: result.destination_resource_name,
          table_id: result.table_id ?? null,
          table_name: result.table_name ?? null,
        };
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
      async closeTableAtomic({ resourceId }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client.rpc("close_table_atomic" as never, { p_table_id: resourceId } as never);
        if (error) throw error;
        return data as never;
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
      async isAuthoritativeConsumed(accessGrantId: string) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { data, error } = await client
          .from("accreditation_checkins")
          .select("id")
          .eq("access_grant_id", accessGrantId)
          .limit(1);
        if (error) throw error;
        return Array.isArray(data) && data.length > 0;
      },
      async persistCompletedAtomic(input: { guestId: string; accessGrantId: string; operatorProfileId: string; source: string; method: string; operator: string; gate: string; checkedInAt: string; notes: string; auditTrail: unknown; timeline: unknown; presentedCredential: string; credentialKind: "qr_token" | "access_code" | "manual" | "invalid" }) {
        if (!client) throw new Error("Supabase client is unavailable.");
        const { error } = await client.rpc("persist_completed_checkin_atomic" as never, {
          p_guest_id: input.guestId,
          p_access_grant_id: input.accessGrantId,
          p_operator_profile_id: input.operatorProfileId,
          p_source: input.source,
          p_method: input.method,
          p_operator: input.operator,
          p_gate: input.gate,
          p_checked_in_at: input.checkedInAt,
          p_notes: input.notes,
          p_audit_trail: input.auditTrail,
          p_timeline: input.timeline,
          p_presented_credential: input.presentedCredential,
          p_credential_kind: input.credentialKind,
        } as never);
        if (error) throw error;
      },
      async register(_query: string, _method: "QR" | "Manual", _operator?: string) {
        throw new Error("Direct legacy admission is disabled; use the authoritative atomic check-in flow.");
      },
    },
    timeline,
  };
}
