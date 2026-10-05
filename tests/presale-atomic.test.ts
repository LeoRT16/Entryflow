import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createReservationBundle } from "../features/reservations/domain/reservation-domain";
import { createPresaleCommercialSnapshot, defaultEventCommercialConfig } from "../features/events/domain/commercial-config";
import { createGuestDraft } from "../features/reservations/domain/reservation-draft";

test("presale quantity 500 does not materialize placeholder guests", () => {
  const result = createReservationBundle({
    eventId: "event-1", eventName: "Event", date: "2026-10-01", time: "20:00", reservationType: "Preventa",
    holderName: "Buyer", holderLastName: "One", documentValue: "CI", whatsapp: "70000000", email: "",
    preferences: "", vip: false, frequent: false, notes: "", guests: [], accessQuantity: 500,
    amount: "35000", advance: "0", paymentMethod: "Efectivo", paymentStatus: "Pendiente", observations: "",
    commercialSnapshot: createPresaleCommercialSnapshot({ ...defaultEventCommercialConfig, presale: { enabled: true, pricePerAccess: 70 } }, 500),
  });
  assert.equal(result.reservation.commercialSnapshot?.quantity, 500);
  assert.equal(result.reservation.commercialSnapshot?.totalPrice, 35000);
  assert.equal(result.guests.length, 0);
});

test("presale server boundary validates quantity, commercial total, and guest capacity", () => {
  const sql = readFileSync("supabase/migrations/20261016000000_presale_reservation_atomic.sql", "utf8");
  assert.match(sql, /presale_commercial_invalid/);
  assert.match(sql, /presale_capacity_exceeded/);
  assert.match(sql, /p_reservation->'commercial_snapshot'->>'quantity'/);
  assert.match(sql, /reservation_type.*Preventa/);
  assert.doesNotMatch(sql, /resource_id/);
  assert.match(sql, /where id=\(p_reservation->>'event_id'\)::uuid and deleted_at is null for update/);
  assert.match(sql, /unit_price numeric/);
  assert.match(sql, /prepare_guest_access_atomic/);
});

test("presale guest boundary is separate from physical capacity and rejects incomplete identities", () => {
  const sql = readFileSync("supabase/migrations/20261016000001_presale_guest_atomic.sql", "utf8");
  assert.match(sql, /presale_guest_incomplete/);
  assert.match(sql, /presale_capacity_exceeded/);
  assert.match(sql, /create_guest_with_access_ordinal/);
  assert.match(sql, /prepare_guest_access_atomic/);
  assert.match(sql, /where id=p_reservation_id and deleted_at is null for update/);
});

test("presale edit routes genuinely new drafts through the atomic append boundary", () => {
  const source = readFileSync("services/workspace-service.tsx", "utf8");
  const start = source.indexOf('if (reservation.reservationType === "Preventa") {', source.indexOf("const updateReservation = useCallback"));
  const end = source.indexOf('const selectedResource = input.selectedResource ?? input.selectedTable;', start);
  const block = source.slice(start, end);
  assert.match(block, /existingById = new Map/);
  assert.match(block, /newDrafts = completeGuestDrafts\.filter/);
  assert.match(block, /repositories\.reservations\.addPresaleGuestAtomic/);
  assert.doesNotMatch(block, /persistReservationThenGuests/);
  assert.match(block, /guestIds: existingGuests\.map\(\(guest\) => guest\.id\)/);
});

test("malformed historical guest ids do not hydrate a null placeholder", () => {
  const source = readFileSync("lib/supabase/mappers.ts", "utf8");
  assert.match(source, /guestIds: \(row\.guest_ids \?\? \[\]\)\.filter\(\(id\): id is string => Boolean\(id\)\)/);
});

test("presale money uses exact numeric arithmetic for repeating decimal prices", () => {
  const snapshot = createPresaleCommercialSnapshot({
    ...defaultEventCommercialConfig,
    presale: { enabled: true, pricePerAccess: 33.33 },
  }, 3);
  assert.equal(snapshot.totalPrice, 99.99);
});
