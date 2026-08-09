import type { DeliveryStatus, ReservationFilter, AdmissionFilter } from "@/features/customers/types";

export const admissionFilters: AdmissionFilter[] = [
  "Todos",
  "Pendientes",
  "Ingresaron",
  "Anulados",
  "Bloqueados",
];

export const deliveryFilters: Array<"Todos" | DeliveryStatus> = [
  "Todos",
  "Pendiente de envío",
  "Enviada",
  "Reenviada",
  "Fallida",
  "Vista",
];

export const reservationFilters: ReservationFilter[] = [
  "Todas",
  "Confirmadas",
  "Pendientes de pago",
  "Pago parcial",
  "Canceladas",
];

export const quickFilters = [
  { key: "attention", label: "Requiere atención" },
  { key: "recent", label: "Cambio reciente" },
  { key: "noWhatsapp", label: "Sin WhatsApp" },
  { key: "noInvitation", label: "Sin invitación enviada" },
  { key: "manual", label: "Ingreso manual" },
] as const;
