import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("courtesy creation is an additive atomic access boundary", () => {
  const sql = readFileSync("supabase/migrations/20261017000000_courtesy_reservation_atomic.sql", "utf8");
  assert.match(sql, /create or replace function public\.create_courtesy_reservation_atomic/);
  assert.match(sql, /reservation_type.*Cortesía/);
  assert.match(sql, /prepare_guest_access_atomic/);
  assert.match(sql, /grant execute on function public\.create_courtesy_reservation_atomic\(jsonb,jsonb\) to authenticated/);
  assert.match(sql, /revoke all on function public\.create_courtesy_reservation_atomic\(jsonb,jsonb\) from public,anon,service_role/);
  assert.match(sql, /create or replace function public\.add_courtesy_guest_atomic/);
});

test("courtesy service routes creation and append through atomic boundaries", () => {
  const source = readFileSync("services/workspace-service.tsx", "utf8");
  assert.match(source, /createCourtesyAtomic\(\{ reservation, guests: reservationGuestsWithAccess \}\)/);
  assert.match(source, /addCourtesyGuestAtomic\(\{ reservationId: reservation\.id, guest, accessEvent: timelineEntry \}\)/);
  assert.match(source, /addCourtesyGuestAtomic\(\{ reservationId, guest: nextGuestWithAccess, accessEvent: timelineEntry \}\)/);
});

test("new reservation selector exposes only the three active creatable types", () => {
  const source = readFileSync("features/reservations/components/reservation-wizard-modal.tsx", "utf8");
  assert.match(source, /const creatableReservationTypes: CreatableReservationType\[\] = \["Mesa", "Preventa", "Cortesía"\]/);
  assert.doesNotMatch(source, /creatableReservationTypes[^\n]*Cumpleaños|creatableReservationTypes[^\n]*VIP|creatableReservationTypes[^\n]*Corporativo/);
});

test("courtesy wizard does not expose presale quantity or pending-capacity language", () => {
  const source = readFileSync("features/reservations/components/reservation-wizard-modal.tsx", "utf8");
  assert.match(source, /\) : isPresale \?/);
  assert.match(source, /isCourtesy \? `\$\{registeredGuests\} personas registradas`/);
});
