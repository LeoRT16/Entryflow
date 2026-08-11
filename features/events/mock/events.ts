import { mapLegacyEventToEvent } from "@/features/domain/compatibility";
import type { Event, Organization } from "@/features/domain/types";
import { buildEventFromDraft, buildEventDraft, getEventBlueprint } from "@/features/events/domain";
import { checkInEvents } from "@/features/check-in/mock/check-in";

export const organization: Organization = {
  id: "org-la-rota-carlota",
  name: "La Rota Carlota",
  slug: "la-rota-carlota",
  status: "active",
  timezone: "America/La_Paz",
  branding: {
    primaryColor: "#22d3ee",
    accentColor: "#a78bfa",
    surfaceColor: "#0f172a",
    textColor: "#f8fafc",
  },
  settings: {
    locale: "es-BO",
    timezone: "America/La_Paz",
    timeFormat: "24h",
    dateFormat: "DD/MM/YYYY",
    terminology: {
      event: "Evento",
      access: "Acceso",
      attendee: "Invitado",
    },
  },
  metadata: {
    venues: [
      {
        id: "venue-la-rota-carlota",
        organizationId: "org-la-rota-carlota",
        name: "La Rota Carlota",
        description: "Sede principal para reservas, acceso y operación nocturna.",
        address: "Centro urbano",
        city: "La Paz",
        country: "Bolivia",
        status: "active",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-10T09:00:00.000Z",
      },
    ],
    sectors: [
      {
        id: "sector-planta-baja",
        venueId: "venue-la-rota-carlota",
        name: "Planta Baja",
        description: "Mesas principales frente a pista.",
        capacity: 30,
        order: 1,
        status: "active",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-10T09:00:00.000Z",
      },
      {
        id: "sector-planta-alta",
        venueId: "venue-la-rota-carlota",
        name: "Planta Alta",
        description: "Nivel superior con vista general.",
        capacity: 20,
        order: 2,
        status: "active",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-10T09:00:00.000Z",
      },
      {
        id: "sector-patio-a",
        venueId: "venue-la-rota-carlota",
        name: "Patio A",
        description: "Sector lateral con lounges y mesas.",
        capacity: 24,
        order: 3,
        status: "active",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-10T09:00:00.000Z",
      },
      {
        id: "sector-patio-b",
        venueId: "venue-la-rota-carlota",
        name: "Patio B",
        description: "Zona exterior con flujo mixto.",
        capacity: 24,
        order: 4,
        status: "active",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-10T09:00:00.000Z",
      },
    ],
  },
};

const concertBlueprint = getEventBlueprint("concert");
const corporateBlueprint = getEventBlueprint("corporate");
const theatreBlueprint = getEventBlueprint("theatre");
const customBlueprint = getEventBlueprint("custom");

export const currentEventId = "noche-carlota";

export const initialEvents: Event[] = [
  mapLegacyEventToEvent(checkInEvents[0], organization.id),
  buildEventFromDraft({
    organizationId: organization.id,
    blueprint: concertBlueprint,
    id: "concierto-horizonte",
    draft: {
      ...buildEventDraft(concertBlueprint),
      name: "Concierto Horizonte",
      description: "Evento mock de prueba sin recursos asignados.",
      date: "15 de agosto de 2026",
      startTime: "22:30",
      endTime: "02:30",
      venueId: "venue-la-rota-carlota",
      venue: "La Rota Carlota",
      capacity: "1800",
      enabledModules: concertBlueprint.enabledModules,
      admissionMethods: concertBlueprint.admissionMethods,
      resourceTypes: concertBlueprint.resourceTypes,
    },
    status: "published",
  }),
  buildEventFromDraft({
    organizationId: organization.id,
    blueprint: corporateBlueprint,
    id: "cumbre-corporativa-2026",
    draft: {
      ...buildEventDraft(corporateBlueprint),
      name: "Cumbre Corporativa 2026",
      description: "Reunión ejecutiva con recursos reservados y acreditación.",
      date: "20 de agosto de 2026",
      startTime: "09:00",
      endTime: "13:30",
      venueId: "venue-la-rota-carlota",
      venue: "La Rota Carlota",
      capacity: "320",
      enabledModules: corporateBlueprint.enabledModules,
      admissionMethods: corporateBlueprint.admissionMethods,
      resourceTypes: corporateBlueprint.resourceTypes,
    },
    status: "published",
  }),
  buildEventFromDraft({
    organizationId: organization.id,
    blueprint: theatreBlueprint,
    id: "obra-la-noche",
    draft: {
      ...buildEventDraft(theatreBlueprint),
      name: "Obra La Noche",
      description: "Función con asientos, boxes y ocupación controlada.",
      date: "2 de septiembre de 2026",
      startTime: "20:00",
      endTime: "22:15",
      venueId: "venue-la-rota-carlota",
      venue: "La Rota Carlota",
      capacity: "420",
      enabledModules: theatreBlueprint.enabledModules,
      admissionMethods: theatreBlueprint.admissionMethods,
      resourceTypes: theatreBlueprint.resourceTypes,
    },
    status: "finished",
  }),
  buildEventFromDraft({
    organizationId: organization.id,
    blueprint: customBlueprint,
    id: "evento-privado-altura",
    draft: {
      ...buildEventDraft(customBlueprint),
      name: "Evento Privado Altura",
      description: "Configuración personalizada para una experiencia íntima.",
      date: "11 de septiembre de 2026",
      startTime: "19:30",
      endTime: "01:00",
      venueId: "venue-la-rota-carlota",
      venue: "La Rota Carlota",
      capacity: "90",
      enabledModules: ["overview", "access", "attendees", "admission", "resources", "operations", "activity", "notifications"],
      admissionMethods: ["list", "invitation", "manual"],
      resourceTypes: ["table", "zone", "room"],
    },
    status: "draft",
  }),
];

export function buildEventLibraryEventCount(events: Event[]) {
  return {
    active: events.filter((event) => event.status === "live").length,
    upcoming: events.filter((event) => event.status === "published" || event.status === "draft").length,
    finished: events.filter((event) => event.status === "finished" || event.status === "cancelled").length,
  };
}
