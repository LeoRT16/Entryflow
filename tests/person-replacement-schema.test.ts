import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repository = readFileSync("repositories/supabase-workspace-repositories.ts", "utf8");

const sql = readFileSync("supabase/migrations/20261009000000_phase5d_atomic_guest_replacement.sql", "utf8");
const correctiveSql = readFileSync("supabase/migrations/20261012000000_phase5d_atomic_guest_replacement_pgcrypto_fix.sql", "utf8");

test("replacement corrective migration qualifies pgcrypto without broadening search_path", () => {
  assert.match(correctiveSql, /extensions\.gen_random_bytes\(6\)/);
  assert.match(correctiveSql, /extensions\.gen_random_bytes\(24\)/);
  assert.match(correctiveSql, /search_path=public,pg_temp/);
  assert.doesNotMatch(correctiveSql, /search_path\s*=\s*public\s*,\s*extensions/);
});

test("repository serializes replacement payload to the RPC snake_case contract", () => {
  assert.match(repository, /guest_name:\s*replacement\.guestName/);
  assert.match(repository, /carnet:\s*replacement\.carnet/);
  assert.match(repository, /whatsapp:\s*replacement\.whatsapp/);
  assert.match(repository, /p_replacement:\s*replacementPayload/);
  assert.doesNotMatch(repository, /p_replacement:\s*replacement\s*[,}]/);
  assert.doesNotMatch(repository, /p_replacement:.*access_code|p_replacement:.*qr_token|p_replacement:.*reservation_id/i);
});

test("ordinal corrective migration releases A before inserting B", () => {
  const corrective = readFileSync("supabase/migrations/20261013000000_phase5d_atomic_guest_replacement_ordinal_fix.sql", "utf8");
  assert.match(corrective, /update guests set access_slot_id=s\.id/);
  assert.match(corrective, /update guests set access_ordinal=null,updated_at=now\(\) where id=a\.id;/);
  assert.match(corrective, /b\.access_ordinal:=s\.access_ordinal/);
  assert.ok(corrective.indexOf("access_ordinal=null") < corrective.indexOf("insert into guests select b.*"));
  assert.match(sql, /unique \(reservation_id, access_ordinal\)/);
  assert.match(corrective, /extensions\.gen_random_bytes\(6\)/);
  assert.match(corrective, /extensions\.gen_random_bytes\(24\)/);
  assert.match(corrective, /jsonb_build_object\('actor',actor,'actorRole',role_name,'reason',nullif\(trim\(p_reason\),''\),'slotId',s\.id,'accessOrdinal',s\.access_ordinal,'sourceGuestId',a\.id,'replacementGuestId',b\.id,'sourceAccessGrantId',ag\.id,'replacementAccessGrantId',bg\.id\)/);
  assert.match(corrective, /insert into timeline_events\(id,event_id,timestamp,kind,icon,tone,title,description,reservation_id,reservation_code,reservation_name,guest_id,guest_name,metadata,created_at,updated_at\) values\([\s\S]+?\);/);
});

test("person replacement has a durable slot and one atomic boundary", () => {
  assert.match(sql, /create table if not exists public\.reservation_access_slots/);
  assert.match(sql, /unique \(reservation_id, access_ordinal\)/);
  assert.match(sql, /current_guest_id uuid/);
  assert.match(sql, /create or replace function public\.replace_reservation_guest_atomic/);
  assert.match(sql, /for update/);
  assert.match(sql, /replacement_admitted_guest/);
  assert.match(sql, /accreditation_checkins where access_grant_id=ag\.id/);
  assert.match(sql, /replacement_of_guest_id/);
  assert.match(sql, /replaced_by_guest_id/);
  assert.match(sql, /gen_random_bytes\(6\)/);
  assert.match(sql, /gen_random_bytes\(24\)/);
  assert.match(sql, /sourceAccessGrantId/);
  assert.match(sql, /replacementAccessGrantId/);
  assert.match(sql, /reservation_access_slots set current_guest_id=b\.id/);
  assert.match(sql, /status=\'revoked\'/);
  assert.ok(sql.includes("ro.slug in ('reception','administrator','owner')"));
  assert.match(sql, /replacement_forbidden/);
  assert.match(sql, /r\.guest_ids/);
});

test("replacement does not accept client credentials or commercial quantity", () => {
  assert.doesNotMatch(sql, /p_access_code|p_qr_token|commercial_snapshot\s*=/);
  assert.match(sql, /array_append\(old_guest_ids,b\.id::text\)/);
});

test("replacement rejects cancelled, replaced, authoritative and legacy-consumed sources", () => {
  assert.match(sql, /a\.admission_status in \('Ingresó','Anulada'\)/);
  assert.match(sql, /a\.reservation_status='Cancelled'/);
  assert.match(sql, /a\.replaced_by_guest_id is not null/);
  assert.match(sql, /from checkins c/);
  assert.match(sql, /c\.status in \('Checked In','Checked Out','Completed'\)/);
  assert.match(sql, /from accreditation_checkins where access_grant_id=ag\.id/);
});

test("Door is denied even if legacy reservation permissions are present", () => {
  assert.match(sql, /ro\.slug <> 'door'/);
});

test("identity-transfer migration preserves non-null invitation uniqueness", () => {
  const corrective = readFileSync("supabase/migrations/20261014000000_phase5d_atomic_guest_replacement_identity_transfer_fix.sql", "utf8");
  assert.match(corrective, /invitation_code text not null|invitation_code=format\('%s-HIST-%s'/i);
  assert.match(corrective, /guests_event_invitation_code_unique|invitation_code=format\('%s-HIST-%s'/);
  assert.match(corrective, /access_ordinal=null, invitation_code=format\('%s-HIST-%s'/);
  assert.match(corrective, /b\.invitation_code:=format\('%s-%s',r\.code,lpad\(s\.access_ordinal::text,2,'0'\)\)/);
  assert.match(corrective, /'reason',nullif\(trim\(p_reason\),''\)/);
});
