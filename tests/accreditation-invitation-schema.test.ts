import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("accreditation invitation migration adds a standalone delivery ledger with access.issue authorization and DB status guards", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826000003_accreditation_phase_1d.sql", import.meta.url), "utf8");

  assert.match(sql, /create or replace function public\.accreditation_whatsapp_delivery_attempt_operator_is_authorized\(/);
  assert.match(sql, /'access\.issue' = any\(r\.permissions\)/);
  assert.match(sql, /create or replace function public\.accreditation_whatsapp_delivery_attempt_belongs_to_scope\(/);
  assert.match(sql, /create or replace function public\.accreditation_whatsapp_delivery_attempt_belongs_to_history_scope\(/);
  assert.match(sql, /create or replace function public\.accreditation_whatsapp_delivery_attempt_can_be_recorded\(/);
  assert.match(sql, /create or replace function public\.accreditation_whatsapp_delivery_attempt_assign_attempt_number\(\)/);
  assert.match(sql, /create table if not exists public\.accreditation_whatsapp_delivery_attempts/);
  assert.match(sql, /recipient text not null/);
  assert.match(sql, /access_code text not null/);
  assert.match(sql, /qr_token text not null/);
  assert.match(sql, /message_id text not null unique/);
  assert.match(sql, /attempt_number integer not null default 1/);
  assert.match(sql, /constraint accreditation_whatsapp_delivery_attempts_enrollment_attempt_number_unique unique \(enrollment_id, attempt_number\)/i);
  assert.match(sql, /constraint accreditation_whatsapp_delivery_attempts_delivery_status_check check \(delivery_status in \('accepted', 'sent', 'delivered', 'read', 'failed'\)\)/i);
  assert.match(sql, /create index if not exists accreditation_whatsapp_delivery_attempts_organization_event_idx/);
  assert.match(sql, /create index if not exists accreditation_whatsapp_delivery_attempts_enrollment_idx/);
  assert.match(sql, /create index if not exists accreditation_whatsapp_delivery_attempts_access_grant_idx/);
  assert.match(sql, /create index if not exists accreditation_whatsapp_delivery_attempts_message_id_idx/);
  assert.match(sql, /alter table public\.accreditation_whatsapp_delivery_attempts enable row level security;/);
  assert.match(sql, /create policy "Tenant-scoped accreditation whatsapp delivery attempt select"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation whatsapp delivery attempt insert"/);
  assert.match(sql, /create policy "Tenant-scoped accreditation whatsapp delivery attempt update"/);
  assert.match(
    sql,
    /create policy "Tenant-scoped accreditation whatsapp delivery attempt select"[\s\S]+accreditation_whatsapp_delivery_attempt_belongs_to_history_scope/gi,
  );
  assert.match(
    sql,
    /create policy "Tenant-scoped accreditation whatsapp delivery attempt update"[\s\S]+accreditation_whatsapp_delivery_attempt_belongs_to_history_scope/gi,
  );
  assert.match(
    sql,
    /create policy "Tenant-scoped accreditation whatsapp delivery attempt update"[\s\S]+accreditation_whatsapp_delivery_attempt_operator_is_authorized/gi,
  );
  assert.match(
    sql,
    /create policy "Tenant-scoped accreditation whatsapp delivery attempt insert"[\s\S]+accreditation_whatsapp_delivery_attempt_can_be_recorded/gi,
  );
  assert.doesNotMatch(sql, /create policy "Tenant-scoped accreditation whatsapp delivery attempt delete"/);
  assert.match(sql, /create trigger enforce_accreditation_whatsapp_delivery_attempt_identity_immutable/);
  assert.match(sql, /create trigger set_updated_at_accreditation_whatsapp_delivery_attempts/);
  assert.match(sql, /create trigger set_attempt_number_accreditation_whatsapp_delivery_attempts/);
  assert.match(sql, /comment on function public\.accreditation_whatsapp_delivery_attempt_identity_immutable\(\)/);
});
