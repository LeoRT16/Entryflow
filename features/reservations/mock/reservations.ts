import type { GuestDraft, PaymentHistoryEntry, TableOption } from "@/features/reservations/types";

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

export const reservationTableOptions: TableOption[] = [
  {
    id: "mesa-12",
    name: "Mesa 12",
    capacity: 5,
    location: "Sala principal",
    status: "Reservada",
    recommended: true,
    tone: "success",
  },
  {
    id: "vip-lounge",
    name: "VIP Lounge",
    capacity: 8,
    location: "Nivel superior",
    status: "Reservada",
    tone: "info",
  },
  {
    id: "terraza",
    name: "Terraza",
    capacity: 4,
    location: "Patio lateral",
    status: "Disponible",
    tone: "warning",
  },
  {
    id: "bar",
    name: "Bar",
    capacity: 3,
    location: "Frente a pista",
    status: "Disponible",
    tone: "warning",
  },
];

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
    detail: "El sistema simulado recalculó el pendiente de la reserva.",
    tone: "info",
  },
  {
    time: "18:56",
    title: "Estado revisado",
    detail: "El operador dejó la reserva en estado parcial.",
    tone: "warning",
  },
];
