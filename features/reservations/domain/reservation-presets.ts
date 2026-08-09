import type { GuestDraft, PaymentHistoryEntry } from "@/features/reservations/types";
import type { TableOption } from "@/features/tables/types";
import { tableOptions } from "@/features/tables/domain/table-presets";

export const reservationEventOptions = ["Noche Carlota", "Viernes Retro", "Fiesta Blanca"];

export const reservationGuestPresets: Array<Partial<GuestDraft>> = [
  {
    name: "Leonardo Rodríguez",
    whatsapp: "+591 70000001",
    document: "1234567",
    invitationState: "Enviada",
    vip: true,
    transferBadge: "VIP",
  },
  {
    name: "Andrea Pérez",
    whatsapp: "+591 70000002",
    document: "7654321",
    invitationState: "Transferida",
    vip: false,
    transferBadge: "Transferible",
  },
  {
    name: "Carlos Méndez",
    whatsapp: "+591 70000003",
    document: "9988776",
    invitationState: "Lista",
    vip: false,
    transferBadge: "Transferible",
  },
];

export const reservationTableOptions: TableOption[] = tableOptions;

export const reservationPaymentHistory: PaymentHistoryEntry[] = [
  {
    time: "18:42",
    title: "Transferencia confirmada",
    detail: "Se registró un adelanto parcial desde recepción.",
    tone: "success",
  },
  {
    time: "18:49",
    title: "Saldo actualizado",
    detail: "El sistema recalculó el pendiente de la reserva.",
    tone: "info",
  },
  {
    time: "18:56",
    title: "Estado revisado",
    detail: "El operador dejó la reserva en estado parcial.",
    tone: "warning",
  },
];
