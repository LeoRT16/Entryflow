import assert from "node:assert/strict";
import test from "node:test";

import {
  countDraftPendingGuests,
  countDraftRegisteredGuests,
  createReservationWizardDefaults,
  createReservationSubmissionGate,
  preferEventLayoutMappedResources,
  resolveReservationWizardResourceOptions,
  resolveInitialReservationResourceId,
  resolveReservationCapacityViolation,
  runReservationSubmission,
} from "../features/reservations/domain/reservation-wizard";
import {
  buildGuestList,
  createGuestDraft,
  syncPresaleFirstGuestDraftWithHolder,
  syncGuestDraftsWithHolder,
} from "../features/reservations/domain/reservation-draft";
import { createReservationBundle, resolveReservationPaymentDraft } from "../features/reservations/domain/reservation-domain";
import { createPresaleCommercialSnapshot, defaultEventCommercialConfig } from "../features/events/domain/commercial-config";
import type { GuestDraft } from "../features/reservations/types";

test("reservation guest progress is scoped to the draft", () => {
  const guestDrafts: GuestDraft[] = [
    { id: "guest-1", name: "Ana", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-2", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-3", name: "Luis", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-4", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-5", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
  ];

  assert.equal(countDraftRegisteredGuests(guestDrafts), 2);
  assert.equal(countDraftPendingGuests(5, 2), 3);
});

test("presale creates one purchase with one independent access per complete person", () => {
  const guests = ["Ana", "Carlos", "María", "José", "Pedro"].map((name, index) => ({
    ...createGuestDraft(index),
    name,
    document: `CI-${index + 1}`,
    whatsapp: `7000000${index + 1}`,
  }));
  const reservation = createReservationBundle({
    eventId: "event-1",
    eventName: "Evento de prueba",
    date: "2026-09-02",
    time: "21:00",
    reservationType: "Preventa",
    holderName: "Leo",
    holderLastName: "Rodríguez",
    documentValue: "CI-COMPRADOR",
    whatsapp: "70000000",
    email: "leo@example.com",
    preferences: "",
    vip: false,
    frequent: false,
    notes: "",
    guests,
    amount: "250",
    advance: "0",
    paymentMethod: "Efectivo",
    paymentStatus: "Pendiente",
    observations: "",
    commercialSnapshot: createPresaleCommercialSnapshot({
      ...defaultEventCommercialConfig,
      currency: "BOB",
      presale: { enabled: true, pricePerAccess: 50 },
    }, guests.length),
  });

  assert.equal(reservation.reservation.tableId, undefined);
  assert.equal(reservation.reservation.resourceId, undefined);
  assert.equal(reservation.reservation.name, "Preventa · Leo Rodríguez");
  assert.equal(reservation.reservation.commercialSnapshot?.quantity, 5);
  assert.equal(reservation.reservation.commercialSnapshot?.totalPrice, 250);
  assert.equal(reservation.guests.length, 5);
  assert.equal(new Set(reservation.guests.map((guest) => guest.invitationCode)).size, 5);
  assert.equal(reservation.guests.every((guest) => guest.tableId === undefined && guest.tableName === undefined), true);
  assert.equal(reservation.guests.some((guest) => guest.guestName === "Leo Rodríguez"), false);
});

test("mesa still requires a resource and presale rejects incomplete people", () => {
  const input = {
    eventId: "event-1",
    eventName: "Evento de prueba",
    date: "2026-09-02",
    time: "21:00",
    reservationType: "Mesa" as const,
    holderName: "Leo",
    holderLastName: "Rodríguez",
    documentValue: "CI",
    whatsapp: "70000000",
    email: "leo@example.com",
    preferences: "",
    vip: false,
    frequent: false,
    notes: "",
    guests: [createGuestDraft(0)],
    amount: "400",
    advance: "0",
    paymentMethod: "Efectivo" as const,
    paymentStatus: "Pendiente" as const,
    observations: "",
  };

  assert.throws(() => createReservationBundle(input), /resource is required/);
  assert.throws(() => createReservationBundle({ ...input, reservationType: "Preventa", selectedResource: undefined }), /complete access/);
});

test("presale preloads the first access once and preserves an explicit replacement", () => {
  const holder = { holderName: "Leo", holderLastName: "Rojas", documentValue: "CI-1", whatsapp: "70000001" };
  const firstDraft = createGuestDraft(0);
  const preloaded = syncPresaleFirstGuestDraftWithHolder([firstDraft], holder, null);

  assert.equal(preloaded[0].name, "Leo Rojas");
  assert.equal(preloaded[0].document, "CI-1");
  assert.equal(preloaded[0].whatsapp, "70000001");

  const replaced = [{ ...preloaded[0], name: "Ana Ruiz", document: "CI-2", whatsapp: "70000002" }];
  const afterHolderChange = syncPresaleFirstGuestDraftWithHolder(replaced, { ...holder, holderName: "Marta" }, holder);
  assert.equal(afterHolderChange[0].name, "Ana Ruiz");
  assert.equal(afterHolderChange[0].document, "CI-2");
  assert.equal(afterHolderChange[0].whatsapp, "70000002");
});

test("paid payment follows the current total for presale and mesa drafts", () => {
  assert.equal(resolveReservationPaymentDraft("50", "0", "Pagado").advance, "50");
  assert.equal(resolveReservationPaymentDraft("250", "0", "Pagado").advance, "250");
  assert.equal(resolveReservationPaymentDraft("850", "0", "Pagado").advance, "850");
});

test("presale draft economics allow zero accesses until confirmation", () => {
  const snapshot = createPresaleCommercialSnapshot({
    ...defaultEventCommercialConfig,
    currency: "BOB",
    presale: { enabled: true, pricePerAccess: 50 },
  }, 0);

  assert.equal(snapshot.quantity, 0);
  assert.equal(snapshot.totalPrice, 0);
});

test("existing guests from the same event do not inflate draft progress", () => {
  const guestDrafts: GuestDraft[] = [
    { id: "guest-1", name: "Ana", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-2", name: "Luis", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-3", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-4", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-5", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
  ];

  const existingEventGuests = 53;
  assert.equal(countDraftRegisteredGuests(guestDrafts), 2);
  assert.equal(existingEventGuests, 53);
  assert.equal(countDraftPendingGuests(5, countDraftRegisteredGuests(guestDrafts)), 3);
});

test("a new reservation does not silently select the first venue resource", () => {
  const currentVenueResources = [{ id: "resource-a" }, { id: "resource-b" }];

  assert.equal(
    resolveInitialReservationResourceId({
      currentVenueResources,
    }),
    "",
  );

  assert.equal(
    resolveInitialReservationResourceId({
      currentVenueResources,
      resourceId: "resource-b",
    }),
    "resource-b",
  );
});

test("reservation wizard prefers event-layout-mapped resources when any are available", () => {
  const mappedOnly = preferEventLayoutMappedResources([
    { id: "resource-a", eventLayoutResourceId: "layout-resource-a" },
    { id: "resource-b", eventLayoutResourceId: undefined },
    { id: "resource-c", eventLayoutResourceId: "layout-resource-c" },
  ]);

  assert.deepEqual(mappedOnly, [
    { id: "resource-a", eventLayoutResourceId: "layout-resource-a" },
    { id: "resource-c", eventLayoutResourceId: "layout-resource-c" },
  ]);

  const fallback = preferEventLayoutMappedResources([
    { id: "resource-a", eventLayoutResourceId: undefined },
    { id: "resource-b", eventLayoutResourceId: null },
  ]);

  assert.deepEqual(fallback, [
    { id: "resource-a", eventLayoutResourceId: undefined },
    { id: "resource-b", eventLayoutResourceId: null },
  ]);
});

test("reservation wizard falls back to the primary sector when no event-layout mapping exists", () => {
  const resources = resolveReservationWizardResourceOptions(
    [
      { id: "mesa-1", sectorId: "patio-a", eventLayoutResourceId: undefined },
      { id: "mesa-2", sectorId: "patio-a", eventLayoutResourceId: undefined },
      { id: "mesa-3", sectorId: "patio-b", eventLayoutResourceId: undefined },
      { id: "mesa-4", sectorId: null, eventLayoutResourceId: undefined },
    ],
    "patio-a",
  );

  assert.deepEqual(resources, [
    { id: "mesa-1", sectorId: "patio-a", eventLayoutResourceId: undefined },
    { id: "mesa-2", sectorId: "patio-a", eventLayoutResourceId: undefined },
    { id: "mesa-4", sectorId: null, eventLayoutResourceId: undefined },
  ]);
});

test("create defaults always start blank for the selected resource", () => {
  const defaults = createReservationWizardDefaults({
    name: "Evento E2E",
    startAt: "2026-08-11 21:00",
  });

  assert.equal(defaults.selectedResourceId, "");
  assert.equal(defaults.guestCount, 5);
  assert.equal(defaults.guestDrafts.length, 5);
  assert.equal(defaults.holderName, "");
  assert.equal(defaults.holderLastName, "");
  assert.equal(defaults.amount, "0");
  assert.equal(defaults.advance, "");
  assert.equal(defaults.paymentStatus, "Pendiente");
  assert.equal(defaults.guestDrafts[0]?.transferBadge, "Titular");
  assert.equal(defaults.guestDrafts[0]?.name, "");
  assert.equal(defaults.guestDrafts[1]?.transferBadge, "Transferible");
});

test("guest drafts stay blank except for the holder slot", () => {
  const guestDrafts = buildGuestList(3);

  assert.deepEqual(guestDrafts, [
    { id: "guest-1", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Titular" },
    { id: "guest-2", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
    { id: "guest-3", name: "", whatsapp: "", document: "", invitationState: "Pendiente", vip: false, transferBadge: "Transferible" },
  ]);
});

test("holder data syncs only into guest slot one", () => {
  const guestDrafts = [
    createGuestDraft(0),
    createGuestDraft(1),
    createGuestDraft(2),
  ];

  const synced = syncGuestDraftsWithHolder(guestDrafts, {
    holderName: "Ana",
    holderLastName: "Torrez",
    documentValue: "123",
    whatsapp: "+59170000000",
  });

  assert.equal(synced[0]?.name, "Ana Torrez");
  assert.equal(synced[0]?.document, "123");
  assert.equal(synced[0]?.whatsapp, "+59170000000");
  assert.equal(synced[0]?.transferBadge, "Titular");
  assert.equal(synced[1]?.name, "");
  assert.equal(synced[2]?.name, "");
});

test("paid reservations force the advance to match the total and never go negative", () => {
  const paid = resolveReservationPaymentDraft("850", "300", "Pagado");
  assert.equal(paid.advance, "850");
  assert.equal(paid.pendingNumber, 0);

  const partial = resolveReservationPaymentDraft("850", "1000", "Parcial");
  assert.equal(partial.advance, "850");
  assert.equal(partial.pendingNumber, 0);

  const pending = resolveReservationPaymentDraft("850", "", "Pendiente");
  assert.equal(pending.advance, "0");
  assert.equal(pending.pendingNumber, 850);
});

test("reservation capacity validation blocks only over-capacity drafts", () => {
  assert.equal(
    resolveReservationCapacityViolation({
      resourceCapacity: 6,
      guestCount: 5,
      resourceName: "Mesa 2",
    }),
    null,
  );

  assert.equal(
    resolveReservationCapacityViolation({
      resourceCapacity: 6,
      guestCount: 6,
      resourceName: "Mesa 2",
    }),
    null,
  );

  const violation = resolveReservationCapacityViolation({
    resourceCapacity: 6,
    guestCount: 7,
    resourceName: "Mesa 2",
  });

  assert.ok(violation);
  assert.match(violation, /7\/6/);
  assert.match(violation, /Mesa 2/);
});

test("reservation append capacity validation includes the current reservation guests", () => {
  const violation = resolveReservationCapacityViolation({
    resourceCapacity: 6,
    guestCount: 2,
    existingGuestCount: 5,
    resourceName: "Mesa 2",
  });

  assert.ok(violation);
  assert.match(violation, /7\/6/);
});

test("submission gate blocks rapid duplicate create submissions until the first promise resolves", async () => {
  const gate = createReservationSubmissionGate();
  let calls = 0;
  let releaseFirst!: () => void;

  const first = runReservationSubmission(gate, async () => {
    calls += 1;
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    return "created";
  });

  const second = runReservationSubmission(gate, async () => {
    calls += 1;
    return "duplicate";
  });

  assert.equal(gate.isLocked(), true);
  assert.equal(calls, 1);
  assert.equal(await second, undefined);

  releaseFirst();
  assert.equal(await first, "created");
  assert.equal(gate.isLocked(), false);

  const third = runReservationSubmission(gate, async () => {
    calls += 1;
    return "created-again";
  });

  assert.equal(await third, "created-again");
  assert.equal(calls, 2);
});

test("submission gate releases after a rejected persistence attempt", async () => {
  const gate = createReservationSubmissionGate();

  await assert.rejects(
    runReservationSubmission(gate, async () => {
      throw new Error("Supabase rejected the write");
    }),
    /Supabase rejected the write/,
  );

  assert.equal(gate.isLocked(), false);

  const retry = runReservationSubmission(gate, async () => "retry-ok");
  assert.equal(await retry, "retry-ok");
});

test("submission gate blocks update and append reentry on the same dispatcher", async () => {
  const gate = createReservationSubmissionGate();
  let calls = 0;
  let releaseFirst!: () => void;

  const first = runReservationSubmission(gate, async () => {
    calls += 1;
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    return "update";
  });

  const second = runReservationSubmission(gate, async () => {
    calls += 1;
    return "append";
  });

  assert.equal(calls, 1);
  assert.equal(await second, undefined);
  releaseFirst();
  assert.equal(await first, "update");
  assert.equal(gate.isLocked(), false);
});
