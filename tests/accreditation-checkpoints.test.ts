import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260831000002_accreditation_phase_3d.sql", import.meta.url), "utf8");
const attemptsRoute = readFileSync(new URL("../app/api/accreditation/events/[eventId]/sector-access/attempts/route.ts", import.meta.url), "utf8");
const movementsRoute = readFileSync(new URL("../app/api/accreditation/events/[eventId]/sector-access/movements/route.ts", import.meta.url), "utf8");
const checkpointsRoute = readFileSync(new URL("../app/api/accreditation/events/[eventId]/checkpoints/route.ts", import.meta.url), "utf8");

test("Phase 3D adds scoped checkpoints and nullable historical attribution", () => {
  assert.match(migration, /create table if not exists public\.accreditation_access_checkpoints/);
  assert.match(migration, /sector_id uuid not null references public\.accreditation_access_sectors/);
  assert.match(migration, /status text not null default 'active' check \(status in \('active', 'inactive'\)\)/);
  assert.match(migration, /add column if not exists checkpoint_id uuid/);
  assert.match(migration, /checkpoint_inactive/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /event\.edit[\s\S]*settings\.manage/);
  assert.doesNotMatch(migration, /accreditation_checkins/);
  assert.doesNotMatch(migration, /capacity.*enforce/i);
});

test("operational routes resolve checkpoint targets server-side", () => {
  assert.match(attemptsRoute, /checkpointId/);
  assert.match(attemptsRoute, /checkpoint\.sectorId/);
  assert.match(attemptsRoute, /checkpoint_inactive/);
  assert.match(movementsRoute, /checkpointId/);
  assert.match(movementsRoute, /movements\.record/);
  assert.match(checkpointsRoute, /event\.edit/);
  assert.match(checkpointsRoute, /settings\.manage/);
  assert.doesNotMatch(attemptsRoute, /accreditation_checkins/);
  assert.doesNotMatch(movementsRoute, /accreditation_checkins/);
});
