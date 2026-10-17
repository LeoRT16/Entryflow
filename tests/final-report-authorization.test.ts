import assert from "node:assert/strict";
import test from "node:test";
import type { AccountRolePreset } from "@/features/accounts/types";
import { authorizeFinalReportEvent } from "@/lib/reporting/final-report-authorization";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";

const organizationA = "org-a";
const organizationB = "org-b";
const ownerRole = { id: "owner", slug: "owner", name: "Owner", description: "", permissions: ["event.view", "event.edit"], metadata: {} } satisfies AccountRolePreset;
const readerRole = { id: "reader", slug: "reader", name: "Reader", description: "", permissions: ["event.view"], metadata: {} } satisfies AccountRolePreset;

function workspace(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  return {
    authState: { status: "ready", authUserId: "auth-user", authUserEmail: null, publicUserId: "user-a", organizationIds: [organizationA, organizationB] },
    currentUserId: "user-a",
    currentOrganizationId: organizationB,
    currentEventId: "event-a",
    currentProfileId: "profile-a",
    users: [],
    profiles: [{ id: "profile-a", userId: "user-a", organizationId: organizationA, roleId: "owner", displayName: "Owner", metadata: {}, attributes: {}, status: "active", createdAt: "", updatedAt: "", deletedAt: null }],
    roles: [ownerRole],
    organizations: [], venues: [], sectors: [], resources: [], venueLayouts: [], venueLayoutSectors: [], venueLayoutResources: [], eventLayouts: [], eventLayoutSectors: [], eventLayoutResources: [],
    events: [{ id: "event-a", organizationId: organizationA, name: "Event A", status: "live", startAt: "", createdAt: "", updatedAt: "", deletedAt: null }],
    guests: [], reservations: [], extraWristbandSales: [], tables: [], checkIns: [], attempts: [], timelineEvents: [], whatsappDeliveryAttempts: [],
    ...overrides,
  } as WorkspaceBootstrap;
}

test("Root can finalize an event from an authorized organization even when another organization is current", () => {
  const result = authorizeFinalReportEvent(workspace({ isPlatformRoot: true }), "event-a", "event.edit");
  assert.ok("event" in result);
});

test("Owner is authorized in the event owning organization", () => {
  const result = authorizeFinalReportEvent(workspace(), "event-a", "event.edit");
  assert.ok("event" in result);
});

test("a role without event.edit is rejected", () => {
  const result = authorizeFinalReportEvent(workspace({ profiles: [{ id: "profile-a", userId: "user-a", organizationId: organizationA, roleId: "reader", displayName: "Reader", metadata: {}, attributes: {}, status: "active", createdAt: "", updatedAt: "", deletedAt: null }], roles: [readerRole] }), "event-a", "event.edit");
  assert.deepEqual(result, { code: "finalization_forbidden" });
});

test("a user without a membership in the event organization is rejected", () => {
  const result = authorizeFinalReportEvent(workspace({ profiles: [] }), "event-a", "event.edit");
  assert.deepEqual(result, { code: "finalization_forbidden" });
});
