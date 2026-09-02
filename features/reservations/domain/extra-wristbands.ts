import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export type ExtraWristbandSaleStatus = "active" | "cancelled";

export type ExtraWristbandSale = {
  id: string;
  reservationId: string;
  eventId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  status: ExtraWristbandSaleStatus;
  createdBy?: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
};

export type ExtraWristbandPerson = {
  name: string;
  carnet: string;
  whatsapp: string;
};

export type ExtraWristbandOperationResult = {
  saleId: string;
  guestIds: string[];
  timelineEventId: string;
};

export function mapExtraWristbandSaleRowToDomain(row: {
  id: string;
  reservation_id: string;
  event_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  currency: string;
  status: ExtraWristbandSaleStatus;
  created_by: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}): ExtraWristbandSale {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    eventId: row.event_id,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
    currency: row.currency,
    status: row.status,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledBy: row.cancelled_by ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
  };
}

export function validateExtraWristbandSaleInput({
  reservation,
  eventId,
  price,
  guests,
}: {
  reservation: { reservationType: string; eventId: string; status: string };
  eventId: string;
  price?: number;
  guests: Array<Pick<ExtraWristbandPerson, "name" | "carnet" | "whatsapp">>;
}) {
  if (reservation.reservationType !== "Mesa") return "Las manillas extra sólo están disponibles para reservas de Mesa.";
  if (reservation.eventId !== eventId) return "La reserva no pertenece al evento activo.";
  if (["Cancelled", "Completed", "No Show"].includes(reservation.status)) return "La reserva ya no admite manillas extra.";
  if (price === undefined || !Number.isFinite(price) || price < 0) return "Este evento no tiene precio de manilla extra configurado.";
  if (!guests.length) return "Agregá al menos una persona.";
  if (guests.some((guest) => !guest.name.trim() || !guest.carnet.trim() || !guest.whatsapp.trim())) return "Cada persona necesita nombre, carnet y WhatsApp.";
  return null;
}

export function calculateExtraWristbandTotal(unitPrice: number, quantity: number) {
  return unitPrice * quantity;
}

export function calculateCommercialTotal(originalPrice: number, sales: Array<Pick<ExtraWristbandSale, "status" | "totalPrice">>) {
  return originalPrice + sales.reduce((total, sale) => sale.status === "active" ? total + sale.totalPrice : total, 0);
}

export function formatManillaLabel(quantity: number, extra = false) {
  const normalizedQuantity = Math.max(0, Math.floor(quantity));
  const label = extra
    ? normalizedQuantity === 1 ? "manilla extra" : "manillas extra"
    : normalizedQuantity === 1 ? "manilla" : "manillas";
  return `${normalizedQuantity} ${label}`;
}

export function getExtraWristbandCancellationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("Cannot cancel a sale with a person who already checked in.")) {
    return "No se puede anular esta venta porque una de las personas asociadas ya registró su ingreso.";
  }
  return error instanceof Error ? error.message : "No se pudo anular la venta.";
}

export function canCancelExtraWristbandSale(sale: Pick<ExtraWristbandSale, "status">, guests: Array<Pick<import("@/features/check-in/types").Guest, "admissionStatus" | "checkInTime">>) {
  if (sale.status !== "active") return "La venta de manillas extra ya está anulada.";
  if (guests.some((guest) => guest.admissionStatus === "Ingresó" || guest.checkInTime)) return "No se puede anular una venta con personas que ya ingresaron.";
  return null;
}

export async function createExtraWristbandSale(
  client: SupabaseClient<Database>,
  input: {
    reservationId: string;
    eventId: string;
    people: ExtraWristbandPerson[];
    actor: string;
  },
) {
  const { data, error } = await client.rpc("create_extra_wristband_sale" as never, {
    p_reservation_id: input.reservationId,
    p_event_id: input.eventId,
    p_people: input.people,
    p_actor: input.actor,
  } as never);

  if (error) throw error;
  return data as unknown as ExtraWristbandOperationResult;
}

export async function cancelExtraWristbandSale(
  client: SupabaseClient<Database>,
  input: { saleId: string; reason: string; actor: string },
) {
  const { data, error } = await client.rpc("cancel_extra_wristband_sale" as never, {
    p_sale_id: input.saleId,
    p_reason: input.reason,
    p_actor: input.actor,
  } as never);

  if (error) throw error;
  return data as unknown as ExtraWristbandOperationResult;
}
