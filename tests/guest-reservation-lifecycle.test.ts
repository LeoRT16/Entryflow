import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canCancelReservation,
  canHardDeleteReservation,
  canDeleteGuest,
  canDeleteReservation,
  describeReservationLifecycleError,
} from "../features/reservations/domain/reservation-deletion";
import {
  cancelReservationAtomic,
  softDeleteGuest,
  softDeleteReservation,
} from "../repositories/supabase-workspace-repositories";
import type { Database } from "../lib/supabase/types";

const cleanGuest = {
  id: "guest-1",
  admissionStatus: "Pendiente" as const,
  deliveryStatus: "Pendiente de envío" as const,
  deliveryHistory: [],
  operatorActivity: [],
  extraWristbandSaleId: undefined,
};
const pendingReservation = { id: "reservation-1", status: "Pending" as const, reservationType: "Mesa" as const };
const cleanDraft = {
  id: "draft-1",
  status: "Draft" as const,
  commercialSnapshot: undefined,
  amount: "0",
  advance: "0",
  paymentStatus: "Pendiente" as const,
  reference: undefined,
  timeline: [],
};

test("canDeleteGuest permits only a Guest without operational evidence", () => {
  assert.equal(canDeleteGuest({ guest: cleanGuest, reservation: pendingReservation }).allowed, true);
  assert.deepEqual(canDeleteGuest({ guest: { ...cleanGuest, deliveryHistory: [{ time: "20:00", title: "Sent", detail: "Sent" }] }, reservation: pendingReservation }).dependencies, ["delivery_history"]);
  assert.equal(canDeleteGuest({ guest: cleanGuest, reservation: { ...pendingReservation, reservationType: "Preventa" } }).allowed, false);
  assert.equal(canDeleteGuest({ guest: cleanGuest, reservation: { ...pendingReservation, reservationType: "Cortesía" } }).allowed, false);
  assert.equal(canDeleteGuest({ guest: { ...cleanGuest, extraWristbandSaleId: "sale-1" }, reservation: pendingReservation }).allowed, false);
  assert.equal(canDeleteGuest({ guest: cleanGuest, reservation: pendingReservation, checkIns: [{ guestId: "guest-1" }] }).allowed, false);
});

test("canDeleteReservation permits only a fact-free Draft", () => {
  assert.equal(canDeleteReservation({ reservation: cleanDraft }).allowed, true);
  assert.equal(canDeleteReservation({ reservation: { ...cleanDraft, status: "Pending" } }).allowed, false);
  assert.equal(canDeleteReservation({ reservation: { ...cleanDraft, commercialSnapshot: { currency: "BOB" } as never } }).allowed, false);
  assert.equal(canDeleteReservation({ reservation: cleanDraft, guests: [{ id: "guest-1", reservationId: "draft-1" }] }).allowed, false);
  assert.equal(canDeleteReservation({ reservation: { ...cleanDraft, amount: "10" } }).allowed, false);
  assert.deepEqual(canDeleteReservation({ reservation: { ...cleanDraft, timeline: [{ id: "real", title: "Reserva cancelada" }] as never } }).dependencies, ["timeline_history"]);
  assert.equal(canHardDeleteReservation({ ...cleanDraft, guests: [], timeline: [{ id: "created", title: "Reserva creada" }, { id: "pending", title: "Pago pendiente" }] as never }), true);
  assert.equal(canHardDeleteReservation({ ...cleanDraft, guests: [], timeline: [{ id: "real", title: "Reserva cancelada" }] as never }), false);
});

test("canCancelReservation allows Pending and Confirmed but blocks Draft, terminal, and active extras", () => {
  assert.equal(canCancelReservation({ id: "r1", status: "Pending" }).allowed, true);
  assert.equal(canCancelReservation({ id: "r1", status: "Confirmed" }).allowed, true);
  assert.equal(canCancelReservation({ id: "r1", status: "Draft" }).allowed, false);
  assert.equal(canCancelReservation({ id: "r1", status: "Completed" }).allowed, false);
  assert.equal(canCancelReservation({ id: "r1", status: "Confirmed" }, [{ reservationId: "r1", status: "active" }]).allowed, false);
});

test("lifecycle errors normalize structured PostgREST errors without SQL leakage", () => {
  assert.equal(describeReservationLifecycleError({ message: "guest_has_history" }, "fallback"), "Este invitado ya tiene actividad registrada. Puedes cancelarlo para conservar el historial.");
  assert.equal(describeReservationLifecycleError({ code: "42501" }, "No se pudo eliminar."), "No se pudo eliminar.");
  assert.equal(describeReservationLifecycleError({ message: "new row violates row-level security policy" }, "No se pudo eliminar."), "No se pudo eliminar.");
});

test("repositories use the three canonical lifecycle RPC contracts", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = { async rpc(name: string, args: unknown) { calls.push({ name, args }); return { data: true, error: null }; } } as unknown as SupabaseClient<Database>;
  assert.equal(await softDeleteGuest(client, "guest-1"), true);
  assert.equal(await softDeleteReservation(client, "reservation-1"), true);
  assert.equal(await cancelReservationAtomic(client, "reservation-1"), true);
  assert.deepEqual(calls, [
    { name: "soft_delete_guest", args: { p_guest_id: "guest-1" } },
    { name: "soft_delete_reservation", args: { p_reservation_id: "reservation-1" } },
    { name: "cancel_reservation_atomic", args: { p_reservation_id: "reservation-1" } },
  ]);
});

test("service awaits lifecycle authority and keeps rollback plus canonical reload", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const guestBlock = source.slice(source.indexOf('if (action === "remove" && targetGuest)'), source.indexOf('if (action === "cancel")'));
  const deleteBlock = source.slice(source.indexOf("const deleteReservation = useCallback("), source.indexOf("const cancelReservation = useCallback("));
  const cancelBlock = source.slice(source.indexOf("const cancelReservation = useCallback("), source.indexOf("const appendReservationGuests = useCallback("));
  assert.match(guestBlock, /await repositories\.guests\.delete\(guestId\)/);
  assert.match(guestBlock, /restoreSnapshot\(snapshot\)/);
  assert.match(guestBlock, /await reloadWorkspace\(\)/);
  assert.doesNotMatch(deleteBlock, /repositories\.guests\.delete/);
  assert.match(deleteBlock, /await repositories\.reservations\.delete\(reservationId\)/);
  assert.match(cancelBlock, /await repositories\.reservations\.cancelAtomic\(reservationId\)/);
});

test("migration hardens every lifecycle RPC and preserves cancellation history", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260910000001_guest_reservation_lifecycle.sql", import.meta.url), "utf8");
  for (const name of ["soft_delete_guest", "soft_delete_reservation", "cancel_reservation_atomic"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}`));
    assert.match(sql, new RegExp(`alter function public\\.${name}\\(uuid\\) owner to postgres`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(uuid\\) from public`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to authenticated`));
  }
  assert.match(sql, /security definer/g);
  assert.match(sql, /set search_path = public, pg_temp/g);
  assert.match(sql, /insert into public\.timeline_events/);
  assert.match(sql, /reservation_has_active_extras/);
});
