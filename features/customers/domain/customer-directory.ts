import type {
  AdmissionFilter,
  AdmissionStatus,
  AuditRow,
  DeliveryStatus,
  GuestIncident,
  GuestRecord,
  IncidentSeverity,
  OperationalNote,
  ReservationFilter,
  TimelineEntry,
} from "@/features/customers/types";
import type { ReservationStatus } from "@/features/reservations/types";
import { normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import { normalizeWhatsAppPhoneNumber } from "@/features/access/domain/whatsapp-delivery";

export function statusTone(status: AdmissionStatus | DeliveryStatus | ReservationStatus | string) {
  const normalizedReservationStatus = normalizeReservationStatus(status);

  if (status === "Ingresó" || status === "Enviada" || status === "Reenviada" || status === "Vista" || normalizedReservationStatus === "Confirmed" || normalizedReservationStatus === "Checked In" || normalizedReservationStatus === "Completed") {
    return "success" as const;
  }

  if (status === "Pendiente" || status === "Pendiente de envío" || normalizedReservationStatus === "Pending" || normalizedReservationStatus === "Draft") {
    return "warning" as const;
  }

  if (status === "Anulada" || status === "Bloqueada" || status === "Fallida" || normalizedReservationStatus === "Cancelled" || normalizedReservationStatus === "No Show") {
    return "danger" as const;
  }

  return "info" as const;
}

export function admissionFilterToStatus(filter: AdmissionFilter): AdmissionStatus | null {
  if (filter === "Pendientes") {
    return "Pendiente";
  }

  if (filter === "Ingresaron") {
    return "Ingresó";
  }

  if (filter === "Anulados") {
    return "Anulada";
  }

  if (filter === "Bloqueados") {
    return "Bloqueada";
  }

  return null;
}

export function reservationFilterToStatus(filter: ReservationFilter): ReservationStatus | null {
  if (filter === "Confirmadas") {
    return "Confirmed";
  }

  if (filter === "Pendientes de pago") {
    return "Pending";
  }

  if (filter === "Pago parcial") {
    return "Pending";
  }

  if (filter === "Canceladas") {
    return "Cancelled";
  }

  return null;
}

export type GuestProfileUpdateInput = {
  guestName: string;
  carnet: string;
  whatsapp: string;
};

export type GuestProfileUpdateValidationResult =
  | {
      ok: true;
      value: {
        guestName: string;
        carnet: string;
        whatsapp: string;
        noWhatsApp: boolean;
      };
    }
  | {
      ok: false;
      fieldErrors: {
        guestName?: string;
        whatsapp?: string;
      };
    };

type GuestProfileUpdateFieldErrors = {
  guestName?: string;
  whatsapp?: string;
};

export function validateGuestProfileUpdateInput(input: GuestProfileUpdateInput): GuestProfileUpdateValidationResult {
  const guestName = input.guestName.trim();
  const carnet = input.carnet.trim();
  const whatsapp = input.whatsapp.trim();
  const fieldErrors: GuestProfileUpdateFieldErrors = {};

  if (!guestName) {
    fieldErrors.guestName = "Ingresá un nombre.";
  }

  if (whatsapp && !normalizeWhatsAppPhoneNumber(whatsapp)) {
    fieldErrors.whatsapp = "Ingresá un WhatsApp boliviano válido o dejalo vacío.";
  }

  if (Object.keys(fieldErrors).length) {
    return {
      ok: false,
      fieldErrors,
    };
  }

  return {
    ok: true,
    value: {
      guestName,
      carnet,
      whatsapp,
      noWhatsApp: whatsapp.length === 0,
    },
  };
}

export function buildGuestProfileUpdate<T extends { guestName: string; carnet: string; whatsapp: string; noWhatsApp?: boolean }>(
  guest: T,
  input: {
    guestName: string;
    carnet: string;
    whatsapp: string;
    noWhatsApp: boolean;
  },
) {
  return {
    ...guest,
    guestName: input.guestName,
    carnet: input.carnet,
    whatsapp: input.whatsapp,
    noWhatsApp: input.noWhatsApp,
  };
}

export function buildTimeline(guest: GuestRecord): TimelineEntry[] {
  const sentEntry = guest.deliveryHistory.find((entry) => entry.title === "Enviada" || entry.title === "Reenviada");
  const openEntry = guest.deliveryHistory.find((entry) => entry.title === "Vista");
  const transferEntry = guest.operatorActivity.find(
    (entry) => entry.action.toLowerCase().includes("transferencia") || entry.action.toLowerCase().includes("transfer"),
  );
  const blockedEntry = guest.operatorActivity.find((entry) => entry.action.toLowerCase().includes("bloque"));
  const cancelledEntry = guest.operatorActivity.find((entry) => entry.action.toLowerCase().includes("anul"));
  const checkInTime = guest.checkInTime ?? guest.operatorActivity.at(-1)?.time ?? "21:00";

  const items: TimelineEntry[] = [
    { time: "18:30", title: "Reserva creada", detail: guest.reservationName, tone: "neutral" },
    { time: "18:50", title: "Invitación generada", detail: "Diseño premium listo para entrega", tone: "info" },
  ];

  if (sentEntry) {
    items.push({
      time: sentEntry.time,
      title: sentEntry.title === "Reenviada" ? "Invitación reenviada" : "Invitación enviada",
      detail: "Envío por WhatsApp aceptado por proveedor",
      tone: "info",
    });
  } else if (guest.noInvitationSent) {
    items.push({
      time: "18:53",
      title: "Invitación pendiente",
      detail: "Todavía no se registró el envío",
      tone: "warning",
    });
  }

  if (openEntry) {
    items.push({
      time: openEntry.time,
      title: "Invitación vista",
      detail: "La invitación fue abierta desde WhatsApp",
      tone: "success",
    });
  }

  if (transferEntry) {
    items.push({
      time: transferEntry.time,
      title: "Invitación transferida",
      detail: transferEntry.reason ?? "Cambio de titular o acompañante",
      tone: "warning",
    });
  }

  if (guest.admissionStatus === "Ingresó") {
    items.push({
      time: checkInTime,
      title: guest.manualAdmission ? "Ingreso manual registrado" : "Ingreso confirmado",
      detail: guest.gate ? `Puerta ${guest.gate}` : "Ingreso operativo registrado",
      tone: "success",
    });
  }

  if (guest.admissionStatus === "Anulada" || cancelledEntry) {
    items.push({
      time: cancelledEntry?.time ?? "19:12",
      title: "Invitación cancelada",
      detail: cancelledEntry?.reason ?? "Anulación operativa registrada",
      tone: "danger",
    });
  }

  if (guest.admissionStatus === "Bloqueada" || blockedEntry) {
    items.push({
      time: blockedEntry?.time ?? "20:16",
      title: "Invitación bloqueada",
      detail: blockedEntry?.reason ?? "Acceso bloqueado por supervisión",
      tone: "warning",
    });
  }

  return items;
}

export function buildOperationalNotes(guest: GuestRecord): OperationalNote[] {
  const notes: OperationalNote[] = [];

  if (guest.recentChange) {
    const transferer = guest.operatorActivity.find((entry) => entry.action.toLowerCase().includes("transferencia"));
    notes.push({
      label: "Transferencia",
      detail: transferer?.operator ? `Transferida por ${transferer.operator}` : "Transferida por Camila",
    });
  }

  if (guest.manualAdmission) {
    notes.push({
      label: "Verificación",
      detail: "Ingreso manual autorizado",
    });
  }

  if (guest.gate === "VIP") {
    notes.push({
      label: "Prioridad",
      detail: "VIP",
    });
  }

  if (guest.attentionTone === "danger" || guest.attentionTone === "warning") {
    notes.push({
      label: "Supervisión",
      detail: "Requiere supervisor",
    });
  }

  if (!notes.length) {
    notes.push({
      label: "Estado",
      detail: "Sin observaciones operativas",
    });
  }

  return notes;
}

type WhatsAppUpdatableGuest = {
  guestName: string;
  carnet: string;
  whatsapp: string;
  noWhatsApp?: boolean;
  recentChange?: boolean;
  operatorActivity: Array<{
    time: string;
    action: string;
    operator: string;
    reason?: string;
  }>;
};

export function buildGuestWhatsAppUpdate<T extends WhatsAppUpdatableGuest>(
  guest: T,
  whatsapp: string,
  operator = "Operación",
  timestamp = new Date().toISOString(),
) {
  const nextWhatsApp = whatsapp.trim();

  return {
    ...buildGuestProfileUpdate(guest, {
      guestName: guest.guestName.trim(),
      carnet: guest.carnet.trim(),
      whatsapp: nextWhatsApp,
      noWhatsApp: nextWhatsApp.length === 0,
    }),
    recentChange: true,
    operatorActivity: [
      ...guest.operatorActivity,
      {
        time: timestamp.slice(11, 16),
        action: "WhatsApp actualizado",
        operator,
        reason: "Edición operativa",
      },
    ],
  } as T;
}

const guestIncidentLibrary: Record<
  string,
  {
    incidents: GuestIncident[];
    auditRows: AuditRow[];
  }
> = {
  "leonardo-rodriguez": {
    incidents: [
      {
        title: "VIP",
        description: "Ingreso preferente con seguimiento visual.",
        severity: "resolved",
        timestamp: "20:38",
        operator: "Sistema",
        badge: "VIP",
      },
      {
        title: "Supervisor requerido",
        description: "Se dejó trazabilidad por revisión previa.",
        severity: "warning",
        timestamp: "20:40",
        operator: "Camila",
        badge: "Supervisor",
      },
    ],
    auditRows: [
      { time: "20:38", actor: "Camila", action: "Validó identidad", area: "Reception" },
      { time: "20:41", actor: "Camila", action: "Permitió ingreso manual", area: "Reception" },
    ],
  },
  "andrea-perez": {
    incidents: [
      {
        title: "Invitación transferida",
        description: "El titular cambió el acompañante antes del ingreso.",
        severity: "info",
        timestamp: "21:05",
        operator: "Camila",
        badge: "Transferred",
      },
    ],
    auditRows: [
      { time: "21:05", actor: "Camila", action: "Reasignó invitación", area: "Reception" },
      { time: "21:07", actor: "Puerta Principal", action: "Confirmó ingreso", area: "Door" },
    ],
  },
  "carlos-mendez": {
    incidents: [
      {
        title: "Invitación duplicada",
        description: "Se detectó una segunda versión activa del mismo asiento.",
        severity: "warning",
        timestamp: "20:22",
        operator: "Sistema",
        badge: "Duplicate",
      },
    ],
    auditRows: [
      { time: "20:22", actor: "Recepción", action: "Marcó revisión duplicada", area: "Reception" },
    ],
  },
  "mariana-suarez": {
    incidents: [
      {
        title: "Supervisor requerido",
        description: "La transferencia quedó sujeta a validación manual.",
        severity: "warning",
        timestamp: "18:52",
        operator: "Supervisor",
        badge: "Supervisor",
      },
      {
        title: "Invitación transferida",
        description: "El registro conserva el historial de la reasignación.",
        severity: "info",
        timestamp: "18:52",
        operator: "Supervisor",
        badge: "Transferred",
      },
    ],
    auditRows: [
      { time: "18:52", actor: "Supervisor", action: "Autorizó transferencia", area: "Operations" },
      { time: "21:16", actor: "Puerta Principal", action: "Confirmó ingreso", area: "Door" },
    ],
  },
  "diego-lopez": {
    incidents: [
      {
        title: "Sin WhatsApp",
        description: "No existe número válido para entrega de invitación.",
        severity: "warning",
        timestamp: "18:53",
        operator: "Recepción",
        badge: "Manual",
      },
      {
        title: "Pago pendiente",
        description: "La reserva aún no está lista para activarse.",
        severity: "critical",
        timestamp: "18:53",
        operator: "Caja",
        badge: "Critical",
      },
    ],
    auditRows: [
      { time: "18:53", actor: "Recepción", action: "Registró incidencia manual", area: "Reception" },
      { time: "19:01", actor: "Caja", action: "Marcó pago pendiente", area: "Payments" },
    ],
  },
  "sofia-rivas": {
    incidents: [],
    auditRows: [],
  },
  "mateo-barrios": {
    incidents: [
      {
        title: "QR bloqueado",
        description: "El acceso quedó invalidado por supervisión.",
        severity: "critical",
        timestamp: "20:16",
        operator: "Supervisor",
        badge: "Critical",
      },
      {
        title: "Supervisor requerido",
        description: "No puede admitirse sin revisión adicional.",
        severity: "warning",
        timestamp: "20:16",
        operator: "Supervisor",
        badge: "Supervisor",
      },
    ],
    auditRows: [
      { time: "20:16", actor: "Supervisor", action: "Bloqueó QR", area: "Door" },
      { time: "20:17", actor: "Supervisor", action: "Escaló incidente", area: "Operations" },
    ],
  },
  "daniela-ortiz": {
    incidents: [
      {
        title: "Documento no coincide",
        description: "El documento visible no coincide con el titular.",
        severity: "critical",
        timestamp: "18:55",
        operator: "Recepción",
        badge: "Critical",
      },
      {
        title: "Sin WhatsApp",
        description: "La invitación no pudo entregarse por canal digital.",
        severity: "warning",
        timestamp: "18:50",
        operator: "Recepción",
        badge: "Manual",
      },
    ],
    auditRows: [
      { time: "18:50", actor: "Recepción", action: "Intentó envío manual", area: "Reception" },
      { time: "18:55", actor: "Camila", action: "Bloqueó ingreso preventivo", area: "Door" },
    ],
  },
  "pedro-suarez": {
    incidents: [
      {
        title: "Invitación transferida",
        description: "La titularidad cambió y quedó trazada en el historial.",
        severity: "info",
        timestamp: "19:46",
        operator: "Supervisor",
        badge: "Transferred",
      },
    ],
    auditRows: [
      { time: "19:46", actor: "Supervisor", action: "Reasignó invitación", area: "Operations" },
      { time: "19:48", actor: "Sistema", action: "Regeneró invitación", area: "Ticketing" },
    ],
  },
  "camila-rojas": {
    incidents: [
      {
        title: "Ingreso manual",
        description: "La identidad fue validada en puerta sin QR.",
        severity: "resolved",
        timestamp: "21:10",
        operator: "Puerta",
        badge: "Manual",
      },
      {
        title: "VIP",
        description: "Acceso priorizado por condición operativa.",
        severity: "resolved",
        timestamp: "21:10",
        operator: "Puerta",
        badge: "VIP",
      },
    ],
    auditRows: [
      { time: "21:10", actor: "Puerta", action: "Permitió ingreso manual", area: "Reception" },
      { time: "21:10", actor: "Supervisor", action: "Aprobó acceso VIP", area: "Operations" },
    ],
  },
  "andres-molina": {
    incidents: [
      {
        title: "Invitación cancelada",
        description: "La reserva quedó anulada antes del ingreso.",
        severity: "critical",
        timestamp: "19:12",
        operator: "Supervisor",
        badge: "Critical",
      },
    ],
    auditRows: [
      { time: "19:12", actor: "Supervisor", action: "Canceló invitación", area: "Operations" },
    ],
  },
  "valeria-gomez": {
    incidents: [
      {
        title: "Pago pendiente",
        description: "La reserva sigue con saldo por completar.",
        severity: "warning",
        timestamp: "17:50",
        operator: "Caja",
        badge: "Critical",
      },
    ],
    auditRows: [
      { time: "17:50", actor: "Caja", action: "Registró pago parcial", area: "Payments" },
      { time: "18:01", actor: "Recepción", action: "Actualizó estado operativo", area: "Reception" },
    ],
  },
};

export function getGuestIncidents(guest: GuestRecord) {
  return guestIncidentLibrary[guest.id]?.incidents ?? [];
}

export function getGuestAuditRows(guest: GuestRecord) {
  return guestIncidentLibrary[guest.id]?.auditRows ?? [];
}

export function getIncidentVariant(severity: IncidentSeverity) {
  if (severity === "critical") {
    return "danger" as const;
  }

  if (severity === "warning") {
    return "warning" as const;
  }

  if (severity === "resolved") {
    return "success" as const;
  }

  return "info" as const;
}

export function getIncidentToneClass(severity: IncidentSeverity) {
  if (severity === "critical") {
    return "border-red-400/20 bg-red-400/10 text-red-100";
  }

  if (severity === "warning") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }

  if (severity === "resolved") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  }

  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
}
