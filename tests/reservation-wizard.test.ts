import assert from "node:assert/strict";
import test from "node:test";

import {
  countDraftPendingGuests,
  countDraftRegisteredGuests,
  createReservationWizardDefaults,
  createReservationSubmissionGate,
  resolveInitialReservationResourceId,
  resolveReservationCapacityViolation,
  runReservationSubmission,
} from "../features/reservations/domain/reservation-wizard";
import {
  buildGuestList,
  createGuestDraft,
  syncGuestDraftsWithHolder,
} from "../features/reservations/domain/reservation-draft";
import { resolveReservationPaymentDraft } from "../features/reservations/domain/reservation-domain";
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
  assert.equal(defaults.amount, "");
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
