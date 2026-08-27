import assert from "node:assert/strict";
import test from "node:test";

import { buildAccreditationParticipantOperationalReadModel } from "@/features/accreditation/participants";

test("participant operational read model resolves profile, invitation, credential and check-in state", () => {
  const model = buildAccreditationParticipantOperationalReadModel({
    event: {
      id: "event-1",
      name: "Conferencia de prueba",
      eventType: "conference",
      operationalModel: "accreditation",
      startAt: "2026-09-01T15:00:00.000Z",
      endAt: "2026-09-01T19:00:00.000Z",
      timezone: "America/La_Paz",
      venue: "Auditorio",
    },
    canEdit: true,
    canCancel: true,
    enrollments: [
      {
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
      },
      {
        id: "enrollment-2",
        organizationId: "org-1",
        eventId: "event-1",
        name: "Bruno Gómez",
        email: "bruno@example.com",
        phone: "+59170000002",
        categoryId: "category-2",
        status: "cancelled",
        metadata: { participantRole: "Asistente" },
        createdAt: "2026-08-27T11:00:00.000Z",
        updatedAt: "2026-08-27T11:00:00.000Z",
        deletedAt: null,
      },
    ],
    categories: [
      {
        id: "category-1",
        organizationId: "org-1",
        eventId: "event-1",
        slug: "vip",
        name: "VIP",
        description: undefined,
        color: undefined,
        sortOrder: 0,
        isActive: true,
        metadata: undefined,
        createdAt: "2026-08-27T00:00:00.000Z",
        updatedAt: "2026-08-27T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "category-2",
        organizationId: "org-1",
        eventId: "event-1",
        slug: "asistencia",
        name: "Asistencia",
        description: undefined,
        color: undefined,
        sortOrder: 0,
        isActive: true,
        metadata: undefined,
        createdAt: "2026-08-27T00:00:00.000Z",
        updatedAt: "2026-08-27T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    accessGrants: [
      {
        id: "grant-1",
        organizationId: "org-1",
        eventId: "event-1",
        enrollmentId: "enrollment-1",
        accessCode: "ACC-ABCD-EFGH",
        qrToken: "acc1_opaque",
        status: "active",
        issuedAt: "2026-08-27T10:10:00.000Z",
        updatedAt: "2026-08-27T10:10:00.000Z",
        revokedAt: null,
        metadata: null,
      },
      {
        id: "grant-2",
        organizationId: "org-1",
        eventId: "event-1",
        enrollmentId: "enrollment-2",
        accessCode: "ACC-IJKL-MNOP",
        qrToken: "acc1_other",
        status: "revoked",
        issuedAt: "2026-08-27T11:10:00.000Z",
        updatedAt: "2026-08-27T11:40:00.000Z",
        revokedAt: "2026-08-27T11:40:00.000Z",
        metadata: null,
      },
    ],
    deliveryAttempts: [
      {
        id: "attempt-1",
        organizationId: "org-1",
        eventId: "event-1",
        enrollmentId: "enrollment-1",
        accessGrantId: "grant-1",
        operatorProfileId: "profile-1",
        recipient: "+59170000001",
        accessCode: "ACC-ABCD-EFGH",
        qrToken: "acc1_opaque",
        messageId: "message-1",
        attemptNumber: 1,
        deliveryStatus: "accepted",
        statusHistory: [],
        acceptedAt: "2026-08-27T10:20:00.000Z",
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        failureCode: null,
        failureMessage: null,
        failureDetails: null,
        templateName: "accreditation_invitation",
        templateLanguage: "es",
        mediaId: null,
        createdAt: "2026-08-27T10:20:00.000Z",
        updatedAt: "2026-08-27T10:20:00.000Z",
        deletedAt: null,
      },
      {
        id: "attempt-2",
        organizationId: "org-1",
        eventId: "event-1",
        enrollmentId: "enrollment-1",
        accessGrantId: "grant-1",
        operatorProfileId: "profile-1",
        recipient: "+59170000001",
        accessCode: "ACC-ABCD-EFGH",
        qrToken: "acc1_opaque",
        messageId: "message-2",
        attemptNumber: 2,
        deliveryStatus: "delivered",
        statusHistory: [],
        acceptedAt: "2026-08-27T10:30:00.000Z",
        sentAt: "2026-08-27T10:31:00.000Z",
        deliveredAt: "2026-08-27T10:32:00.000Z",
        readAt: null,
        failedAt: null,
        failureCode: null,
        failureMessage: null,
        failureDetails: null,
        templateName: "accreditation_invitation",
        templateLanguage: "es",
        mediaId: null,
        createdAt: "2026-08-27T10:30:00.000Z",
        updatedAt: "2026-08-27T10:32:00.000Z",
        deletedAt: null,
      },
      {
        id: "attempt-3",
        organizationId: "org-1",
        eventId: "event-1",
        enrollmentId: "enrollment-2",
        accessGrantId: "grant-2",
        operatorProfileId: "profile-1",
        recipient: "+59170000002",
        accessCode: "ACC-IJKL-MNOP",
        qrToken: "acc1_other",
        messageId: "message-3",
        attemptNumber: 1,
        deliveryStatus: "failed",
        statusHistory: [],
        acceptedAt: "2026-08-27T11:20:00.000Z",
        sentAt: "2026-08-27T11:21:00.000Z",
        deliveredAt: null,
        readAt: null,
        failedAt: "2026-08-27T11:22:00.000Z",
        failureCode: "500",
        failureMessage: "Meta rechazó el mensaje",
        failureDetails: null,
        templateName: "accreditation_invitation",
        templateLanguage: "es",
        mediaId: null,
        createdAt: "2026-08-27T11:20:00.000Z",
        updatedAt: "2026-08-27T11:22:00.000Z",
        deletedAt: null,
      },
    ],
    checkIns: [
      {
        id: "checkin-1",
        organizationId: "org-1",
        eventId: "event-1",
        enrollmentId: "enrollment-1",
        accessGrantId: "grant-1",
        operatorProfileId: "profile-1",
        source: "qr",
        checkedInAt: "2026-08-27T12:00:00.000Z",
        metadata: null,
        createdAt: "2026-08-27T12:00:00.000Z",
        updatedAt: "2026-08-27T12:00:00.000Z",
      },
    ],
    profiles: [
      { id: "profile-1", displayName: "Operador Principal" },
    ],
  } as never);

  assert.ok(model);
  assert.equal(model?.eventProfile.eventTypeLabel, "Conferencia");
  assert.equal(model?.summary.total, 2);
  assert.equal(model?.summary.active, 1);
  assert.equal(model?.summary.cancelled, 1);
  assert.equal(model?.summary.credentialActive, 1);
  assert.equal(model?.summary.credentialRevoked, 1);
  assert.equal(model?.summary.invited, 2);
  assert.equal(model?.summary.checkedIn, 1);

  const activeRow = model?.rows.find((row) => row.enrollmentId === "enrollment-1");
  const cancelledRow = model?.rows.find((row) => row.enrollmentId === "enrollment-2");

  assert.equal(activeRow?.profile.company, "OpenAI Bolivia");
  assert.equal(activeRow?.credentialState, "active");
  assert.equal(activeRow?.invitationState, "delivered");
  assert.equal(activeRow?.checkInState, "checked_in");
  assert.equal(cancelledRow?.status, "cancelled");
  assert.equal(cancelledRow?.credentialState, "revoked");
  assert.equal(cancelledRow?.invitationState, "failed");
  assert.equal(cancelledRow?.checkInState, "not_checked_in");
});

test("participant operational read model rejects unrelated event types", () => {
  assert.equal(
    buildAccreditationParticipantOperationalReadModel({
      event: {
        id: "event-9",
        name: "Boliche",
        eventType: "nightlife",
        operationalModel: "mixed",
        startAt: "2026-09-01T15:00:00.000Z",
        endAt: null,
        timezone: "America/La_Paz",
        venue: "Main room",
      },
      canEdit: false,
      canCancel: false,
      enrollments: [],
      categories: [],
      accessGrants: [],
      deliveryAttempts: [],
      checkIns: [],
      profiles: [],
    } as never),
    null,
  );
});
