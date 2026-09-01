import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260831000004_festival_event_days.sql", import.meta.url), "utf8");
const attemptsRoute = readFileSync(new URL("../app/api/accreditation/events/[eventId]/sector-access/attempts/route.ts", import.meta.url), "utf8");
const dayRoute = readFileSync(new URL("../app/api/accreditation/events/[eventId]/days/route.ts", import.meta.url), "utf8");
const evaluationPanel = readFileSync(new URL("../features/accreditation/sector-access/components/accreditation-sector-access-evaluation-panel.tsx", import.meta.url), "utf8");

test("Festival days are one event-scoped model with strict date and window invariants", () => {
  assert.match(migration, /create table if not exists public\.accreditation_event_days/);
  assert.match(migration, /event_date date not null/);
  assert.match(migration, /day_number integer not null/);
  assert.match(migration, /event_days_number_unique/);
  assert.match(migration, /event_days_date_unique/);
  assert.match(migration, /event_days_window_check/);
  assert.match(migration, /references public\.events\(id\)/);
  assert.match(migration, /alter table public\.accreditation_sector_access_attempts/);
  assert.match(migration, /alter table public\.accreditation_sector_movements/);
});

test("Festival day validity narrows existing credentials and entitlements without duplication", () => {
  assert.match(migration, /accreditation_access_grant_days/);
  assert.match(migration, /accreditation_access_entitlement_days/);
  assert.match(migration, /not exists \(select 1 from public\.accreditation_access_grant_days/);
  assert.match(migration, /not exists \(select 1 from public\.accreditation_access_entitlement_days/);
  assert.match(migration, /accreditation_festival_day_access_is_valid/);
  assert.match(migration, /event_day_id uuid references public\.accreditation_event_days/);
  assert.match(attemptsRoute, /eventDayId/);
  assert.match(attemptsRoute, /isGrantValidForDay/);
  assert.match(evaluationPanel, /eventDays/);
  assert.match(evaluationPanel, /eventDayId/);
});

test("Festival configuration and operation preserve RBAC, scope, and existing admission separation", () => {
  assert.match(dayRoute, /event\.edit/);
  assert.match(dayRoute, /settings\.manage/);
  assert.match(dayRoute, /eventType !== "festival"/);
  assert.match(migration, /alter table public\.accreditation_event_days enable row level security/);
  assert.match(migration, /Tenant-scoped accreditation event day access/);
  assert.doesNotMatch(migration, /create table.*(ticket|wristband|capacity)/i);
  assert.doesNotMatch(attemptsRoute, /accreditation_checkins/);
});
