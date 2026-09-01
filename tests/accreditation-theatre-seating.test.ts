import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260831000003_theatre_assigned_seating.sql", import.meta.url), "utf8");
const repository = readFileSync(new URL("../repositories/supabase-accreditation-theatre-repository.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/accreditation/events/[eventId]/theatre-seat-assignments/route.ts", import.meta.url), "utf8");

test("Theatre seating stores structured event-scoped seats and append-only assignments", () => {
  assert.match(migration, /create table if not exists public\.accreditation_theatre_seats/);
  assert.match(migration, /section text/);
  assert.match(migration, /row_label text/);
  assert.match(migration, /seat_label text/);
  assert.match(migration, /create table if not exists public\.accreditation_theatre_seat_assignments/);
  assert.match(migration, /references public\.accreditation_enrollments/);
  assert.match(migration, /references public\.accreditation_access_grants/);
  assert.match(migration, /released_at timestamptz/);
  assert.match(migration, /active_seat_unique/);
  assert.match(migration, /active_enrollment_unique/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("Theatre assignments fail closed and reuse canonical access identities", () => {
  assert.match(migration, /seat_unavailable/);
  assert.match(migration, /enrollment_inactive/);
  assert.match(migration, /grant_invalid/);
  assert.match(migration, /Theatre seat is outside the assignment scope/);
  assert.match(migration, /Theatre enrollment is outside the assignment scope/);
  assert.match(migration, /update public\.accreditation_theatre_seat_assignments set released_at/);
  assert.match(repository, /accreditation_theatre_assign_seat/);
  assert.match(route, /event\.edit/);
  assert.match(route, /settings\.manage/);
  assert.doesNotMatch(migration, /create table.*(ticket|admission|checkin)/i);
});
