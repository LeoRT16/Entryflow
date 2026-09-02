import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCommercialTotal,
  calculateExtraWristbandTotal,
  canCancelExtraWristbandSale,
  formatManillaLabel,
  getExtraWristbandCancellationErrorMessage,
  validateExtraWristbandSaleInput,
} from "@/features/reservations/domain/extra-wristbands";
import { getEventCommercialConfig } from "@/features/events/domain/commercial-config";

const mesa = { reservationType: "Mesa" as const, eventId: "event-1", status: "Confirmed" as const };

test("extra wristband validation allows a configured zero price and derives the total", () => {
  assert.equal(validateExtraWristbandSaleInput({ reservation: mesa, eventId: "event-1", price: 0, guests: [{ name: "Ana", carnet: "1", whatsapp: "2" }] }), null);
  assert.equal(calculateExtraWristbandTotal(50, 3), 150);
});

test("extra wristband validation rejects missing, negative, non-Mesa, empty, and incomplete inputs", () => {
  const people = [{ name: "Ana", carnet: "1", whatsapp: "2" }];
  assert.match(validateExtraWristbandSaleInput({ reservation: mesa, eventId: "event-1", guests: people }) ?? "", /precio/);
  assert.match(validateExtraWristbandSaleInput({ reservation: mesa, eventId: "event-1", price: -1, guests: people }) ?? "", /precio/);
  assert.match(validateExtraWristbandSaleInput({ reservation: { ...mesa, reservationType: "Preventa" }, eventId: "event-1", price: 50, guests: people }) ?? "", /Mesa/);
  assert.match(validateExtraWristbandSaleInput({ reservation: mesa, eventId: "event-1", price: 50, guests: [] }) ?? "", /persona/);
  assert.match(validateExtraWristbandSaleInput({ reservation: mesa, eventId: "event-1", price: 50, guests: [{ ...people[0], whatsapp: "" }] }) ?? "", /nombre, carnet y WhatsApp/);
});

test("commercial totals include only active sales and preserve independent historical prices", () => {
  const sales = [
    { status: "active" as const, totalPrice: 100 },
    { status: "active" as const, totalPrice: 180 },
    { status: "cancelled" as const, totalPrice: 999 },
  ];
  assert.equal(calculateCommercialTotal(400, sales), 680);
});

test("individual cancellation never changes the sale amount and blocks consumed guests", () => {
  const sale = { status: "active" as const };
  assert.equal(canCancelExtraWristbandSale(sale, [{ admissionStatus: "Pendiente" as const }]), null);
  assert.match(canCancelExtraWristbandSale(sale, [{ admissionStatus: "Ingresó" as const }]) ?? "", /ya ingresaron/);
  assert.match(canCancelExtraWristbandSale({ status: "cancelled" as const }, [] ) ?? "", /ya está anulada/);
});

test("extra wristband copy preserves singular/plural and the RPC cancellation reason", () => {
  assert.equal(formatManillaLabel(1, true), "1 manilla extra");
  assert.equal(formatManillaLabel(2, true), "2 manillas extra");
  assert.equal(
    getExtraWristbandCancellationErrorMessage(new Error("Cannot cancel a sale with a person who already checked in.")),
    "No se puede anular esta venta porque una de las personas asociadas ya registró su ingreso.",
  );
  assert.equal(getExtraWristbandCancellationErrorMessage(new Error("unexpected RPC error")), "unexpected RPC error");
});

test("migration defines atomic create and cancel RPC contracts", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migrations/20260902000001_extra_wristband_sales.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.create_extra_wristband_sale/);
  assert.match(sql, /create or replace function public\.cancel_extra_wristband_sale/);
  assert.match(sql, /for update/);
  assert.match(sql, /extra_wristband_sale_id/);
  assert.match(sql, /reservation\.extraWristbandPrice|extraWristbandPrice/);
  assert.match(sql, /reservation\.extra_wristbands_added/);
  assert.match(sql, /reservation\.extra_wristbands_cancelled/);
  assert.match(sql, /current_app_user_id\(\)/);
});

test("access-code migration allocates monotonic ordinals and protects event codes", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migrations/20260902000002_guest_access_code_integrity.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists access_ordinal integer/i);
  assert.match(sql, /max\(access_ordinal\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /guests_reservation_access_ordinal_unique/);
  assert.match(sql, /guests_event_invitation_code_unique/);
  assert.match(sql, /create_guest_with_access_ordinal/);
  assert.match(sql, /v_ordinal := public\.next_guest_access_ordinal/);
  assert.match(sql, /invitation_code := format\('%s-%s'/i);
});

test("event config keeps extra wristband pricing optional and accepts zero", () => {
  const config = getEventCommercialConfig({ metadata: { commercial: { reservation: { extraWristbandPrice: 0 } } } });
  assert.equal(config.reservation.extraWristbandPrice, 0);
  assert.equal(getEventCommercialConfig({ metadata: { commercial: { reservation: {} } } }).reservation.extraWristbandPrice, undefined);
});

test("reservation board keeps extra wristband UI scoped to Mesa and the RPCs", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");
  assert.match(source, /activeReservation\.reservationType === "Mesa"/);
  assert.match(source, /Agregar manillas extra/);
  assert.match(source, /createExtraWristbandSale\(/);
  assert.match(source, /cancelExtraWristbandSale\(/);
  assert.match(source, /Manilla extra/);
  assert.match(source, /status === "active"/);
});
