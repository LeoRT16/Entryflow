import assert from "node:assert/strict";
import test from "node:test";

import { buildAccreditationWhatsAppDeliveryAttempt, resolveAccreditationInvitationSendContext } from "../features/accreditation/invitations";
import {
  buildAccreditationWhatsAppEnv,
  getRequiredAccreditationWhatsAppImageTemplateConfig,
  getRequiredAccreditationWhatsAppTemplateConfig,
} from "../features/accreditation/invitations";
import { normalizeAccreditationInvitationPhone, resolveAccreditationInvitationEligibility } from "../features/accreditation/invitations";

test("accreditation invitation phone normalization accepts Bolivia formats and rejects invalid ones", () => {
  assert.equal(normalizeAccreditationInvitationPhone("+591 70000097"), "59170000097");
  assert.equal(normalizeAccreditationInvitationPhone("70000097"), "59170000097");
  assert.equal(normalizeAccreditationInvitationPhone(""), null);
  assert.equal(normalizeAccreditationInvitationPhone("+1 555 000 0000"), null);
});

test("accreditation invitation eligibility blocks cancelled enrollments and revoked grants without touching the grant code", () => {
  const cancelled = resolveAccreditationInvitationEligibility({
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-1",
      eventId: "event-1",
      name: "Leonardo",
      phone: "+59170000097",
      status: "cancelled",
    },
    accessGrant: {
      id: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      accessCode: "ACC-7K4D-9M2Q",
      qrToken: "acc1_1234567890abcdef1234567890abcdef",
      status: "active",
    },
    eventName: "Evento E2E",
  });

  const revoked = resolveAccreditationInvitationEligibility({
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-1",
      eventId: "event-1",
      name: "Leonardo",
      phone: "70000097",
      status: "active",
    },
    accessGrant: {
      id: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      accessCode: "ACC-7K4D-9M2Q",
      qrToken: "acc1_1234567890abcdef1234567890abcdef",
      status: "revoked",
    },
    eventName: "Evento E2E",
  });

  assert.equal(cancelled.canSend, false);
  assert.equal(cancelled.reason, "enrollment_cancelled");
  assert.equal(cancelled.recipient, "59170000097");
  assert.equal(revoked.canSend, false);
  assert.equal(revoked.reason, "grant_revoked");
  assert.equal(revoked.recipient, "59170000097");
});

test("accreditation delivery attempts preserve accessCode and qrToken on the recorded row", () => {
  const attempt = buildAccreditationWhatsAppDeliveryAttempt({
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: "enrollment-1",
    accessGrantId: "grant-1",
    operatorProfileId: "profile-1",
    recipient: "59170000097",
    accessCode: "ACC-7K4D-9M2Q",
    qrToken: "acc1_1234567890abcdef1234567890abcdef",
    messageId: "wamid.mock-1",
    attemptNumber: 2,
    templateName: "accreditation_invitation",
    templateLanguage: "es_MX",
    mediaId: "media-1",
    createdAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
  });

  assert.equal(attempt.deliveryStatus, "accepted");
  assert.equal(attempt.accessCode, "ACC-7K4D-9M2Q");
  assert.equal(attempt.qrToken, "acc1_1234567890abcdef1234567890abcdef");
  assert.equal(attempt.statusHistory[0]?.status, "accepted");
  assert.equal(attempt.statusHistory[0]?.detail, "Meta aceptó la solicitud de envío.");
  assert.equal(attempt.mediaId, "media-1");
});

test("accreditation WhatsApp env helpers read separate template variables", () => {
  const env = {
    WHATSAPP_ACCREDITATION_TEMPLATE_NAME: "accreditation_invitation",
    WHATSAPP_ACCREDITATION_TEMPLATE_LANGUAGE: "es_MX",
    WHATSAPP_ACCREDITATION_IMAGE_TEMPLATE_NAME: "accreditation_invitation_image",
    WHATSAPP_ACCREDITATION_IMAGE_TEMPLATE_LANGUAGE: "es_MX",
  } as unknown as NodeJS.ProcessEnv;

  assert.deepEqual(getRequiredAccreditationWhatsAppTemplateConfig(env), {
    templateName: "accreditation_invitation",
    templateLanguage: "es_MX",
  });
  assert.deepEqual(getRequiredAccreditationWhatsAppImageTemplateConfig(env), {
    templateName: "accreditation_invitation_image",
    templateLanguage: "es_MX",
  });

  const merged = buildAccreditationWhatsAppEnv({ mediaId: true, env });

  assert.equal(merged.WHATSAPP_TEMPLATE_NAME, "accreditation_invitation");
  assert.equal(merged.WHATSAPP_TEMPLATE_LANGUAGE, "es_MX");
  assert.equal(merged.WHATSAPP_IMAGE_TEMPLATE_NAME, "accreditation_invitation_image");
  assert.equal(merged.WHATSAPP_IMAGE_TEMPLATE_LANGUAGE, "es_MX");
});

test("accreditation invitation context keeps send-ready state explicit", () => {
  const result = resolveAccreditationInvitationSendContext({
    enrollment: {
      id: "enrollment-1",
      organizationId: "org-1",
      eventId: "event-1",
      name: "Leonardo",
      phone: "70000097",
      status: "active",
    },
    accessGrant: {
      id: "grant-1",
      organizationId: "org-1",
      eventId: "event-1",
      accessCode: "ACC-7K4D-9M2Q",
      qrToken: "acc1_1234567890abcdef1234567890abcdef",
      status: "active",
    },
    eventName: "Evento E2E",
  });

  assert.equal(result.eligibility.canSend, true);
  assert.equal(result.eligibility.recipient, "59170000097");
});
