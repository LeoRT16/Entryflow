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

test("courtesy atomic boundary treats WhatsApp as optional while requiring identity", () => {
  const sql = readFileSync("supabase/migrations/20261111000000_commercial_guest_whatsapp_optional_fix.sql", "utf8");
  assert.match(sql, /guest_name.*carnet.*courtesy_guest_incomplete/);
  assert.doesNotMatch(sql, /guest_name.*carnet.*whatsapp.*courtesy_guest_incomplete/);
  assert.match(sql, /coalesce\(g->>'whatsapp',''\)/);
});

test("courtesy service routes creation and append through atomic boundaries", () => {
  const source = readFileSync("services/workspace-service.tsx", "utf8");
  assert.match(source, /createCourtesyAtomic\(\{ reservation, guests: reservationGuestsWithAccess \}\)/);
  assert.match(source, /addCourtesyGuestAtomic\(\{ reservationId: reservation\.id, guest, accessEvent: timelineEntry \}\)/);
  assert.match(source, /addCourtesyGuestAtomic\(\{ reservationId, guest: nextGuestWithAccess, accessEvent: timelineEntry \}\)/);
  assert.doesNotMatch(source, /Cada cortesía requiere nombre, carnet y WhatsApp/);
});

test("new reservation selector exposes only the three active creatable types", () => {
  const source = readFileSync("features/reservations/components/reservation-wizard-modal.tsx", "utf8");
  assert.match(source, /const creatableReservationTypes: CreatableReservationType\[\] = \["Mesa", "Preventa", "Cortesía"\]/);
  assert.doesNotMatch(source, /creatableReservationTypes[^\n]*Cumpleaños|creatableReservationTypes[^\n]*VIP|creatableReservationTypes[^\n]*Corporativo/);
});

test("courtesy atomic fix keeps reservation insert expressions aligned with its target columns", () => {
  const sql = readFileSync("supabase/migrations/20261018000000_courtesy_reservation_atomic_fix.sql", "utf8");
  assert.match(sql, /insert into reservations\(id,code,name,event_id,event_name,date,time,table_name,table_id,table_capacity,holder_name,holder_document,holder_whatsapp,holder_email,reservation_type/);
  assert.match(sql, /0,'','','','', 'Cortesía','Pendiente','0','0'/);
  assert.doesNotMatch(sql, /time,'',null,0,'','','','Cortesía','Pendiente','0','0'/);
  assert.match(sql, /insert into guests\(id,event_id,guest_name,reservation_name,reservation_code,reservation_id,event_name/);
  assert.match(sql, /prepare_guest_access_atomic\(gid,access_code,qr_token\)/);
});

test("deployed courtesy corrective migration preserves atomic multi-guest creation", () => {
  const sql = readFileSync("supabase/migrations/20261105000000_courtesy_reservation_atomic_fix.sql", "utf8");
  assert.match(sql, /create or replace function public\.create_courtesy_reservation_atomic\(p_reservation jsonb, p_guests jsonb\)/);
  assert.match(sql, /holder_name,holder_document,holder_whatsapp,holder_email,reservation_type/);
  assert.match(sql, /0,'','','','', 'Cortesía','Pendiente','0','0'/);
  assert.match(sql, /for g in select \* from jsonb_array_elements\(coalesce\(p_guests,'\[\]'::jsonb\)\)/);
  assert.match(sql, /prepare_guest_access_atomic\(gid,access_code,qr_token\)/);
  assert.match(sql, /update reservations set guest_ids=array\(select x->>'id'/);
  assert.match(sql, /jsonb_agg\(to_jsonb\(x\)\|\|jsonb_build_object\('access_grant_id'/);
  assert.doesNotMatch(sql, /commit;|rollback;/i);
});

test("courtesy append timeline metadata is sourced from the persisted grant", () => {
  const sql = readFileSync("supabase/migrations/20261019000000_courtesy_append_timeline_metadata_fix.sql", "utf8");
  assert.match(sql, /select ag\.id,ag\.access_code,ag\.qr_token,guest_row\.invitation_code into grant_id,access_code,canonical_qr,canonical_code/);
  assert.match(sql, /'accessGrantId',grant_id/);
  assert.match(sql, /'code',canonical_code/);
  assert.match(sql, /'qrToken',canonical_qr/);
  assert.doesNotMatch(sql, /'accessGrantId',g\.id/);
});

test("courtesy wizard does not expose presale quantity or pending-capacity language", () => {
  const source = readFileSync("features/reservations/components/reservation-wizard-modal.tsx", "utf8");
  assert.match(source, /\) : isPresale \?/);
  assert.match(source, /isCourtesy \? `\$\{registeredGuests\} personas registradas`/);
});

test("courtesy wizard summary uses registered guests as its quantity", () => {
  const source = readFileSync("features/reservations/components/reservation-wizard-modal.tsx", "utf8");
  assert.match(source, /isCourtesy \? registeredGuests : guestCount/);
  assert.match(source, /isCourtesy \? `\$\{registeredGuests\}` : `\$\{registeredGuests\} \/ \$\{isPresale \? accessQuantity : guestCount\}`/);
  assert.match(source, /isCourtesy \? guests\.filter\(\(guest\) => guest\.name\.trim\(\)\)\.length : guestCount/);
});
