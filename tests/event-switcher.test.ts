import assert from "node:assert/strict";
import test from "node:test";

import { ACCOUNT_ROLE_PRESETS } from "../features/accounts/domain/accounts-domain";
import {
  buildEventSwitcherButtonModel,
  buildEventSwitcherSections,
  canSwitchEventContext,
  getEventSwitcherEmptyPanelMessage,
  getEventSwitcherSectionEmptyMessage,
  getEventSwitcherStatusTone,
} from "../components/event-switcher";
import {
  getEventSelection,
  resolveInitialCurrentEventId,
  resolveInitialCurrentOrganizationId,
  resolveInitialCurrentProfileId,
  resolveReloadCurrentEventId,
  resolveWorkspacePreferenceSelection,
  resolveWorkspaceBootstrapSelection,
  canRestoreWorkspacePreference,
  shouldPersistWorkspaceSelection,
  shouldReconcileBootstrapRuntimeEvent,
} from "../services/workspace-service";
import type { WorkspaceBootstrap } from "../services/workspace-loader";
import type { Event } from "../features/domain/types";

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
    whatsappDeliveryAttempts: overrides.whatsappDeliveryAttempts ?? [],
    currentOrganizationId: overrides.currentOrganizationId ?? "org-1",
    currentEventId: overrides.currentEventId ?? "event-live",
    currentProfileId: overrides.currentProfileId ?? "profile-1",
  };
}

function withLocalStorage(entries: Record<string, string | undefined>, run: (storage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}) => void) {
  const globalWithWindow = globalThis as unknown as { window?: unknown };
  const previousWindow = globalWithWindow.window;
  const storage = new Map(Object.entries(entries).filter(([, value]) => typeof value === "string")) as Map<string, string>;
  const storageApi = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
  };

  globalWithWindow.window = { localStorage: storageApi };

  try {
    run(storageApi);
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

test("event switcher trigger keeps organization and event context visible in compact mode", () => {
  const trigger = buildEventSwitcherButtonModel({
    currentOrganizationName: "La Rota Carlota",
    currentEvent: {
      name: "Sabado 22 de Agosto",
      eventType: "nightlife",
      status: "live",
      venue: "Rotita",
    },
    compact: true,
  });

  assert.equal(trigger.eyebrow, "La Rota Carlota");
  assert.equal(trigger.title, "Sabado 22 de Agosto");
  assert.equal(trigger.description, "Boliche");
  assert.equal(trigger.statusLabel, "En curso");
  assert.equal(trigger.statusTone, "success");
});

test("event switcher empty states are concise and scope-aware", () => {
  assert.equal(getEventSwitcherEmptyPanelMessage(""), "No hay eventos en esta organización.");
  assert.equal(getEventSwitcherEmptyPanelMessage("rotita"), "No encontramos eventos para “rotita”.");
  assert.equal(getEventSwitcherSectionEmptyMessage("Historial", ""), "No hay eventos históricos.");
  assert.equal(getEventSwitcherSectionEmptyMessage("Historial", "sabado"), "No encontramos eventos para “sabado”.");
});

test("terminal event status remains visually distinct from draft and live states", () => {
  assert.equal(getEventSwitcherStatusTone("live"), "success");
  assert.equal(getEventSwitcherStatusTone("published"), "info");
  assert.equal(getEventSwitcherStatusTone("draft"), "warning");
  assert.equal(getEventSwitcherStatusTone("finished"), "danger");
  assert.equal(getEventSwitcherStatusTone("cancelled"), "danger");
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

test("workspace preference restore resolves organization first and rejects foreign event and profile ids", () => {
  const workspace = buildWorkspace({
    organizations: [
      { id: "org-1", name: "Org 1", slug: "org-1", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} },
      { id: "org-2", name: "Org 2", slug: "org-2", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} },
    ],
    profiles: [
      { id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner A", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" },
      { id: "profile-2", organizationId: "org-2", userId: "user-1", roleId: "role-1", displayName: "Owner B", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" },
    ],
    events: [
      { id: "event-a", organizationId: "org-1", name: "Live A", eventType: "custom", status: "live", startAt: "2026-08-14 20:00", timezone: "America/La_Paz", venue: "Venue A", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
      { id: "event-b", organizationId: "org-2", name: "Live B", eventType: "custom", status: "live", startAt: "2026-08-14 21:00", timezone: "America/La_Paz", venue: "Venue B", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
    ],
    currentOrganizationId: "org-2",
    currentEventId: "event-b",
    currentProfileId: "profile-2",
  });

  withLocalStorage(
    {
      "entryflow.currentOrganizationId": "org-1",
      "entryflow.currentEventId": "event-b",
      "entryflow.currentProfileId": "profile-2",
    },
    () => {
      const selection = resolveWorkspacePreferenceSelection(workspace, "user-1");

      assert.equal(selection.currentOrganizationId, "org-1");
      assert.equal(selection.currentEventId, "event-a");
      assert.equal(selection.currentProfileId, "profile-1");
    },
  );
});

test("workspace preference restore keeps organization when event is foreign and the target organization has no events", () => {
  const workspace = buildWorkspace({
    organizations: [
      { id: "org-1", name: "Org 1", slug: "org-1", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} },
    ],
    profiles: [
      { id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner A", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" },
    ],
    events: [],
    currentOrganizationId: "org-1",
    currentEventId: "",
    currentProfileId: "profile-1",
  });

  withLocalStorage(
    {
      "entryflow.currentOrganizationId": "org-1",
      "entryflow.currentEventId": "event-b",
      "entryflow.currentProfileId": "profile-1",
    },
    () => {
      const selection = resolveWorkspacePreferenceSelection(workspace, "user-1");

      assert.equal(selection.currentOrganizationId, "org-1");
      assert.equal(selection.currentEventId, "");
      assert.equal(selection.currentProfileId, "profile-1");
    },
  );
});

test("bootstrap selection stays deterministic while persisted selection can be restored later", () => {
  const workspace = buildWorkspace({
    organizations: [
      { id: "org-1", name: "Org 1", slug: "org-1", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} },
      { id: "org-2", name: "Org 2", slug: "org-2", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} },
    ],
    profiles: [
      { id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" },
      { id: "profile-2", organizationId: "org-2", userId: "user-1", roleId: "role-1", displayName: "Owner", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" },
    ],
    events: [
      { id: "event-1", organizationId: "org-1", name: "Org 1 live", eventType: "custom", status: "live", startAt: "2026-08-14 20:00", timezone: "America/La_Paz", venue: "Venue 1", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
      { id: "event-2", organizationId: "org-2", name: "Org 2 live", eventType: "custom", status: "live", startAt: "2026-08-14 21:00", timezone: "America/La_Paz", venue: "Venue 2", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
    ],
    currentOrganizationId: "org-1",
    currentEventId: "event-1",
    currentProfileId: "profile-1",
  });

  withLocalStorage(
    {
      "entryflow.currentOrganizationId": "org-2",
      "entryflow.currentEventId": "event-2",
      "entryflow.currentProfileId": "profile-2",
    },
    () => {
      const bootstrapSelection = resolveWorkspaceBootstrapSelection(workspace, "user-1");

      assert.equal(bootstrapSelection.currentOrganizationId, "org-2");
      assert.equal(bootstrapSelection.currentEventId, "event-2");
      assert.equal(bootstrapSelection.currentProfileId, "profile-2");
      assert.equal(resolveInitialCurrentOrganizationId(workspace), "org-2");
      assert.equal(resolveInitialCurrentEventId(workspace, "org-2"), "event-2");
      assert.equal(resolveInitialCurrentProfileId(workspace, "org-2", "user-1"), "profile-2");
    },
  );
});

test("reload preserves explicit event across reconstructed collections and transient empty snapshots", () => {
  const events = [
    { id: "event-a", organizationId: "org-1", name: "A", eventType: "custom", status: "live", startAt: "2026-08-14 20:00" },
    { id: "event-b", organizationId: "org-1", name: "B", eventType: "custom", status: "published", startAt: "2026-08-15 20:00" },
    { id: "event-c", organizationId: "org-1", name: "C", eventType: "custom", status: "draft", startAt: "2026-08-16 20:00" },
  ] as Event[];

  assert.equal(resolveReloadCurrentEventId([...events].reverse(), "org-1", "event-b", "event-a"), "event-b");
  assert.equal(resolveReloadCurrentEventId([], "org-1", "event-b", "event-a", events), "event-b");
  assert.equal(resolveReloadCurrentEventId(events.filter((event) => event.id !== "event-b"), "org-1", "event-b", "event-a"), "event-a");
  assert.equal(resolveReloadCurrentEventId(events, "org-1", "event-c", "event-a"), "event-c");
});

test("preference restoration keeps an empty event collection from overwriting storage while loading", () => {
  const workspace = buildWorkspace({
    organizations: [{ id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} }],
    profiles: [{ id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" }],
    events: [],
    currentOrganizationId: "org-1",
    currentEventId: "",
    currentProfileId: "profile-1",
  });

  withLocalStorage({
    "entryflow.currentOrganizationId": "org-1",
    "entryflow.currentEventId": "event-b",
    "entryflow.currentProfileId": "profile-1",
  }, () => {
    assert.equal(canRestoreWorkspacePreference({ browserAuthReady: true, status: "ready", organizationCount: 1, eventCount: 0, persistedEventId: "event-b" }), false);
    assert.equal(canRestoreWorkspacePreference({ browserAuthReady: true, status: "ready", organizationCount: 1, eventCount: 3, persistedEventId: "event-b" }), true);
    const selection = resolveWorkspacePreferenceSelection(workspace, "user-1");
    assert.equal(selection.currentEventId, "");
  });
});

test("hydration does not let an empty runtime event overwrite persisted B", () => {
  assert.equal(shouldPersistWorkspaceSelection({ preferenceHydrated: true, currentEventId: "", persistedEventId: "event-b" }), false);
  assert.equal(shouldPersistWorkspaceSelection({ preferenceHydrated: true, currentEventId: "event-b", persistedEventId: "event-b" }), true);
  assert.equal(shouldPersistWorkspaceSelection({ preferenceHydrated: true, currentEventId: "", persistedEventId: "" }), true);
  assert.equal(shouldPersistWorkspaceSelection({ preferenceHydrated: false, currentEventId: "event-b", persistedEventId: "event-b" }), false);
});

test("bootstrap reconciliation hydrates B once and preserves an explicit C", () => {
  const reconcile = (state: { reconciled: boolean; currentEventId: string }, authoritative: boolean, initialSelectionEventId: string) => {
    if (shouldReconcileBootstrapRuntimeEvent({ ...state, authoritative, initialSelectionEventId })) {
      return { reconciled: true, currentEventId: initialSelectionEventId };
    }
    return { ...state, reconciled: state.reconciled || authoritative };
  };

  let state = reconcile({ reconciled: false, currentEventId: "" }, true, "event-b");
  assert.equal(state.currentEventId, "event-b");
  state = { ...state, currentEventId: "event-c" };
  state = reconcile(state, true, "event-b");
  assert.equal(state.currentEventId, "event-c");
});

test("cold bootstrap prefers persisted B over loader live default A", () => {
  const workspace = buildWorkspace({
    organizations: [{ id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} }],
    profiles: [{ id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" }],
    events: [
      { id: "event-a", organizationId: "org-1", name: "A", eventType: "custom", status: "live", startAt: "2026-08-14 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
      { id: "event-b", organizationId: "org-1", name: "B", eventType: "custom", status: "published", startAt: "2026-08-15 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
      { id: "event-c", organizationId: "org-1", name: "C", eventType: "custom", status: "draft", startAt: "2026-08-16 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
    ],
    currentOrganizationId: "org-1",
    currentEventId: "event-a",
    currentProfileId: "profile-1",
  });

  withLocalStorage({
    "entryflow.currentOrganizationId": "org-1",
    "entryflow.currentEventId": "event-b",
    "entryflow.currentProfileId": "profile-1",
  }, () => {
    const selection = resolveWorkspaceBootstrapSelection(workspace, "user-1");
    assert.equal(selection.currentOrganizationId, "org-1");
    assert.equal(selection.currentEventId, "event-b");
    assert.equal(selection.currentProfileId, "profile-1");
  });
});

test("cold preference hydration restores published B when bootstrap profile id is empty", () => {
  const workspace = buildWorkspace({
    organizations: [{ id: "org-1", name: "Org", slug: "org", status: "active", timezone: "America/La_Paz", branding: {}, settings: {} }],
    roles: [{ id: "role-1", slug: "owner", name: "Owner", permissions: [] }],
    profiles: [{ id: "profile-1", organizationId: "org-1", userId: "user-1", roleId: "role-1", displayName: "Owner", attributes: {}, status: "active", createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T10:00:00.000Z" }],
    events: [
      { id: "event-a", organizationId: "org-1", name: "A", eventType: "custom", status: "live", startAt: "2026-08-14 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
      { id: "event-b", organizationId: "org-1", name: "B", eventType: "custom", status: "published", startAt: "2026-08-15 20:00", timezone: "America/La_Paz", venue: "Venue", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] },
    ],
    currentOrganizationId: "org-1",
    currentEventId: "",
    currentProfileId: "",
  });

  withLocalStorage({ "entryflow.currentOrganizationId": "org-1", "entryflow.currentEventId": "event-b" }, () => {
    assert.equal(resolveWorkspacePreferenceSelection(workspace, "user-1").currentEventId, "event-b");
  });
});

test("event selection never falls back to another organization", () => {
  const events: Event[] = [
    { id: "event-a", organizationId: "org-a", name: "A", eventType: "custom", status: "live", startAt: "2026-08-14 20:00", timezone: "America/La_Paz", venue: "Venue A", capacity: 100, enabledModules: [], operationalModel: "mixed", admissionMethods: [], resourceTypes: [] } as Event,
  ];

  const selection = getEventSelection(events, "org-b", "event-a");

  assert.equal(selection.id, "");
  assert.equal(selection.organizationId, "org-b");
  assert.equal(selection.venue, "");
});
