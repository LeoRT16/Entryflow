import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeAccountPermissionsForPersistence,
  getAccountEditablePermissions,
  getRolePresetBySlug,
  hasSameAccountPermissionSet,
  resolveAccountPermissions,
} from "../features/accounts/domain/accounts-domain";
import type { Event as PlatformEvent } from "../features/domain/types";
import type { AccountPermissionKey } from "../features/accounts/types";
import { getFirstAccessibleNavigationHref, getNavigationGroups, getNavigationPermissionForPath } from "../features/navigation/navigation";
import { isPublicRoute } from "../features/navigation/public-routes";
import { config as proxyConfig } from "../proxy";

const doorPermissions = new Set(getRolePresetBySlug("door").permissions);
const eventContext: Pick<PlatformEvent, "enabledModules"> = {
  enabledModules: ["overview", "attendees", "admission", "access", "resources", "activity", "analytics"],
};
const legacyDoorPermissions = [
  "reservation.view",
  "guest.view",
  "resource.view",
  "access.view",
  "checkin.view",
  "checkin.perform",
  "dashboard.view",
] as const;

function buildCan(permissions: readonly AccountPermissionKey[]) {
  const allowed = new Set(permissions);

  return (permission: AccountPermissionKey) => allowed.has(permission);
}

test("door preset excludes reservations and resources from navigation", () => {
  assert.equal(doorPermissions.has("reservation.view"), false);
  assert.equal(doorPermissions.has("resource.view"), false);
});

test("legacy door snapshots resolve to the current preset unless they were explicitly customized", () => {
  const resolvedLegacy = resolveAccountPermissions({
    permissions: legacyDoorPermissions,
    rolePermissions: getRolePresetBySlug("door").permissions,
    roleMetadata: { legacyPermissions: legacyDoorPermissions },
    accountMetadata: {},
  });

  const resolvedCustom = resolveAccountPermissions({
    permissions: ["guest.view", "access.view", "checkin.view", "checkin.perform", "dashboard.view", "resource.view"],
    rolePermissions: getRolePresetBySlug("door").permissions,
    roleMetadata: { legacyPermissions: legacyDoorPermissions },
    accountMetadata: { permissionsSource: "custom" },
  });

  assert.deepEqual(resolvedLegacy, getRolePresetBySlug("door").permissions);
  assert.equal(resolvedLegacy.includes("reservation.view"), false);
  assert.equal(resolvedLegacy.includes("resource.view"), false);
  assert.equal(resolvedCustom.includes("resource.view"), true);
});

test("door sidebar stays limited to the three operational links by default", () => {
  const groups = getNavigationGroups(buildCan(getRolePresetBySlug("door").permissions), eventContext);

  assert.deepEqual(groups.map((group) => group.title), ["Operación"]);
  assert.deepEqual(groups[0]?.links.map((item) => item.label), ["Resumen", "Invitados", "Ingreso"]);
  assert.equal(groups[0]?.links.some((item) => item.label === "Reservas"), false);
  assert.equal(groups[0]?.links.some((item) => item.label === "Espacios"), false);
});

test("accreditation event navigation replaces legacy reservation surfaces", () => {
  const concert: Pick<PlatformEvent, "id" | "eventType" | "enabledModules"> = {
    id: "concert-1",
    eventType: "concert",
    enabledModules: ["overview", "access", "attendees", "admission", "operations", "activity", "analytics", "notifications", "gates"],
  };
  const permissions = getRolePresetBySlug("administrator").permissions;
  const links = getNavigationGroups(buildCan(permissions), concert)[0]?.links ?? [];

  assert.equal(links.some((item) => item.label === "Reservas"), false);
  assert.equal(links.some((item) => item.label === "Invitados"), false);
  assert.equal(links.some((item) => item.label === "Ingreso"), false);
  assert.equal(links.find((item) => item.label === "Acreditación")?.href, "/accreditation/events/concert-1");
  assert.equal(links.find((item) => item.label === "Acceso operativo")?.href, "/accreditation/events/concert-1/access");
});

test("door navigation expands only when explicit overrides are present", () => {
  const basePermissions = getRolePresetBySlug("door").permissions;
  const withVenue = resolveAccountPermissions({
    permissions: [...basePermissions, "venue.view", "venue.manage"],
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: legacyDoorPermissions },
    accountMetadata: { permissionsSource: "custom" },
  });
  const withReservation = resolveAccountPermissions({
    permissions: [...basePermissions, "reservation.view"],
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: legacyDoorPermissions },
    accountMetadata: { permissionsSource: "custom" },
  });
  const withResource = resolveAccountPermissions({
    permissions: [...basePermissions, "resource.view"],
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: legacyDoorPermissions },
    accountMetadata: { permissionsSource: "custom" },
  });
  const withBoth = resolveAccountPermissions({
    permissions: [...basePermissions, "reservation.view", "resource.view"],
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: legacyDoorPermissions },
    accountMetadata: { permissionsSource: "custom" },
  });
  const afterRemoval = resolveAccountPermissions({
    permissions: legacyDoorPermissions,
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: legacyDoorPermissions },
    accountMetadata: {},
  });

  assert.equal(withVenue.includes("resource.view"), true);
  assert.equal(getNavigationGroups(buildCan(withVenue), eventContext)[0]?.links.some((item) => item.label === "Espacios"), true);
  assert.equal(getNavigationGroups(buildCan(withReservation), eventContext)[0]?.links.some((item) => item.label === "Reservas"), true);
  assert.equal(getNavigationGroups(buildCan(withResource), eventContext)[0]?.links.some((item) => item.label === "Espacios"), true);
  assert.equal(getNavigationGroups(buildCan(withBoth), eventContext)[0]?.links.some((item) => item.label === "Reservas"), true);
  assert.equal(getNavigationGroups(buildCan(withBoth), eventContext)[0]?.links.some((item) => item.label === "Espacios"), true);
  assert.deepEqual(getNavigationGroups(buildCan(afterRemoval), eventContext)[0]?.links.map((item) => item.label), ["Resumen", "Invitados", "Ingreso"]);
});

test("editor hydration keeps explicit venue overrides separate from the preset and does not persist derived permissions", () => {
  const basePermissions = getRolePresetBySlug("door").permissions;
  const hydratedPreset = getAccountEditablePermissions({
    rolePermissions: basePermissions,
    metadata: { permissionsSource: "preset" },
  });
  const hydratedCustom = getAccountEditablePermissions({
    rolePermissions: basePermissions,
    metadata: {
      permissionsSource: "custom",
      permissions: [...basePermissions, "venue.view", "venue.manage"],
    },
  });
  const persistedWithoutChanges = canonicalizeAccountPermissionsForPersistence({
    permissions: hydratedPreset,
    rolePermissions: basePermissions,
  });
  const persistedWithVenue = canonicalizeAccountPermissionsForPersistence({
    permissions: hydratedCustom,
    rolePermissions: basePermissions,
  });
  const withVenuePermissionsSource = hasSameAccountPermissionSet(persistedWithVenue, basePermissions) ? "preset" : "custom";
  const resolvedWithVenue = resolveAccountPermissions({
    permissions: persistedWithVenue,
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: [...basePermissions, "resource.view"] },
    accountMetadata: { permissionsSource: withVenuePermissionsSource },
  });

  const backToPresetSelection = canonicalizeAccountPermissionsForPersistence({
    permissions: hydratedPreset,
    rolePermissions: basePermissions,
  });
  const backToPresetPermissionsSource = hasSameAccountPermissionSet(backToPresetSelection, basePermissions) ? "preset" : "custom";
  const resolvedBackToPreset = resolveAccountPermissions({
    permissions: backToPresetSelection,
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: [...basePermissions, "resource.view"] },
    accountMetadata: { permissionsSource: backToPresetPermissionsSource },
  });

  assert.deepEqual(hydratedPreset, basePermissions);
  assert.deepEqual(persistedWithoutChanges, basePermissions);
  assert.deepEqual(hydratedCustom, [...basePermissions, "venue.view", "venue.manage"]);
  assert.equal(withVenuePermissionsSource, "custom");
  assert.equal(persistedWithVenue.includes("resource.view"), false);
  assert.equal(resolvedWithVenue.includes("resource.view"), true);
  assert.equal(backToPresetPermissionsSource, "preset");
  assert.deepEqual(backToPresetSelection, basePermissions);
  assert.equal(resolvedBackToPreset.includes("resource.view"), false);
});

test("roundtrip persistence preserves explicit resource overrides when venue is not selected", () => {
  const basePermissions = getRolePresetBySlug("door").permissions;
  const explicitResourceSelection = canonicalizeAccountPermissionsForPersistence({
    permissions: [...basePermissions, "resource.view"],
    rolePermissions: basePermissions,
  });
  const permissionsSource = hasSameAccountPermissionSet(explicitResourceSelection, basePermissions) ? "preset" : "custom";
  const resolved = resolveAccountPermissions({
    permissions: explicitResourceSelection,
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: [...basePermissions, "resource.view"] },
    accountMetadata: { permissionsSource },
  });

  assert.equal(permissionsSource, "custom");
  assert.equal(explicitResourceSelection.includes("resource.view"), true);
  assert.equal(resolved.includes("resource.view"), true);
});

test("roundtrip persistence preserves reservation overrides and returns to the preset when removed", () => {
  const basePermissions = getRolePresetBySlug("door").permissions;
  const withReservation = canonicalizeAccountPermissionsForPersistence({
    permissions: [...basePermissions, "reservation.view"],
    rolePermissions: basePermissions,
  });
  const withReservationSource = hasSameAccountPermissionSet(withReservation, basePermissions) ? "preset" : "custom";
  const resolvedWithReservation = resolveAccountPermissions({
    permissions: withReservation,
    rolePermissions: basePermissions,
    roleMetadata: { legacyPermissions: [...basePermissions, "resource.view"] },
    accountMetadata: { permissionsSource: withReservationSource },
  });
  const withoutReservation = canonicalizeAccountPermissionsForPersistence({
    permissions: basePermissions,
    rolePermissions: basePermissions,
  });

  assert.equal(withReservationSource, "custom");
  assert.equal(resolvedWithReservation.includes("reservation.view"), true);
  assert.deepEqual(withoutReservation, basePermissions);
});

test("core role presets keep their expected access surfaces", () => {
  const owner = new Set(getRolePresetBySlug("owner").permissions);
  const administrator = new Set(getRolePresetBySlug("administrator").permissions);
  const reception = new Set(getRolePresetBySlug("reception").permissions);

  assert.equal(owner.has("reservation.view"), true);
  assert.equal(owner.has("resource.view"), true);
  assert.equal(administrator.has("permissions.manage"), false);
  assert.equal(reception.has("reservation.view"), true);
  assert.equal(reception.has("resource.view"), true);
});

test("navigation groups omit empty sections after permission filtering", () => {
  const groups = getNavigationGroups(buildCan(getRolePresetBySlug("door").permissions), eventContext);

  assert.deepEqual(groups.map((group) => group.title), ["Operación"]);
  assert.deepEqual(groups[0]?.links.map((item) => item.label), ["Resumen", "Invitados", "Ingreso"]);
});

test("the first accessible navigation target follows the configured order", () => {
  const href = getFirstAccessibleNavigationHref(buildCan(getRolePresetBySlug("door").permissions), eventContext);

  assert.equal(href, "/");
});

test("path requirements resolve to the canonical permission", () => {
  assert.equal(getNavigationPermissionForPath("/settings"), "settings.view");
  assert.equal(getNavigationPermissionForPath("/check-in/manual"), "checkin.view");
  assert.equal(getNavigationPermissionForPath("/reservations/123?tab=guests"), "reservation.view");
  assert.equal(getNavigationPermissionForPath("/tables/room-a/"), "resource.view");
  assert.equal(getNavigationPermissionForPath("/unknown"), null);
});

test("proxy matcher covers private app routes and excludes only public/static assets", () => {
  const matcher = new RegExp("^/((?!_next/static|_next/image|favicon\\.ico|api/).*)$");

  assert.equal(matcher.test("/reservations"), true);
  assert.equal(matcher.test("/reservations/"), true);
  assert.equal(matcher.test("/tables"), true);
  assert.equal(matcher.test("/tables/room-a"), true);
  assert.equal(matcher.test("/api/accounts/invite"), false);
  assert.equal(matcher.test("/_next/static/chunk.js"), false);
  assert.equal(matcher.test("/favicon.ico"), false);
  assert.deepEqual(proxyConfig.matcher, ["/((?!_next/static|_next/image|favicon.ico|api/).*)"]);
});

test("public legal routes remain accessible without authentication", () => {
  assert.equal(isPublicRoute("/privacy"), true);
  assert.equal(isPublicRoute("/data-deletion"), true);
  assert.equal(isPublicRoute("/login"), true);
  assert.equal(isPublicRoute("/auth/setup-password"), true);
  assert.equal(isPublicRoute("/reservations"), false);
});
