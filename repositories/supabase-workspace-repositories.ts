import type { SupabaseClient } from "@supabase/supabase-js";

import type { CheckIn, CheckInAttempt, Guest } from "@/features/check-in/types";
import type { Event as PlatformEvent, Organization } from "@/features/domain/types";
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
  mapEventRowToDomain,
  mapEventToRow,
  mapGuestRowToDomain,
  mapGuestToRow,
  mapOrganizationRowToDomain,
  mapOrganizationToRow,
  mapReservationRowToDomain,
  mapReservationToRow,
  mapTableRowToDomain,
  mapTableToRow,
  mapTimelineRowToDomain,
  mapTimelineToRow,
} from "@/lib/supabase/mappers";
import type { CheckInRow, EventRow, GuestRow, OrganizationRow, ReservationRow, TableRow, TimelineRow } from "@/lib/supabase/types";

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

function createNoopCrudRepository<TEntity>(): SupabaseCrudRepository<TEntity> {
  return {
    async list() {
      return [];
    },
    async findById() {
      return undefined;
    },
    async getById() {
      return undefined;
    },
    async create(input: Partial<TEntity>) {
      return input as TEntity;
    },
    async upsert(input: Partial<TEntity>) {
      return input as TEntity;
    },
    async update() {
      return undefined;
    },
    async delete() {
      return false;
    },
  };
}

type SupabaseWorkspaceRepositories = {
  organizations: SupabaseCrudRepository<Organization> & {
    setActive(organizationId: string): Promise<void>;
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
  checkIns: SupabaseCrudRepository<CheckIn> & {
    register(query: string, method: "QR" | "Manual", operator?: string): Promise<CheckInAttempt | null>;
  };
  timeline: SupabaseCrudRepository<TimelineEvent>;
  operations: SupabaseCrudRepository<TimelineEvent>;
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
      ...input,
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
      ...input,
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

export function createSupabaseWorkspaceRepositories(client: SupabaseClient<Database> | null): SupabaseWorkspaceRepositories {
  const organizations = buildCrudRepository<Organization, OrganizationRow>({
    client,
    table: "organizations",
    fromRow: mapOrganizationRowToDomain,
    toRow: mapOrganizationToRow,
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
    toRow: (event) => mapTimelineToRow(event, event.reservationId ?? event.tableId ?? event.guestId ?? event.id),
  });

  const operations = buildCrudRepository<TimelineEvent, TimelineRow>({
    client,
    table: "operations",
    fromRow: mapTimelineRowToDomain,
    toRow: (event) => mapTimelineToRow(event, event.reservationId ?? event.tableId ?? event.guestId ?? event.id),
  });

  return {
    organizations: {
      ...organizations,
      async setActive(organizationId: string) {
        if (!client) {
          return;
        }

        await client.from("organizations").update({ updated_at: nowIso() } as never).eq("id", organizationId).select("id");
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
          [guest.guestName, guest.reservationName, guest.reservationCode, guest.invitationCode, guest.carnet, guest.whatsapp]
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
    checkIns: {
      ...checkIns,
      async register(query: string, method: "QR" | "Manual", operator = method === "Manual" ? "Recepción" : "Escáner") {
        const allGuests = await guests.list();
        const found = allGuests.find((guest) =>
          [guest.guestName, guest.reservationName, guest.reservationCode, guest.invitationCode, guest.carnet, guest.whatsapp]
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
          accessType: "qr",
          guestId: found.id,
          reservationId: found.reservationId,
          eventId: found.eventId,
          accessGrantId: found.reservationId,
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
    operations,
  };
}

export type { SupabaseWorkspaceRepositories };
