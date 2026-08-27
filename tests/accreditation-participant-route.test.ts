import assert from "node:assert/strict";
import test from "node:test";

import { PATCH, DELETE } from "@/app/api/accreditation/events/[eventId]/participants/[enrollmentId]/route";
import { POST as createParticipant } from "@/app/api/accreditation/events/[eventId]/participants/route";
import { getRolePresetBySlug } from "@/features/accounts/domain/accounts-domain";

function buildWorkspace(overrides?: Partial<Record<string, unknown>>) {
  return {
    authState: { status: "ready" },
    currentOrganizationId: "org-1",
    currentEventId: "event-1",
    currentProfileId: "profile-1",
    profiles: [
      {
        id: "profile-1",
        roleId: getRolePresetBySlug("administrator").id,
        displayName: "Admin",
        deletedAt: null,
        metadata: { permissions: ["event.edit"] },
      },
    ],
    roles: [
      getRolePresetBySlug("administrator"),
      getRolePresetBySlug("reception"),
      getRolePresetBySlug("door"),
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
      {
        id: "event-2",
        organizationId: "org-1",
        name: "Boliche",
        eventType: "nightlife",
        operationalModel: "mixed",
        startAt: "2026-09-01T15:00:00.000Z",
        endAt: null,
        timezone: "America/La_Paz",
        venue: "Main room",
      },
    ],
    sectors: [],
    ...overrides,
  };
}

function buildRequest(body: unknown, method = "POST") {
  return new Request("http://localhost", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type ParticipantMutationCall = {
  organizationId: string;
  eventId: string;
  metadata: {
    company?: string;
    badgeName?: string;
    [key: string]: unknown;
  };
};

type ParticipantCreateInput = ParticipantMutationCall & {
  name: string;
  email: string | null;
  phone: string | null;
  categoryId: string | null;
};

type ParticipantMutationResponse = {
  ok?: boolean;
  status?: string;
  error?: { message?: string };
};

test("participant create succeeds and preserves typed metadata", async () => {
  const createCalls: ParticipantMutationCall[] = [];
  const response = await createParticipant(
    buildRequest({
      name: "Ana Pérez",
      email: "ana@example.com",
      phone: "+59170000001",
      categoryId: "category-1",
      company: "OpenAI Bolivia",
      jobTitle: "Speaker",
      badgeName: "Ana",
      participantRole: "Ponente",
    }),
    { params: Promise.resolve({ eventId: "event-1" }) },
    {
      getAuthUser: async () => ({ id: "user-1", email: "admin@example.com" } as never),
      loadWorkspace: async () => buildWorkspace() as never,
      getClient: () => ({}) as never,
      createEnrollmentRepositories: () =>
        ({
          enrollments: {
            async create(input: ParticipantCreateInput) {
              createCalls.push(input);
              return {
                id: "enrollment-1",
                organizationId: "org-1",
                eventId: "event-1",
                name: "Ana Pérez",
                email: "ana@example.com",
                phone: "+59170000001",
                categoryId: "category-1",
                status: "active",
                metadata: {
                  company: "OpenAI Bolivia",
                  jobTitle: "Speaker",
                  badgeName: "Ana",
                  participantRole: "Ponente",
                },
                createdAt: "2026-08-27T10:00:00.000Z",
                updatedAt: "2026-08-27T10:00:00.000Z",
                deletedAt: null,
              };
            },
          },
        }) as never,
    },
  );

  const payload = (await response.json()) as ParticipantMutationResponse;

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(createCalls[0]?.organizationId, "org-1");
  assert.equal(createCalls[0]?.eventId, "event-1");
  assert.equal(createCalls[0]?.metadata.company, "OpenAI Bolivia");
  assert.equal(createCalls[0]?.metadata.badgeName, "Ana");
});

test("participant create rejects unauthorized and unrelated events", async () => {
  const forbidden = await createParticipant(
    buildRequest({ name: "Ana Pérez" }),
    { params: Promise.resolve({ eventId: "event-1" }) },
    {
      getAuthUser: async () => ({ id: "user-1", email: "admin@example.com" } as never),
      loadWorkspace: async () =>
        buildWorkspace({
          profiles: [
            {
              id: "profile-1",
              roleId: getRolePresetBySlug("door").id,
              displayName: "Door",
              deletedAt: null,
              metadata: { permissions: [] },
            },
          ],
        }) as never,
    },
  );

  assert.equal(forbidden.status, 403);

  const unsupported = await createParticipant(
    buildRequest({ name: "Ana Pérez" }),
    { params: Promise.resolve({ eventId: "event-2" }) },
    {
      getAuthUser: async () => ({ id: "user-1", email: "admin@example.com" } as never),
      loadWorkspace: async () => buildWorkspace() as never,
    } as never,
  );

  assert.equal(unsupported.status, 400);
});

test("participant update preserves unrelated metadata and cancel keeps history", async () => {
  let updatePayload: { metadata?: ParticipantMutationCall["metadata"] } | null = null;
  let cancelled = false;

  const workspace = buildWorkspace();

  const response = await PATCH(
    buildRequest({
      name: "Ana Pérez Actualizada",
      badgeName: "Ana VIP",
      company: "OpenAI Bolivia",
    }, "PATCH"),
    { params: Promise.resolve({ eventId: "event-1", enrollmentId: "enrollment-1" }) },
    {
      getAuthUser: async () => ({ id: "user-1", email: "admin@example.com" } as never),
      loadWorkspace: async () => workspace as never,
      getClient: () => ({}) as never,
      createEnrollmentRepositories: () =>
        ({
          enrollments: {
            async getById() {
              return {
                id: "enrollment-1",
                organizationId: "org-1",
                eventId: "event-1",
                name: "Ana Pérez",
                email: "ana@example.com",
                phone: "+59170000001",
                categoryId: "category-1",
                status: "active",
                metadata: { custom: "keep", company: "Old" },
                createdAt: "2026-08-27T10:00:00.000Z",
                updatedAt: "2026-08-27T10:00:00.000Z",
                deletedAt: null,
              };
            },
            async update(_id: string, patch: Record<string, unknown>) {
              updatePayload = patch;
              return {
                id: "enrollment-1",
                organizationId: "org-1",
                eventId: "event-1",
                name: "Ana Pérez Actualizada",
                email: "ana@example.com",
                phone: "+59170000001",
                categoryId: "category-1",
                status: "active",
                metadata: { custom: "keep", company: "OpenAI Bolivia", badgeName: "Ana VIP" },
                createdAt: "2026-08-27T10:00:00.000Z",
                updatedAt: "2026-08-27T10:20:00.000Z",
                deletedAt: null,
              };
            },
            async cancel() {
              cancelled = true;
              return {
                id: "enrollment-1",
                organizationId: "org-1",
                eventId: "event-1",
                name: "Ana Pérez Actualizada",
                email: "ana@example.com",
                phone: "+59170000001",
                categoryId: "category-1",
                status: "cancelled",
                metadata: { custom: "keep", company: "OpenAI Bolivia", badgeName: "Ana VIP" },
                createdAt: "2026-08-27T10:00:00.000Z",
                updatedAt: "2026-08-27T10:20:00.000Z",
                deletedAt: null,
              };
            },
          },
        }) as never,
    },
  );

  const payload = (await response.json()) as ParticipantMutationResponse;

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  const updatedMetadata = (updatePayload as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
  assert.equal((updatedMetadata as Record<string, unknown>).custom, "keep");
  assert.equal((updatedMetadata as Record<string, unknown>).badgeName, "Ana VIP");
  assert.equal(cancelled, false);

  const cancelResponse = await DELETE(
    new Request("http://localhost", { method: "DELETE" }),
    { params: Promise.resolve({ eventId: "event-1", enrollmentId: "enrollment-1" }) },
    {
      getAuthUser: async () => ({ id: "user-1", email: "admin@example.com" } as never),
      loadWorkspace: async () => workspace as never,
      getClient: () => ({}) as never,
      createEnrollmentRepositories: () =>
        ({
          enrollments: {
            async getById() {
              return {
                id: "enrollment-1",
                organizationId: "org-1",
                eventId: "event-1",
                name: "Ana Pérez",
                email: "ana@example.com",
                phone: "+59170000001",
                categoryId: "category-1",
                status: "active",
                metadata: { custom: "keep" },
                createdAt: "2026-08-27T10:00:00.000Z",
                updatedAt: "2026-08-27T10:00:00.000Z",
                deletedAt: null,
              };
            },
            async cancel() {
              cancelled = true;
              return {
                id: "enrollment-1",
                organizationId: "org-1",
                eventId: "event-1",
                name: "Ana Pérez",
                email: "ana@example.com",
                phone: "+59170000001",
                categoryId: "category-1",
                status: "cancelled",
                metadata: { custom: "keep" },
                createdAt: "2026-08-27T10:00:00.000Z",
                updatedAt: "2026-08-27T10:20:00.000Z",
                deletedAt: null,
              };
            },
          },
        }) as never,
    } as never,
  );

  const cancelPayload = (await cancelResponse.json()) as ParticipantMutationResponse;

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelPayload.status, "cancelled");
  assert.equal(cancelled, true);
});
