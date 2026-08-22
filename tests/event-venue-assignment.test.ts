import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildEventFromDraft, buildEventDraft, getEventBlueprint } from "../features/events/domain";
import { resolveManagedVenueById } from "../features/events/domain/event-venue-boundary";
import { buildEventVenueChangeConfirmation, shouldWarnBeforeChangingEventVenue } from "../features/events/domain/event-venue-assignment";
import { isTableInCurrentEventContext } from "../features/business-rules/domain/ownership-guards";

function extractBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  if (start === -1 || end === -1) {
    throw new Error(`Unable to extract block between ${startMarker} and ${endMarker}.`);
  }

  return source.slice(start, end);
}

test("event venue change guard warns only when the venue changes and operational data already exists", () => {
  assert.equal(
    shouldWarnBeforeChangingEventVenue({
      eventId: "event-1",
      currentVenueId: "venue-a",
      nextVenueId: "venue-b",
      reservations: [{ eventId: "event-1" }],
      guests: [],
      tables: [],
      checkIns: [],
    }),
    true,
  );

  assert.equal(
    shouldWarnBeforeChangingEventVenue({
      eventId: "event-1",
      currentVenueId: "venue-a",
      nextVenueId: "venue-a",
      reservations: [{ eventId: "event-1" }],
      guests: [],
      tables: [],
      checkIns: [],
    }),
    false,
  );
});

test("buildEventFromDraft persists the selected venueId", () => {
  const blueprint = getEventBlueprint("custom");
  const event = buildEventFromDraft({
    organizationId: "org-1",
    blueprint,
    draft: {
      name: "Evento E2E",
      description: "Evento para validar venue",
      date: "8 de agosto de 2026",
      startTime: "21:00",
      endTime: "03:00",
      timezone: "America/La_Paz",
      venueId: "venue-1",
      venue: "La Rota Carlota",
      capacity: "200",
      operationalModel: "mixed",
      enabledModules: ["overview"],
      admissionMethods: ["manual", "list", "code"],
      resourceTypes: [],
    },
    id: "event-1",
  });

  assert.equal(event.venueId, "venue-1");
  assert.equal(event.venue, "La Rota Carlota");
});

test("buildEventFromDraft preserves a free-text location when no managed venue is selected", () => {
  const blueprint = getEventBlueprint("custom");
  const event = buildEventFromDraft({
    organizationId: "org-1",
    blueprint,
    draft: {
      name: "Evento E2E",
      description: "Evento para validar venue libre",
      date: "8 de agosto de 2026",
      startTime: "21:00",
      endTime: "03:00",
      timezone: "America/La_Paz",
      venueId: "",
      venue: "Bolivar 175",
      capacity: "200",
      operationalModel: "mixed",
      enabledModules: ["overview"],
      admissionMethods: ["manual", "list", "code"],
      resourceTypes: [],
    },
    id: "event-1",
  });

  assert.equal(event.venueId, undefined);
  assert.equal(event.venue, "Bolivar 175");
});

test("buildEventDraft starts without a venue so an empty-venue org cannot inherit another org's venue label", () => {
  const blueprint = getEventBlueprint("custom");
  const draft = buildEventDraft(blueprint);

  assert.equal(draft.venueId, "");
  assert.equal(draft.venue, "");
});

test("managed venue selection resolves only by canonical venueId", () => {
  const venues = [{ id: "venue-a" }, { id: "venue-b" }];

  assert.equal(resolveManagedVenueById({ venueId: "venue-b", venues })?.id, "venue-b");
  assert.equal(resolveManagedVenueById({ venueId: "", venues }), null);
  assert.equal(resolveManagedVenueById({ venueId: "venue-c", venues }), null);
});

test("event editor modal keeps the venue selector bound to venueId and persists venueId on save", () => {
  const source = readFileSync(new URL("../features/events/components/event-editor-modal.tsx", import.meta.url), "utf8");

  assert.match(source, /value=\{eventVenueId\}/);
  assert.match(source, /venueId:\s*nextVenueId,/);
  assert.match(source, /confirm\(\{/);
  assert.doesNotMatch(source, /window\.confirm\(/);
  assert.match(source, /resolveManagedVenueById\(\{/);
  assert.match(source, /Sin venue seleccionado/);
  assert.doesNotMatch(source, /venue\.name === event\.venue/);
  assert.doesNotMatch(source, /defaultVenue/);
});

test("venue change confirmation copy stays on the shared confirmation pattern", () => {
  const confirmation = buildEventVenueChangeConfirmation({
    eventName: "Sabado 22 de Agosto",
    currentVenueName: "La Rota Carlota",
    nextVenueName: "Rotita",
  });

  assert.equal(confirmation.title, "Confirmar cambio de venue");
  assert.equal(confirmation.confirmLabel, "Cambiar venue");
  assert.equal(confirmation.cancelLabel, "Cancelar");
  assert.equal(confirmation.tone, "warning");
  assert.match(confirmation.description, /Sabado 22 de Agosto/);
  assert.match(confirmation.description, /La Rota Carlota/);
  assert.match(confirmation.description, /Rotita/);
});

test("table context does not accept a venueId that merely matches the event id", () => {
  assert.equal(
    isTableInCurrentEventContext(
      { id: "table-1", eventId: "event-2", venueId: "event-1" },
      { id: "event-1", venueId: "venue-1" },
      null,
    ),
    false,
  );
});

test("event library shows edit on every card and opens the modal for the clicked event", () => {
  const source = readFileSync(new URL("../features/events/components/event-library.tsx", import.meta.url), "utf8");

  assert.match(source, /onSelectEvent=\{setCurrentEventId\}/);
  assert.match(source, /onEditEvent=\{openEventEditor\}/);
  assert.match(source, /onEditEvent=\{\(\) => onEditEvent\(event\)\}/);
  assert.match(source, /current \? null : \(/);
  assert.match(source, /Editar evento/);
  assert.match(source, /event=\{editorEvent\}/);
  assert.match(source, /onPatchEvent=\{updateEvent\}/);
  assert.match(source, /const organizationVenues = useMemo\(\(\) => getVenuesForOrganization\(currentOrganization\.id, venues\), \[currentOrganization\.id, venues\]\);/);
  assert.match(source, /venues=\{organizationVenues\}/);
});

test("workspace service updates an event without reselecting it as current", () => {
  const source = readFileSync(new URL("../services/workspace-service.tsx", import.meta.url), "utf8");
  const updateEventBlock = extractBlock(source, "const updateEvent = useCallback(", "  const createOrganization = useCallback(");

  assert.match(updateEventBlock, /requirePermission\("event\.edit"\);/);
  assert.match(updateEventBlock, /setEvents\(\(current\) => current\.map\(\(item\) => \(item\.id === event\.id \? event : item\)\)\);/);
  assert.match(updateEventBlock, /await persist\("event", event\);/);
  assert.match(updateEventBlock, /return event;/);
  assert.doesNotMatch(updateEventBlock, /setCurrentEventIdState\(event\.id\)/);
});

test("event creation wizard selects and persists organization venues through venueId", () => {
  const source = readFileSync(new URL("../features/events/components/event-creation-wizard.tsx", import.meta.url), "utf8");

  assert.match(source, /resolveManagedVenueById\(\{/);
  assert.match(source, /value=\{draft\.venueId\}/);
  assert.match(source, /venueId: selectedVenue\?\.id \?\? ""/);
  assert.match(source, /<option value="">Sin venue seleccionado<\/option>/);
  assert.match(source, /label="Lugar \/ ubicación"/);
  assert.doesNotMatch(source, /defaultVenue/);
});
