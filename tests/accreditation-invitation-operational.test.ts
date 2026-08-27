import assert from "node:assert/strict";
import test from "node:test";

import { buildAccreditationInvitationOperationalReadModel } from "../features/accreditation/invitations/domain/accreditation-invitation-operational";

function makeEnrollment(overrides: Partial<{
  id: string;
  name: string;
  phone: string | undefined;
  status: "active" | "cancelled";
  categoryId: string | undefined;
  sectorId: string | undefined;
}> = {}) {
  return {
    id: overrides.id ?? "enrollment-1",
    organizationId: "org-1",
    eventId: "event-1",
    name: overrides.name ?? "Invitado 1",
    email: "guest@example.com",
    phone: overrides.phone ?? "+591 70000001",
    categoryId: overrides.categoryId,
    sectorId: overrides.sectorId,
    status: overrides.status ?? "active",
    metadata: {},
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    deletedAt: null,
  };
}

function makeGrant(overrides: Partial<{ enrollmentId: string; status: "active" | "revoked" }> = {}) {
  return {
    id: `grant-${overrides.enrollmentId ?? "1"}`,
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: overrides.enrollmentId ?? "enrollment-1",
    accessCode: `ACC-${overrides.enrollmentId ?? "1"}`,
    qrToken: `acc1_${overrides.enrollmentId ?? "1"}`,
    status: overrides.status ?? "active",
    issuedAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    revokedAt: overrides.status === "revoked" ? "2026-08-26T11:00:00.000Z" : null,
    metadata: {},
  };
}

function makeAttempt(overrides: Partial<{
  enrollmentId: string;
  attemptNumber: number;
  status: "accepted" | "sent" | "delivered" | "read" | "failed";
  updatedAt: string;
}> = {}) {
  const status = overrides.status ?? "accepted";
  return {
    id: `attempt-${overrides.enrollmentId ?? "1"}-${overrides.attemptNumber ?? 1}`,
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: overrides.enrollmentId ?? "enrollment-1",
    accessGrantId: `grant-${overrides.enrollmentId ?? "1"}`,
    operatorProfileId: "profile-1",
    recipient: "59170000001",
    accessCode: `ACC-${overrides.enrollmentId ?? "1"}`,
    qrToken: `acc1_${overrides.enrollmentId ?? "1"}`,
    messageId: `wamid.${overrides.enrollmentId ?? "1"}.${overrides.attemptNumber ?? 1}`,
    attemptNumber: overrides.attemptNumber ?? 1,
    deliveryStatus: status,
    statusHistory: [
      {
        status,
        timestamp: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z",
        detail: status === "accepted" ? "Meta aceptó la solicitud de envío." : undefined,
      },
    ],
    ...(status === "accepted" ? { acceptedAt: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z" } : {}),
    ...(status === "sent" ? { sentAt: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z" } : {}),
    ...(status === "delivered" ? { deliveredAt: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z" } : {}),
    ...(status === "read" ? { readAt: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z" } : {}),
    ...(status === "failed" ? { failedAt: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z" } : {}),
    ...(status === "failed" ? { failureCode: "provider_error" } : {}),
    ...(status === "failed" ? { failureMessage: "Proveedor rechazó el envío." } : {}),
    ...(status === "failed" ? { failureDetails: { reason: "provider_error" } } : {}),
    templateName: "accreditation_invitation",
    templateLanguage: "es_MX",
    createdAt: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-26T12:00:00.000Z",
    deletedAt: null,
  };
}

test("accreditation operational read model resolves delivery states, history, and eligibility", () => {
  const model = buildAccreditationInvitationOperationalReadModel({
    eventName: "Evento",
    venueName: "Venue",
    canIssueAccess: true,
    categories: [
      { id: "cat-1", organizationId: "org-1", eventId: "event-1", slug: "vip", name: "VIP", sortOrder: 1, isActive: true, createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
    ],
    sectors: [{ id: "sector-1", name: "Sala Norte" }],
    profiles: [{ id: "profile-1", displayName: "Operador EntryFlow" }],
    enrollments: [
      makeEnrollment({ id: "enrollment-1", name: "Ana", categoryId: "cat-1", sectorId: "sector-1" }),
      makeEnrollment({ id: "enrollment-2", name: "Bruno" }),
      makeEnrollment({ id: "enrollment-3", name: "Carla", phone: undefined, status: "cancelled" }),
      makeEnrollment({ id: "enrollment-4", name: "Diego", phone: "abc" }),
      makeEnrollment({ id: "enrollment-5", name: "Elena", phone: "" }),
    ],
    accessGrants: [
      makeGrant({ enrollmentId: "enrollment-1", status: "active" }),
      makeGrant({ enrollmentId: "enrollment-2", status: "revoked" }),
      makeGrant({ enrollmentId: "enrollment-3", status: "active" }),
      makeGrant({ enrollmentId: "enrollment-4", status: "active" }),
      makeGrant({ enrollmentId: "enrollment-5", status: "active" }),
    ],
    deliveryAttempts: [
      makeAttempt({ enrollmentId: "enrollment-1", attemptNumber: 1, status: "accepted", updatedAt: "2026-08-26T12:00:00.000Z" }),
      makeAttempt({ enrollmentId: "enrollment-1", attemptNumber: 2, status: "sent", updatedAt: "2026-08-26T12:10:00.000Z" }),
      makeAttempt({ enrollmentId: "enrollment-2", attemptNumber: 1, status: "failed", updatedAt: "2026-08-26T12:05:00.000Z" }),
    ],
  });

  assert.equal(model.summary.total, 5);
  assert.equal(model.summary.sendable, 1);
  assert.equal(model.summary.accepted, 0);
  assert.equal(model.summary.sent, 1);
  assert.equal(model.summary.failed, 1);
  assert.equal(model.summary.revoked, 1);
  assert.equal(model.rows[0].latestDeliveryState, "sent");
  assert.equal(model.rows[0].latestDeliveryLabel, "Enviada");
  assert.equal(model.rows[0].history[0].attemptNumber, 2);
  assert.equal(model.rows[0].history[1].attemptNumber, 1);
  assert.equal(model.rows[0].history[0].operatorDisplayName, "Operador EntryFlow");
  assert.equal(model.rows[0].canSend, true);

  const cancelled = model.rows.find((row) => row.enrollmentId === "enrollment-3");
  assert.ok(cancelled);
  assert.equal(cancelled?.canSend, false);
  assert.equal(cancelled?.sendDisabledReason, "Acreditación cancelada");

  const revoked = model.rows.find((row) => row.enrollmentId === "enrollment-2");
  assert.ok(revoked);
  assert.equal(revoked?.sendDisabledReason, "Acceso revocado");
  assert.equal(revoked?.latestDeliveryState, "failed");
  assert.equal(revoked?.latestDeliveryLabel, "Falló");
  assert.equal(revoked?.history[0].errorSummary, "Proveedor rechazó el envío.");

  const invalidPhone = model.rows.find((row) => row.enrollmentId === "enrollment-4");
  assert.ok(invalidPhone);
  assert.equal(invalidPhone?.sendDisabledReason, "Teléfono inválido");

  const missingPhone = model.rows.find((row) => row.enrollmentId === "enrollment-5");
  assert.ok(missingPhone);
  assert.equal(missingPhone?.sendDisabledReason, "Sin teléfono");
});

test("accreditation operational read model fails closed when access.issue is missing", () => {
  const model = buildAccreditationInvitationOperationalReadModel({
    eventName: "Evento",
    canIssueAccess: false,
    categories: [],
    sectors: [],
    profiles: [],
    enrollments: [makeEnrollment()],
    accessGrants: [makeGrant()],
    deliveryAttempts: [],
  });

  assert.equal(model.rows[0].canSend, false);
  assert.equal(model.rows[0].sendDisabledReason, "Sin permiso para enviar");
});

test("accepted state remains distinct from delivered", () => {
  const acceptedModel = buildAccreditationInvitationOperationalReadModel({
    eventName: "Evento",
    canIssueAccess: true,
    categories: [],
    sectors: [],
    profiles: [],
    enrollments: [makeEnrollment({ id: "enrollment-1" })],
    accessGrants: [makeGrant({ enrollmentId: "enrollment-1" })],
    deliveryAttempts: [makeAttempt({ enrollmentId: "enrollment-1", attemptNumber: 1, status: "accepted" })],
  });

  const deliveredModel = buildAccreditationInvitationOperationalReadModel({
    eventName: "Evento",
    canIssueAccess: true,
    categories: [],
    sectors: [],
    profiles: [],
    enrollments: [makeEnrollment({ id: "enrollment-2" })],
    accessGrants: [makeGrant({ enrollmentId: "enrollment-2" })],
    deliveryAttempts: [makeAttempt({ enrollmentId: "enrollment-2", attemptNumber: 1, status: "delivered" })],
  });

  assert.equal(acceptedModel.rows[0].latestDeliveryLabel, "Aceptada por WhatsApp");
  assert.equal(deliveredModel.rows[0].latestDeliveryLabel, "Entregada");
});
