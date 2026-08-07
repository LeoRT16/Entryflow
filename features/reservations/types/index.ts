export type ReservationType = "Mesa" | "Cumpleaños" | "VIP" | "Corporativo";
export type PaymentMethod = "Efectivo" | "Transferencia" | "Tarjeta" | "Cortesía";
export type PaymentStatus = "Pendiente" | "Parcial" | "Pagado";
export type GuestInvitationState = "Pendiente" | "Lista" | "Enviada" | "Transferida";
export type TableStatus = "Reservada" | "Disponible";
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export type GuestDraft = {
  id: string;
  name: string;
  whatsapp: string;
  document: string;
  invitationState: GuestInvitationState;
  vip: boolean;
  transferBadge: string;
};

export type TableOption = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  status: TableStatus;
  recommended?: boolean;
  tone: "success" | "warning" | "info";
};

export type PaymentHistoryEntry = {
  time: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "info";
};
