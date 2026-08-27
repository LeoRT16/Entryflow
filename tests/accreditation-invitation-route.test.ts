import assert from "node:assert/strict";
import test from "node:test";

import { handleAccreditationInvitationSend } from "../app/api/accreditation/invitations/send/route";
import type { WorkspaceBootstrap } from "../services/workspace-loader";

function buildWorkspace(overrides: Partial<WorkspaceBootstrap> = {}): WorkspaceBootstrap {
  return {
    authState: {
      status: "ready",
      authUserId: "auth-owner",
      authUserEmail: "owner@example.com",
      publicUserId: "user-owner",
      organizationIds: ["org-1"],
    },
    currentUserId: "user-owner",
    users: [],
    profiles: [
      {
        id: "profile-owner",
        organizationId: "org-1",
        userId: "user-owner",
        roleId: "role-owner",
        displayName: "Owner",
        attributes: { permissions: ["access.issue"], status: "active" },
        status: "active",
        metadata: { permissions: ["access.issue"], attributes: { status: "active" } },
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    roles: [
      {
        id: "role-owner",
        slug: "owner",
        name: "Owner",
        permissions: ["access.issue"],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
        deletedAt: null,
        description: null,
        metadata: null,
      },
    ] as never,
    organizations: [
      {
        id: "org-1",
        name: "Org 1",
        slug: "org-1",
        status: "active",
        timezone: "America/La_Paz",
        branding: {},
        settings: {},
        metadata: null,
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
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
        id: "event-1",
        organizationId: "org-1",
        name: "Evento E2E",
        status: "published",
        startAt: "2026-08-26T12:00:00.000Z",
        endAt: null,
        timezone: "America/La_Paz",
        venue: "Venue E2E",
        capacity: 100,
        enabledModules: [],
        operationalModel: "accreditation",
        admissionMethods: [],
        resourceTypes: [],
        icon: null,
        metadata: null,
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
        deletedAt: null,
      },
    ] as never,
    guests: [],
    reservations: [],
    tables: [],
    checkIns: [],
    attempts: [],
    timelineEvents: [],
    whatsappDeliveryAttempts: [],
    currentOrganizationId: "org-1",
    currentEventId: "event-1",
    currentProfileId: "profile-owner",
    ...overrides,
  } as WorkspaceBootstrap;
}

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/accreditation/invitations/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("accreditation invitation send preserves access data and stores a new delivery attempt", async () => {
  const workspace = buildWorkspace();
  const sendCalls: Array<{ recipient: string; guestName: string; eventName: string; accessCode: string; mediaId?: string }> = [];
  const createCalls: Array<Record<string, unknown>> = [];

  const response = await handleAccreditationInvitationSend(
    buildRequest({ enrollmentId: "enrollment-1" }),
    {
      getAuthUser: async () => ({ id: "auth-owner", email: "owner@example.com" } as never),
      loadWorkspace: async () => workspace,
      getClient: () => ({} as never),
      createEnrollmentRepositories: () =>
        ({
          enrollments: {
            getById: async (enrollmentId: string) =>
              enrollmentId === "enrollment-1"
                ? {
                    id: "enrollment-1",
                    organizationId: "org-1",
                    eventId: "event-1",
                    name: "Leonardo Rodríguez",
                    phone: "+591 70000097",
                    status: "active",
                  }
                : undefined,
          },
          categories: {},
        } as never),
      createAccessRepositories: () =>
        ({
          create: async () => {
            throw new Error("not used");
          },
          getByEnrollment: async () => ({
            id: "grant-1",
            organizationId: "org-1",
            eventId: "event-1",
            enrollmentId: "enrollment-1",
            accessCode: "ACC-7K4D-9M2Q",
            qrToken: "acc1_1234567890abcdef1234567890abcdef",
            status: "active",
            issuedAt: "2026-08-26T00:00:00.000Z",
            updatedAt: "2026-08-26T00:00:00.000Z",
            revokedAt: null,
          }),
        } as never),
      createDeliveryRepositories: () =>
        ({
          create: async (attempt: Record<string, unknown>) => {
            createCalls.push(attempt);
            return {
              ...attempt,
              attemptNumber: 3,
            } as never;
          },
          getByMessageId: async () => undefined,
          listByEnrollment: async () => {
            throw new Error("should not read attempts before insert");
          },
          listByEvent: async () => {
            throw new Error("should not read attempts before insert");
          },
        } as never),
      sendWhatsApp: async (
        params: { recipient: string; guestName: string; eventName: string; accessCode: string; mediaId?: string },
        _fetch: typeof fetch,
        env: NodeJS.ProcessEnv,
      ) => {
        sendCalls.push(params);
        assert.equal(env.WHATSAPP_TEMPLATE_NAME, "accreditation_invitation");
        assert.equal(env.WHATSAPP_TEMPLATE_LANGUAGE, "es_MX");
        return { messageId: "wamid.mock-1" };
      },
      now: () => "2026-08-26T12:00:00.000Z",
      env: {
        NODE_ENV: "test",
        WHATSAPP_ACCREDITATION_TEMPLATE_NAME: "accreditation_invitation",
        WHATSAPP_ACCREDITATION_TEMPLATE_LANGUAGE: "es_MX",
        WHATSAPP_ACCREDITATION_IMAGE_TEMPLATE_NAME: "accreditation_invitation_image",
        WHATSAPP_ACCREDITATION_IMAGE_TEMPLATE_LANGUAGE: "es_MX",
      } as unknown as NodeJS.ProcessEnv,
    } as never,
  );

  const payload = (await response.json()) as {
    ok?: boolean;
    providerAccepted?: boolean;
    trackingPersisted?: boolean;
    status?: string;
    messageId?: string;
    attemptNumber?: number;
    mediaId?: string | null;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.providerAccepted, true);
  assert.equal(payload.status, "accepted");
  assert.equal(payload.trackingPersisted, true);
  assert.equal(payload.messageId, "wamid.mock-1");
  assert.equal(payload.attemptNumber, 3);
  assert.equal(payload.mediaId, null);
  assert.deepEqual(sendCalls, [
    {
      recipient: "59170000097",
      guestName: "Leonardo Rodríguez",
      eventName: "Evento E2E",
      accessCode: "ACC-7K4D-9M2Q",
    },
  ]);
  assert.equal(createCalls.length, 1);
  assert.equal((createCalls[0] as Record<string, unknown>).accessCode, "ACC-7K4D-9M2Q");
  assert.equal((createCalls[0] as Record<string, unknown>).qrToken, "acc1_1234567890abcdef1234567890abcdef");
  assert.equal((createCalls[0] as Record<string, unknown>).templateName, "accreditation_invitation");
});

test("accreditation invitation send fails closed when the enrollment phone is invalid", async () => {
  const workspace = buildWorkspace();
  const response = await handleAccreditationInvitationSend(
    buildRequest({ enrollmentId: "enrollment-1" }),
    {
      getAuthUser: async () => ({ id: "auth-owner", email: "owner@example.com" } as never),
      loadWorkspace: async () => workspace,
      getClient: () => ({} as never),
      createEnrollmentRepositories: () =>
        ({
          enrollments: {
            getById: async () => ({
              id: "enrollment-1",
              organizationId: "org-1",
              eventId: "event-1",
              name: "Leonardo Rodríguez",
              phone: "abc",
              status: "active",
            }),
          },
          categories: {},
        } as never),
      createAccessRepositories: () =>
        ({
          create: async () => {
            throw new Error("not used");
          },
          getByEnrollment: async () => ({
            id: "grant-1",
            organizationId: "org-1",
            eventId: "event-1",
            enrollmentId: "enrollment-1",
            accessCode: "ACC-7K4D-9M2Q",
            qrToken: "acc1_1234567890abcdef1234567890abcdef",
            status: "active",
            issuedAt: "2026-08-26T00:00:00.000Z",
            updatedAt: "2026-08-26T00:00:00.000Z",
            revokedAt: null,
          }),
        } as never),
      createDeliveryRepositories: () =>
        ({
          create: async () => {
            throw new Error("should not persist when phone is invalid");
          },
          getByMessageId: async () => undefined,
          listByEnrollment: async () => [],
          listByEvent: async () => [],
        } as never),
      sendWhatsApp: async () => {
        throw new Error("should not send when phone is invalid");
      },
      env: {
        NODE_ENV: "test",
        WHATSAPP_ACCREDITATION_TEMPLATE_NAME: "accreditation_invitation",
        WHATSAPP_ACCREDITATION_TEMPLATE_LANGUAGE: "es_MX",
      } as unknown as NodeJS.ProcessEnv,
    } as never,
  );

  const payload = (await response.json()) as { ok?: boolean; error?: { code?: string; message?: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.code, "invalid_whatsapp_number");
});
