import assert from "node:assert/strict";
import test from "node:test";

import { ACCOUNT_ROLE_PRESETS } from "../features/accounts/domain/accounts-domain";
import { buildEventSwitcherSections, canSwitchEventContext } from "../components/event-switcher";
import {
  resolveInitialCurrentEventId,
  resolveInitialCurrentOrganizationId,
  resolveInitialCurrentProfileId,
} from "../services/workspace-service";
import type { WorkspaceBootstrap } from "../services/workspace-loader";

function buildWorkspace(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  return {
    authState: overrides.authState ?? { status: "ready", authUserId: "auth-1", authUserEmail: "owner@example.com", publicUserId: "user-1", organizationIds: ["org-1"] },
    currentUserId: overrides.currentUserId ?? "user-1",
    users: overrides.users ?? [],
    profiles: overrides.profiles ?? [],
    roles: overrides.roles ?? [],
    organizations: overrides.organizations ?? [],
    venues: overrides.venues ?? [],
    sectors: overrides.sectors ?? [],
    resources: overrides.resources ?? [],
    venueLayouts: overrides.venueLayouts ?? [],
    venueLayoutSectors: overrides.venueLayoutSectors ?? [],
    venueLayoutResources: overrides.venueLayoutResources ?? [],
    eventLayouts: overrides.eventLayouts ?? [],
    eventLayoutSectors: overrides.eventLayoutSectors ?? [],
    eventLayoutResources: overrides.eventLayoutResources ?? [],
    events: overrides.events ?? [],
    guests: overrides.guests ?? [],
    reservations: overrides.reservations ?? [],
    tables: overrides.tables ?? [],
    checkIns: overrides.checkIns ?? [],
    attempts: overrides.attempts ?? [],
    timelineEvents: overrides.timelineEvents ?? [],
    currentOrganizationId: overrides.currentOrganizationId ?? "org-1",
    currentEventId: overrides.currentEventId ?? "event-live",
    currentProfileId: overrides.currentProfileId ?? "profile-1",
  };
}

function withLocalStorage(entries: Record<string, string | undefined>, run: () => void) {
  type WindowStub = {
    localStorage: {
      getItem(key: string): string | null;
    };
  };

  const globalWithWindow = globalThis as unknown as { window?: WindowStub };
  const previousWindow = globalWithWindow.window;
  const storage = new Map(Object.entries(entries).filter(([, value]) => typeof value === "string")) as Map<string, string>;

  globalWithWindow.window = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
    },
  } as never;

  try {
    run();
  } finally {
    if (previousWindow === undefined) {
      globalWithWindow.window = undefined;
    } else {
      globalWithWindow.window = previousWindow;
    }
  }
}

test("owner and administrator can switch event context", () => {
  const owner = {
    permissions: ACCOUNT_ROLE_PRESETS[0].permissions,
    rolePermissions: ACCOUNT_ROLE_PRESETS[0].permissions,
  };
  const administrator = {
    permissions: ACCOUNT_ROLE_PRESETS[1].permissions,
    rolePermissions: ACCOUNT_ROLE_PRESETS[1].permissions,
  };

  assert.equal(canSwitchEventContext(owner), true);
  assert.equal(canSwitchEventContext(administrator), true);
});

test("reception and door do not see the event switcher", () => {
  const reception = {
    permissions: ACCOUNT_ROLE_PRESETS[2].permissions,
    rolePermissions: ACCOUNT_ROLE_PRESETS[2].permissions,
  };
  const door = {
    permissions: ACCOUNT_ROLE_PRESETS[3].permissions,
    rolePermissions: ACCOUNT_ROLE_PRESETS[3].permissions,
  };

  assert.equal(canSwitchEventContext(reception), false);
  assert.equal(canSwitchEventContext(door), false);
});

test("sidebar selector groups current organization events including historical events", () => {
  const sections = buildEventSwitcherSections(
    [
      { id: "live-1", organizationId: "org-1", name: "Evento live", eventType: "custom", status: "live", venue: "Venue", startAt: "2026-08-14 20:00" },
      { id: "draft-1", organizationId: "org-1", name: "Evento draft", eventType: "custom", status: "draft", venue: "Venue", startAt: "2026-08-15 20:00" },
      { id: "finished-1", organizationId: "org-1", name: "Evento cerrado", eventType: "custom", status: "finished", venue: "Venue", startAt: "2026-08-13 20:00" },
      { id: "other-org", organizationId: "org-2", name: "Otro org", eventType: "custom", status: "live", venue: "Venue", startAt: "2026-08-14 21:00" },
    ],
    "org-1",
  );

  assert.equal(sections.some((section) => section.title === "Historial" && section.events.some((event) => event.id === "finished-1")), true);
  assert.equal(sections.some((section) => section.events.some((event) => event.id === "other-org")), false);
});

test("explicitly selected current event survives refresh preference resolution when valid", () => {
  const workspace = buildWorkspace({
    organizations: [{ id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} }],
    profiles: [{ id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" }],
    events: [
      { id: "event-live", organizationId: "org-1", name: "Live", eventType: "custom", status: "live", startAt: "2026-08-14 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
      { id: "event-history", organizationId: "org-1", name: "History", eventType: "custom", status: "finished", startAt: "2026-08-13 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
    ],
    currentOrganizationId: "org-1",
    currentEventId: "event-live",
    currentProfileId: "profile-1",
  });

  withLocalStorage(
    {
      "entryflow.currentOrganizationId": "org-1",
      "entryflow.currentEventId": "event-history",
      "entryflow.currentProfileId": "profile-1",
    },
    () => {
      assert.equal(resolveInitialCurrentOrganizationId(workspace), "org-1");
      assert.equal(resolveInitialCurrentEventId(workspace, "org-1"), "event-history");
      assert.equal(resolveInitialCurrentProfileId(workspace, "org-1", "user-1"), "profile-1");
    },
  );
});

test("stale or wrong-organization local selections are ignored", () => {
  const workspace = buildWorkspace({
    organizations: [
      { id: "org-1", name: "Org 1", slug: "org-1", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} },
      { id: "org-2", name: "Org 2", slug: "org-2", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} },
    ],
    profiles: [
      { id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" },
    ],
    events: [
      { id: "event-live", organizationId: "org-1", name: "Live", eventType: "custom", status: "live", startAt: "2026-08-14 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
    ],
    currentOrganizationId: "org-1",
    currentEventId: "event-live",
    currentProfileId: "profile-1",
  });

  withLocalStorage(
    {
      "entryflow.currentOrganizationId": "org-2",
      "entryflow.currentEventId": "missing-event",
      "entryflow.currentProfileId": "missing-profile",
    },
    () => {
      assert.equal(resolveInitialCurrentOrganizationId(workspace), "org-1");
      assert.equal(resolveInitialCurrentEventId(workspace, "org-1"), "event-live");
      assert.equal(resolveInitialCurrentProfileId(workspace, "org-1", "user-1"), "profile-1");
    },
  );
});
