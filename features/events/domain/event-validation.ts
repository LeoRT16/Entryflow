import type { Event, Venue } from "@/features/domain/types";
import { getEventBlueprint, getEventBlueprints } from "./event-blueprints";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/;
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function validTimezone(timezone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); return true; } catch { return false; }
}

export function validateEventForPersistence(event: Event, venues: Venue[] = []) {
  const errors: string[] = [];
  if (!event.name.trim()) errors.push("El nombre del evento es obligatorio.");
  if (!Number.isFinite(event.capacity) || event.capacity < 0) errors.push("La capacidad debe ser un número válido no negativo.");
  if (!event.startAt || !LOCAL_DATE_TIME.test(event.startAt)) errors.push("La fecha y hora de inicio no son válidas.");
  if (event.endAt && !LOCAL_DATE_TIME.test(event.endAt)) errors.push("La fecha y hora de fin no son válidas.");
  if (!event.timezone || !validTimezone(event.timezone)) errors.push("La zona horaria no es válida.");
  if (event.venueId && !venues.some((venue) => venue.id === event.venueId && venue.organizationId === event.organizationId)) errors.push("El venue seleccionado no pertenece a esta organización.");
  const blueprint = getEventBlueprint(event.eventType);
  const supportedBlueprint = getEventBlueprints().some((item) => item.eventType === event.eventType);
  if (!supportedBlueprint) errors.push("El tipo de evento no es válido.");
  if (blueprint && !blueprint.allowedOperationalModels.includes(event.operationalModel)) errors.push("El modelo operativo no es compatible con el tipo de evento.");
  if (blueprint && blueprint.requiredModules.some((module) => !event.enabledModules.includes(module))) errors.push("Faltan capacidades esenciales del evento.");
  return errors;
}

export function validateEventClockInput({ name, date, startTime, endTime, timezone, capacity, eventType }: { name: string; date: string; startTime: string; endTime?: string; timezone: string; capacity: string; eventType: Event["eventType"] }) {
  const errors: string[] = [];
  if (!name.trim()) errors.push("El nombre del evento es obligatorio.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) errors.push("La fecha del evento no es válida.");
  if (!CLOCK_TIME.test(startTime)) errors.push("La hora de inicio no es válida.");
  if (endTime && !CLOCK_TIME.test(endTime)) errors.push("La hora de fin no es válida.");
  if (!validTimezone(timezone)) errors.push("La zona horaria no es válida.");
  if (capacity.trim() && (!Number.isFinite(Number(capacity)) || Number(capacity) < 0)) errors.push("La capacidad debe ser un número válido no negativo.");
  if (!getEventBlueprints().some((item) => item.eventType === eventType)) errors.push("Selecciona un tipo de evento válido.");
  return errors;
}
