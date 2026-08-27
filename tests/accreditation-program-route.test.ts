import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "@/app/api/accreditation/events/[eventId]/sessions/route";
import { DELETE, PATCH } from "@/app/api/accreditation/events/[eventId]/sessions/[sessionId]/route";
import { resolveAccreditationProgramScope } from "@/features/accreditation/program/accreditation-program-operational";

type SessionMutationCapture = {
  title?: unknown;
  organizationId?: unknown;
};

function buildRequest(body: unknown, method = "POST") {
  return new Request("http://localhost", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildWorkspace(overrides?: Partial<Record<string, unknown>>) {
  return {
    authState: { status: "ready" },
    currentOrganizationId: "org-1",
    currentEventId: "event-1",
    currentProfileId: "profile-1",
    profiles: [
      {
        id: "profile-1",
        roleId: "role-admin",
        displayName: "Admin",
        deletedAt: null,
        metadata: { permissions: ["event.edit"] },
      },
    ],
    roles: [
      {
        id: "role-admin",
        slug: "administrator",
        label: "Administrator",
        permissions: ["event.edit"],
        metadata: {},
      },
    ],
    events: [
      {
        id: "event-1",
        organizationId: "org-1",
        name: "Conferencia",
        eventType: "conference",
        operationalModel: "accreditation",
        startAt: "2026-09-01T15:00:00.000Z",
        endAt: null,
        timezone: "America/La_Paz",
        venue: "Auditorio",
      },
    ],
    sectors: [],
    ...overrides,
  };
}

test("program scope rejects unauthorized users", async () => {
  const result = await resolveAccreditationProgramScope({
    eventId: "event-1",
    dependencies: {
      getAuthUser: async () => ({ id: "user-1", email: "admin@example.com" } as never),
      loadWorkspace: async () =>
        buildWorkspace({
          profiles: [
            {
              id: "profile-1",
              roleId: "role-door",
              displayName: "Door",
              deletedAt: null,
              metadata: { permissions: [] },
            },
          ],
          roles: [
            {
              id: "role-door",
              slug: "door",
              label: "Door",
              permissions: [],
              metadata: {},
            },
          ],
        }) as never,
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
  }
});

test("program POST creates a session with normalized payload", async () => {
  let createPayload: SessionMutationCapture | null = null;

  const response = await POST(
    buildRequest({
      title: "Keynote",
      description: "Opening session",
      sessionType: "keynote",
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T11:00:00.000Z",
      room: "Main hall",
      capacity: 120,
    }),
    { params: Promise.resolve({ eventId: "event-1" }) },
    {
      resolveScope: async () =>
        ({
          ok: true,
          event: buildWorkspace().events[0],
          workspace: buildWorkspace(),
          currentProfile: buildWorkspace().profiles[0],
          permissions: ["event.edit"],
          canManageProgram: true,
        }) as never,
      getClient: () => ({}) as never,
      createRepositories: () =>
        ({
          async create(input: Record<string, unknown>) {
            createPayload = input;
            return {
              id: "session-1",
              organizationId: "org-1",
              eventId: "event-1",
              title: "Keynote",
              description: "Opening session",
              sessionType: "keynote",
              startsAt: "2026-09-01T10:00:00.000Z",
              endsAt: "2026-09-01T11:00:00.000Z",
              room: "Main hall",
              capacity: 120,
              metadata: undefined,
              status: "active",
              cancelledAt: null,
              createdAt: "2026-08-27T00:00:00.000Z",
              updatedAt: "2026-08-27T00:00:00.000Z",
            };
          },
        }) as never,
    },
  );

  const payload = (await response.json()) as { ok?: boolean };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  const createdPayload = createPayload as { title?: unknown; organizationId?: unknown } | null;
  assert.equal(createdPayload?.title, "Keynote");
  assert.equal(createdPayload?.organizationId, "org-1");
});

test("program PATCH and DELETE preserve identity boundaries", async () => {
  let updatePayload: SessionMutationCapture | null = null;
  let cancelled = false;

  const response = await PATCH(
    buildRequest({
      title: "Keynote Updated",
      description: "Opening session",
      sessionType: "panel",
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T11:30:00.000Z",
      room: "Main hall",
      capacity: 150,
    }, "PATCH"),
    { params: Promise.resolve({ eventId: "event-1", sessionId: "session-1" }) },
    {
      resolveScope: async () =>
        ({
          ok: true,
          event: buildWorkspace().events[0],
          workspace: buildWorkspace(),
          currentProfile: buildWorkspace().profiles[0],
          permissions: ["event.edit"],
          canManageProgram: true,
        }) as never,
      getClient: () => ({}) as never,
      createRepositories: () =>
        ({
          async getById() {
            return {
              id: "session-1",
              organizationId: "org-1",
              eventId: "event-1",
              title: "Keynote",
              description: undefined,
              sessionType: "keynote",
              startsAt: "2026-09-01T10:00:00.000Z",
              endsAt: "2026-09-01T11:00:00.000Z",
              room: undefined,
              capacity: undefined,
              metadata: undefined,
              status: "active",
              cancelledAt: null,
              createdAt: "2026-08-27T00:00:00.000Z",
              updatedAt: "2026-08-27T00:00:00.000Z",
            };
          },
          async update(_id: string, patch: Record<string, unknown>) {
            updatePayload = patch;
            return {
              id: "session-1",
              organizationId: "org-1",
              eventId: "event-1",
              title: "Keynote Updated",
              description: "Opening session",
              sessionType: "panel",
              startsAt: "2026-09-01T10:00:00.000Z",
              endsAt: "2026-09-01T11:30:00.000Z",
              room: "Main hall",
              capacity: 150,
              metadata: undefined,
              status: "active",
              cancelledAt: null,
              createdAt: "2026-08-27T00:00:00.000Z",
              updatedAt: "2026-08-27T00:20:00.000Z",
            };
          },
          async cancel() {
            cancelled = true;
            return {
              id: "session-1",
              organizationId: "org-1",
              eventId: "event-1",
              title: "Keynote Updated",
              description: "Opening session",
              sessionType: "panel",
              startsAt: "2026-09-01T10:00:00.000Z",
              endsAt: "2026-09-01T11:30:00.000Z",
              room: "Main hall",
              capacity: 150,
              metadata: undefined,
              status: "cancelled",
              cancelledAt: "2026-08-27T00:30:00.000Z",
              createdAt: "2026-08-27T00:00:00.000Z",
              updatedAt: "2026-08-27T00:30:00.000Z",
            };
          },
        }) as never,
    },
  );

  const payload = (await response.json()) as { ok?: boolean };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  const updatedPayload = updatePayload as { title?: unknown } | null;
  assert.equal(updatedPayload?.title, "Keynote Updated");

  const cancelResponse = await DELETE(
    buildRequest({}, "DELETE"),
    { params: Promise.resolve({ eventId: "event-1", sessionId: "session-1" }) },
    {
      resolveScope: async () =>
        ({
          ok: true,
          event: buildWorkspace().events[0],
          workspace: buildWorkspace(),
          currentProfile: buildWorkspace().profiles[0],
          permissions: ["event.edit"],
          canManageProgram: true,
        }) as never,
      getClient: () => ({}) as never,
      createRepositories: () =>
        ({
          async getById() {
            return {
              id: "session-1",
              organizationId: "org-1",
              eventId: "event-1",
              title: "Keynote Updated",
              description: "Opening session",
              sessionType: "panel",
              startsAt: "2026-09-01T10:00:00.000Z",
              endsAt: "2026-09-01T11:30:00.000Z",
              room: "Main hall",
              capacity: 150,
              metadata: undefined,
              status: "active",
              cancelledAt: null,
              createdAt: "2026-08-27T00:00:00.000Z",
              updatedAt: "2026-08-27T00:20:00.000Z",
            };
          },
          cancel: async () => {
            cancelled = true;
            return {
              id: "session-1",
              organizationId: "org-1",
              eventId: "event-1",
              title: "Keynote Updated",
              description: "Opening session",
              sessionType: "panel",
              startsAt: "2026-09-01T10:00:00.000Z",
              endsAt: "2026-09-01T11:30:00.000Z",
              room: "Main hall",
              capacity: 150,
              metadata: undefined,
              status: "cancelled",
              cancelledAt: "2026-08-27T00:30:00.000Z",
              createdAt: "2026-08-27T00:00:00.000Z",
              updatedAt: "2026-08-27T00:30:00.000Z",
            };
          },
        }) as never,
    },
  );

  const cancelPayload = (await cancelResponse.json()) as { ok?: boolean };

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelPayload.ok, true);
  assert.equal(cancelled, true);
});
