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
      venue: "Arena Central",
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
      venue: "Centro de Convenciones",
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
      venue: "Teatro Aurora",
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
      venue: "Casa Altura",
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
