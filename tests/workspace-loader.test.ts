import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEventInWorkspace,
  assertOrganizationInWorkspace,
  buildActiveCheckIns,
  resolveWorkspaceAccessScope,
} from "../services/workspace-loader";
import { isAccessGrantAlreadyConsumed } from "../features/check-in/domain/check-in-persistence";
import type { CheckInRow } from "../lib/supabase/types";
import { mapTimelineRowToDomain, mapTimelineToRow } from "../lib/supabase/mappers";
import type { TimelineRow } from "../lib/supabase/types";
import type { TimelineEvent } from "../features/timeline/types";
import type { WorkspaceBootstrap } from "../services/workspace-loader";

function buildCheckInRow(overrides: Partial<CheckInRow> = {}): CheckInRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    guest_id: "guest-1",
    reservation_id: "reservation-1",
    event_id: "event-1",
    access_grant_id: "grant-1",
    access_type: "qr",
    method: "QR",
    checked_in_at: "17:25",
    checked_out_at: null,
    operator: "Escáner",
    gate: "Principal",
    notes: null,
    audit_trail: [],
    reentry_allowed: true,
    max_entries: 1,
    reentry_window_minutes: null,
    attempt_count: 1,
    last_attempt_at: "17:25",
    status: "Checked In",
    source: "qr",
    created_at: "2026-08-12T17:25:36.575+00:00",
    updated_at: "2026-08-12T17:25:37.424722+00:00",
    deleted_at: null,
    ...overrides,
  };
}

function buildWorkspaceScopeFixture(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  return {
    authState: {
      status: "ready",
      authUserId: "auth-owner",
      authUserEmail: "owner@example.com",
      publicUserId: "user-owner",
      organizationIds: ["org-a", "org-b"],
    },
    currentUserId: "user-owner",
    users: [],
    profiles: [],
    roles: [],
    organizations: [
      {
        id: "org-a",
        name: "Org A",
        slug: "org-a",
        status: "active",
        timezone: "America/La_Paz",
        branding: {},
        settings: {},
        metadata: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "org-b",
        name: "Org B",
        slug: "org-b",
        status: "active",
        timezone: "America/La_Paz",
        branding: {},
        settings: {},
        metadata: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "org-inactive",
        name: "Org Inactive",
        slug: "org-inactive",
        status: "inactive",
        timezone: "America/La_Paz",
        branding: {},
        settings: {},
        metadata: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
    ] as never,
    venues: [],
    sectors: [],
    resources: [],
    venueLayouts: [],
    venueLayoutSectors: [],
    venueLayoutResources: [],
    eventLayouts: [],
    eventLayoutSectors: [],
    eventLayoutResources: [],
    events: [
      {
        id: "event-a",
        organizationId: "org-a",
        venueId: "venue-a",
        name: "Evento A",
        slug: "evento-a",
        status: "active",
        startAt: "2026-08-13T00:00:00.000Z",
        endAt: null,
        timezone: "America/La_Paz",
        metadata: {},
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "event-b",
        organizationId: "org-b",
        venueId: "venue-b",
        name: "Evento B",
        slug: "evento-b",
        status: "active",
        startAt: "2026-08-13T00:00:00.000Z",
        endAt: null,
        timezone: "America/La_Paz",
        metadata: {},
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "event-deleted",
        organizationId: "org-a",
        venueId: "venue-a",
        name: "Evento Deleted",
        slug: "evento-deleted",
        status: "active",
        startAt: "2026-08-13T00:00:00.000Z",
        endAt: null,
        timezone: "America/La_Paz",
        metadata: {},
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        deletedAt: "2026-08-13T00:00:00.000Z",
      },
    ] as never,
    guests: [],
    reservations: [],
    tables: [],
    checkIns: [],
    attempts: [],
    timelineEvents: [],
    whatsappDeliveryAttempts: [],
    currentOrganizationId: "org-a",
    currentEventId: "event-a",
    currentProfileId: "profile-owner",
    ...overrides,
  } as WorkspaceBootstrap;
}

test("workspace scope resolves and fails closed on inactive or missing current organization", () => {
  const scope = resolveWorkspaceAccessScope(buildWorkspaceScopeFixture());

  assert.ok(scope);
  assert.equal(scope?.authUserId, "auth-owner");
  assert.equal(assertOrganizationInWorkspace(scope, "org-a"), "org-a");
  assert.equal(assertOrganizationInWorkspace(scope, "org-b"), null);
  assert.equal(assertOrganizationInWorkspace(scope, "org-inactive"), null);
  assert.equal(assertOrganizationInWorkspace(scope, ""), null);
});

test("workspace scope rejects events from another organization and deleted events", () => {
  const scope = resolveWorkspaceAccessScope(buildWorkspaceScopeFixture());

  assert.ok(scope);
  assert.deepEqual(assertEventInWorkspace(scope, { id: "event-a", organizationId: "org-a" }), { id: "event-a", organizationId: "org-a" });
  assert.equal(assertEventInWorkspace(scope, { id: "event-b", organizationId: "org-b" }), null);
  assert.equal(assertEventInWorkspace(scope, { id: "event-deleted", organizationId: "org-a" }), null);
  assert.equal(assertEventInWorkspace(scope, null), null);
});

test("workspace scope fails closed when current organization is missing", () => {
  const scope = resolveWorkspaceAccessScope(buildWorkspaceScopeFixture({ currentOrganizationId: "" }));

  assert.equal(scope, null);
  assert.equal(assertOrganizationInWorkspace(scope, "org-a"), null);
  assert.equal(assertEventInWorkspace(scope, { id: "event-a", organizationId: "org-a" }), null);
});

test("soft-deleted check-ins are excluded from the bootstrap state", () => {
  const activeCheckIn = buildCheckInRow({
    id: "00000000-0000-4000-8000-000000000001",
    access_grant_id: "grant-active",
    deleted_at: null,
  });
  const softDeletedCheckIn = buildCheckInRow({
    id: "00000000-0000-4000-8000-000000000002",
    access_grant_id: "grant-deleted",
    deleted_at: "2026-08-12T17:25:37.244+00:00",
  });

  const activeOnly = buildActiveCheckIns([activeCheckIn, softDeletedCheckIn]);

  assert.deepEqual(activeOnly.map((row) => row.accessGrantId), ["grant-active"]);
});

test("soft-deleted check-ins do not mark a QR as consumed", () => {
  const activeCheckIn = buildCheckInRow({
    access_grant_id: "grant-active",
    deleted_at: null,
  });
  const softDeletedCheckIn = buildCheckInRow({
    access_grant_id: "grant-soft-deleted",
    deleted_at: "2026-08-12T17:25:37.244+00:00",
  });

  const consumed = new Set(buildActiveCheckIns([activeCheckIn, softDeletedCheckIn]).map((row) => row.accessGrantId ?? row.id));

  assert.equal(isAccessGrantAlreadyConsumed("grant-soft-deleted", consumed), false);
  assert.equal(isAccessGrantAlreadyConsumed("grant-active", consumed), true);
});

test("active check-ins still block a second use", () => {
  const activeCheckIn = buildCheckInRow({
    access_grant_id: "grant-active",
    deleted_at: null,
  });

  const consumed = new Set(buildActiveCheckIns([activeCheckIn]).map((row) => row.accessGrantId ?? row.id));

  assert.equal(isAccessGrantAlreadyConsumed("grant-active", consumed), true);
  assert.equal(isAccessGrantAlreadyConsumed("grant-new", consumed), false);
});

test("timeline rows restore canonical actor, context, target and guest references", () => {
  const row: TimelineRow = {
    id: "timeline-1",
    event_id: "event-1",
    timestamp: "19:04",
    kind: "checkin.success",
    icon: "checkin",
    tone: "success",
    title: "Check-in exitoso",
    description: "QR validado correctamente.",
    reservation_id: "reservation-1",
    reservation_code: "RES-001",
    reservation_name: "Mesa 5",
    guest_id: "guest-1",
    guest_name: "PPrueba 2",
    table_id: "table-1",
    table_name: "Mesa 5",
    metadata: {
      actor: "Test Door",
      actorRole: "Puerta",
      context: "Entrada principal",
      target: "PPrueba 2",
      guestCarnet: "8191256",
      method: "QR",
    },
    created_at: "2026-08-16T19:04:00.000Z",
    updated_at: "2026-08-16T19:04:00.000Z",
    deleted_at: null,
  };

  const event = mapTimelineRowToDomain(row);

  assert.equal(event.guestName, "PPrueba 2");
  assert.equal(event.reservationCode, "RES-001");
  assert.equal(event.reservationName, "Mesa 5");
  assert.equal(event.actor, "Test Door");
  assert.equal(event.actorRole, "Puerta");
  assert.equal(event.context, "Entrada principal");
  assert.equal(event.target, "PPrueba 2");
  assert.equal(event.metadata?.guestCarnet, "8191256");
  assert.equal(event.metadata?.method, "QR");

  const roundTrip = mapTimelineToRow(event as TimelineEvent, "event-1");
  const restored = mapTimelineRowToDomain({
    ...row,
    ...roundTrip,
    metadata: roundTrip.metadata,
  } as TimelineRow);

  assert.equal(restored.actor, "Test Door");
  assert.equal(restored.actorRole, "Puerta");
  assert.equal(restored.context, "Entrada principal");
  assert.equal(restored.target, "PPrueba 2");
  assert.notEqual(restored.target, restored.reservationName);
});
