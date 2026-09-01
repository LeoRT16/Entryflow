import type {
  AdmissionMethod,
  Event,
  EventModule,
  EventStatus,
  EventType,
  OperationalModel,
  ResourceType,
} from "@/features/domain/types";
import { getDefaultTimezone } from "@/lib/timezone";

function getCurrentDateForTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export type EventBlueprint = {
  eventType: EventType;
  label: string;
  description: string;
  operationalModel: OperationalModel;
  allowedOperationalModels: OperationalModel[];
  requiredModules: EventModule[];
  optionalModules: EventModule[];
  futureModules: EventModule[];
  enabledModules: EventModule[];
  admissionMethods: AdmissionMethod[];
  resourceTypes: ResourceType[];
  capacityRequired: boolean;
  icon: string;
  tone: "cyan" | "violet" | "emerald" | "amber" | "rose" | "sky";
};

export type EventDraft = {
  name: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  venueId: string;
  venue: string;
  capacity: string;
  operationalModel: OperationalModel;
  enabledModules: EventModule[];
  admissionMethods: AdmissionMethod[];
  resourceTypes: ResourceType[];
};

export type EventNavigationItem = {
  module: EventModule | string;
  label: string;
  route?: string;
  enabled: boolean;
  required: boolean;
  future: boolean;
  description: string;
};

export type EventNavigationGroup = {
  title: string;
  items: EventNavigationItem[];
};

const moduleLabels: Record<EventModule, string> = {
  overview: "Resumen",
  access: "Acceso",
  attendees: "Invitados",
  admission: "Ingreso",
  resources: "Recursos",
  operations: "Operaciones",
  activity: "Actividad",
  analytics: "Analíticas",
  notifications: "Notificaciones",
  ticketing: "Venta de tickets",
  payments: "Pagos",
  badges: "Credenciales",
  agenda: "Agenda",
  staff: "Staff",
  gates: "Puntos de acceso",
  "capacity-control": "Control de capacidad",
  communications: "Comunicaciones",
};

const routeByModule: Partial<Record<EventModule, string>> = {
  overview: "/",
  access: "/reservations",
  attendees: "/customers",
  admission: "/check-in",
  resources: "/tables",
  operations: "/operations",
  activity: "/timeline",
  analytics: "/statistics",
  notifications: undefined,
  ticketing: undefined,
  payments: undefined,
  badges: undefined,
  agenda: undefined,
  staff: undefined,
  gates: undefined,
  "capacity-control": undefined,
  communications: undefined,
};

const eventBlueprints: EventBlueprint[] = [
  {
    eventType: "nightlife",
    label: "Boliche",
    description: "Operación centrada en reservas, recursos, ingreso y control en tiempo real.",
    operationalModel: "mixed",
    allowedOperationalModels: ["reserved", "mixed", "guest-list"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity"],
    optionalModules: ["analytics", "notifications"],
    futureModules: [],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "analytics", "notifications"],
    admissionMethods: ["qr", "code", "manual", "list", "invitation"],
    resourceTypes: ["table", "zone", "area"],
    capacityRequired: true,
    icon: "moon",
    tone: "violet",
  },
  {
    eventType: "concert",
    label: "Concierto",
    description: "Operación ágil de acceso, control de ingreso y visión en vivo.",
    operationalModel: "general-admission",
    allowedOperationalModels: ["general-admission", "mixed"],
    requiredModules: ["overview", "access", "attendees", "admission", "operations", "activity", "gates"],
    optionalModules: ["analytics", "notifications"],
    futureModules: ["ticketing", "capacity-control", "payments"],
    enabledModules: ["overview", "access", "attendees", "admission", "operations", "activity", "analytics", "notifications", "gates"],
    admissionMethods: ["qr", "code", "manual", "ticket", "credential"],
    resourceTypes: ["zone", "area"],
    capacityRequired: true,
    icon: "music",
    tone: "cyan",
  },
  {
    eventType: "festival",
    label: "Festival",
    description: "Alta rotación de acceso con recursos abiertos y operación distribuida.",
    operationalModel: "general-admission",
    allowedOperationalModels: ["general-admission", "mixed"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "gates"],
    optionalModules: ["analytics", "notifications"],
    futureModules: ["ticketing", "capacity-control"],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "analytics", "notifications", "gates"],
    admissionMethods: ["qr", "manual", "ticket", "list", "invitation"],
    resourceTypes: ["zone", "area"],
    capacityRequired: true,
    icon: "spark",
    tone: "emerald",
  },
  {
    eventType: "corporate",
    label: "Corporativo",
    description: "Control de asistentes, recursos reservados y operación formal.",
    operationalModel: "reserved",
    allowedOperationalModels: ["reserved", "mixed", "accreditation"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "gates"],
    optionalModules: ["analytics", "notifications"],
    futureModules: ["badges", "agenda", "communications"],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "analytics", "notifications", "gates"],
    admissionMethods: ["qr", "code", "manual", "list", "credential"],
    resourceTypes: ["room", "table", "booth"],
    capacityRequired: true,
    icon: "briefcase",
    tone: "amber",
  },
  {
    eventType: "conference",
    label: "Conferencia",
    description: "Flujo centrado en asistentes, acreditación y recursos de sala.",
    operationalModel: "reserved",
    allowedOperationalModels: ["reserved", "accreditation", "general-admission"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "activity", "gates"],
    optionalModules: ["analytics", "notifications"],
    futureModules: ["agenda", "badges", "communications"],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "activity", "analytics", "notifications", "gates"],
    admissionMethods: ["qr", "code", "manual", "list", "credential"],
    resourceTypes: ["room", "zone"],
    capacityRequired: true,
    icon: "presentation",
    tone: "sky",
  },
  {
    eventType: "seminar",
    label: "Seminario",
    description: "Formato informativo con control de asistentes y espacios limitados.",
    operationalModel: "reserved",
    allowedOperationalModels: ["reserved", "accreditation", "general-admission"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "activity", "gates"],
    optionalModules: ["analytics", "notifications"],
    futureModules: ["agenda", "badges", "communications"],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "activity", "analytics", "notifications", "gates"],
    admissionMethods: ["qr", "code", "manual", "list", "credential"],
    resourceTypes: ["room", "zone"],
    capacityRequired: true,
    icon: "presentation",
    tone: "sky",
  },
  {
    eventType: "workshop",
    label: "Taller",
    description: "Interacción cercana con salas, asistentes y control simple de acceso.",
    operationalModel: "reserved",
    allowedOperationalModels: ["reserved", "general-admission", "mixed"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "activity", "gates"],
    optionalModules: ["analytics", "notifications"],
    futureModules: ["agenda", "badges", "communications"],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "activity", "analytics", "notifications", "gates"],
    admissionMethods: ["qr", "code", "manual", "list", "credential"],
    resourceTypes: ["room", "zone"],
    capacityRequired: true,
    icon: "tool",
    tone: "emerald",
  },
  {
    eventType: "theatre",
    label: "Teatro / Obra",
    description: "Escenario con asientos, sectores y control de ocupación.",
    operationalModel: "reserved",
    allowedOperationalModels: ["reserved", "general-admission"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "gates"],
    optionalModules: ["analytics", "notifications"],
    futureModules: ["ticketing", "payments"],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "analytics", "notifications", "gates"],
    admissionMethods: ["qr", "code", "manual", "ticket", "invitation"],
    resourceTypes: ["seat", "zone", "box"],
    capacityRequired: true,
    icon: "theatre",
    tone: "rose",
  },
  {
    eventType: "private",
    label: "Privado",
    description: "Operación compacta con lista cerrada y recursos asignados.",
    operationalModel: "guest-list",
    allowedOperationalModels: ["guest-list", "reserved", "mixed"],
    requiredModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity"],
    optionalModules: ["notifications"],
    futureModules: [],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "notifications"],
    admissionMethods: ["code", "manual", "list", "invitation"],
    resourceTypes: ["table", "zone", "area"],
    capacityRequired: true,
    icon: "lock",
    tone: "violet",
  },
  {
    eventType: "custom",
    label: "Personalizado",
    description: "El usuario define modelo operativo, módulos, admisión y recursos.",
    operationalModel: "custom",
    allowedOperationalModels: ["general-admission", "reserved", "mixed", "guest-list", "accreditation", "assigned-resources", "custom"],
    requiredModules: ["overview"],
    optionalModules: ["access", "attendees", "admission", "resources", "operations", "activity", "analytics", "notifications"],
    futureModules: ["ticketing", "payments", "badges", "agenda", "staff", "gates", "capacity-control", "communications"],
    enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "analytics", "notifications"],
    admissionMethods: ["qr", "code", "manual", "list", "ticket", "invitation", "credential"],
    resourceTypes: ["table", "seat", "zone", "box", "room", "booth", "area"],
    capacityRequired: false,
    icon: "grid",
    tone: "sky",
  },
];

export function getEventBlueprints() {
  return eventBlueprints;
}

export function getEventBlueprint(eventType: EventType) {
  return eventBlueprints.find((blueprint) => blueprint.eventType === eventType) ?? eventBlueprints.at(-1)!;
}

export function getEventTypeLabel(eventType: EventType) {
  return getEventBlueprint(eventType).label;
}

export function getEventModuleLabel(module: EventModule | string) {
  return module in moduleLabels ? moduleLabels[module as EventModule] : module;
}

export function getOperationalModelLabel(model: OperationalModel) {
  if (model === "general-admission") return "Ingreso general";
  if (model === "reserved") return "Reservado";
  if (model === "mixed") return "Mixto";
  if (model === "guest-list") return "Lista de invitados";
  if (model === "accreditation") return "Acreditación";
  if (model === "assigned-resources") return "Recursos asignados";
  return "Personalizado";
}

export function isModuleEnabled(event: Pick<Event, "enabledModules">, module: EventModule) {
  return event.enabledModules.includes(module);
}

export function getEnabledModules(event: Pick<Event, "enabledModules">) {
  return event.enabledModules;
}

export function getEventNavigation(event: Pick<Event, "eventType" | "enabledModules">): EventNavigationGroup[] {
  const blueprint = getEventBlueprint(event.eventType);
  const orderedModules: EventModule[] = [
    "overview",
    "access",
    "attendees",
    "admission",
    "resources",
    "operations",
    "activity",
    "analytics",
    "notifications",
  ];

  const activeItems = orderedModules.map((module) => {
    const future = blueprint.futureModules.includes(module);

    return {
      module,
      label: getEventModuleLabel(module),
      route: routeByModule[module],
      enabled: event.enabledModules.includes(module),
      required: blueprint.requiredModules.includes(module),
      future,
      description:
        module === "overview"
          ? "Resumen operativo del evento."
          : module === "access"
            ? "Fuentes de acceso y listas operativas."
            : module === "attendees"
              ? "Personas vinculadas al evento."
              : module === "admission"
                ? "Ingreso y validación en puerta."
                : module === "resources"
                  ? "Espacios, mesas y recursos."
                  : module === "operations"
                    ? "Alertas y control operativo."
                    : module === "activity"
                      ? "Registro cronológico de acciones."
                      : module === "analytics"
                        ? "Métricas y tendencias."
                        : "Mensajes y feedback.",
    };
  });

  const futureItems = blueprint.futureModules.map((module) => ({
    module,
    label: getEventModuleLabel(module),
    route: undefined,
    enabled: false,
    required: false,
    future: true,
    description: module === "ticketing" ? "Venta y emisión de tickets próximamente; la validación de tickets ya está disponible." : "Próximamente.",
  }));

  return [
    {
      title: "Módulos incluidos",
      items: activeItems.filter((item) => item.enabled),
    },
    {
      title: "Próximos módulos",
      items: [...activeItems.filter((item) => !item.enabled && !item.future), ...futureItems],
    },
  ];
}

export function buildEventDraft(blueprint: EventBlueprint, timezone = getDefaultTimezone()): EventDraft {
  return {
    name: blueprint.label === "Personalizado" ? "Nuevo evento" : blueprint.label,
    description: blueprint.description,
    date: getCurrentDateForTimezone(timezone),
    startTime: "21:00",
    endTime: "03:00",
    timezone,
    venueId: "",
    venue: "",
    capacity: blueprint.capacityRequired ? "200" : "0",
    operationalModel: blueprint.operationalModel,
    enabledModules: [...blueprint.enabledModules],
    admissionMethods: [...blueprint.admissionMethods],
    resourceTypes: [...blueprint.resourceTypes],
  };
}

export function buildEventFromDraft(params: {
  organizationId: string;
  blueprint: EventBlueprint;
  draft: EventDraft;
  status?: EventStatus;
  id?: string;
}): Event {
  const nextId = params.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id: nextId,
    organizationId: params.organizationId,
    name: params.draft.name,
    description: params.draft.description || params.blueprint.description,
    eventType: params.blueprint.eventType,
    status: params.status ?? "published",
    startAt: `${params.draft.date} ${params.draft.startTime}`,
    endAt: params.draft.endTime ? `${params.draft.date} ${params.draft.endTime}` : undefined,
    timezone: params.draft.timezone,
    venueId: params.draft.venueId || undefined,
    venue: params.draft.venue,
    capacity: Number.parseInt(params.draft.capacity, 10) || 0,
    enabledModules: params.draft.enabledModules,
    operationalModel: params.draft.operationalModel,
    admissionMethods: params.draft.admissionMethods,
    resourceTypes: params.draft.resourceTypes,
    icon: params.blueprint.icon,
    metadata: {
      blueprint: params.blueprint.eventType,
      createdFromWizard: true,
    },
  };
}
