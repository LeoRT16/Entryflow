import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_INVITATION_ARTWORK_MIME_TYPES,
  buildInvitationArtworkLabel,
  buildInvitationArtworkStoragePath,
  isValidInvitationArtworkDimensions,
  getEventInvitationArtwork,
  mergeEventInvitationArtworkMetadata,
  validateInvitationArtworkUpload,
} from "../features/events/domain/invitation-artwork";

test("getEventInvitationArtwork reads nested and legacy invitation artwork metadata", () => {
  const nested = getEventInvitationArtwork({
    metadata: {
      invitationArtwork: {
        url: "https://cdn.example.com/invitation.png",
        path: "organizations/org-1/events/event-1/invitation-artwork/file.png",
        fileName: "Invitation.png",
        mimeType: "image/png",
        width: 1080,
        height: 1920,
        size: 12345,
        label: "Arte principal",
        updatedAt: "2026-08-17T15:33:19.003Z",
      },
    },
  });

  assert.deepEqual(nested, {
    url: "https://cdn.example.com/invitation.png",
    path: "organizations/org-1/events/event-1/invitation-artwork/file.png",
    fileName: "Invitation.png",
    mimeType: "image/png",
    width: 1080,
    height: 1920,
    size: 12345,
    label: "Arte principal",
    updatedAt: "2026-08-17T15:33:19.003Z",
  });

  const legacy = getEventInvitationArtwork({
    invitationArtworkUrl: "https://cdn.example.com/legacy.png",
    invitationArtworkPath: "organizations/org-1/events/event-1/invitation-artwork/legacy.png",
    invitationArtworkFileName: "legacy.png",
    invitationArtworkMimeType: "image/webp",
    invitationArtworkWidth: 1080,
    invitationArtworkHeight: 1920,
    invitationArtworkSize: 9999,
    invitationArtworkLabel: "Legacy",
    invitationArtworkUpdatedAt: "2026-08-17T15:33:19.003Z",
  });

  assert.deepEqual(legacy, {
    url: "https://cdn.example.com/legacy.png",
    path: "organizations/org-1/events/event-1/invitation-artwork/legacy.png",
    fileName: "legacy.png",
    mimeType: "image/webp",
    width: 1080,
    height: 1920,
    size: 9999,
    label: "Legacy",
    updatedAt: "2026-08-17T15:33:19.003Z",
  });
});

test("mergeEventInvitationArtworkMetadata keeps only the canonical invitationArtwork object", () => {
  const metadata = mergeEventInvitationArtworkMetadata(
    {
      invitationArtworkUrl: "https://cdn.example.com/legacy.png",
      other: "value",
    },
    {
      url: "https://cdn.example.com/current.png",
      path: "organizations/org-1/events/event-1/invitation-artwork/current.png",
      fileName: "current.png",
      mimeType: "image/png",
      width: 1080,
      height: 1920,
      size: 12345,
      updatedAt: "2026-08-17T15:33:19.003Z",
    },
  );

  assert.deepEqual(metadata, {
    other: "value",
    invitationArtwork: {
      url: "https://cdn.example.com/current.png",
      path: "organizations/org-1/events/event-1/invitation-artwork/current.png",
      fileName: "current.png",
      mimeType: "image/png",
      width: 1080,
      height: 1920,
      size: 12345,
      updatedAt: "2026-08-17T15:33:19.003Z",
    },
  });

  assert.equal(
    mergeEventInvitationArtworkMetadata(
      {
        invitationArtwork: {
          url: "https://cdn.example.com/current.png",
        },
      },
      null,
    ),
    undefined,
  );
});

test("buildInvitationArtworkStoragePath and label helpers produce readable output", () => {
  const path = buildInvitationArtworkStoragePath({
    organizationId: "Org 1",
    eventId: "Event 1",
    fileName: "Mi Invitación Final.PNG",
    mimeType: "image/png",
  });

  assert.ok(path.startsWith("organizations/org-1/events/event-1/invitation-artwork/"));
  assert.ok(path.endsWith(".png"));
  assert.equal(buildInvitationArtworkLabel("Mi Invitación Final.PNG", "Evento de Agosto"), "Mi Invitación Final");
  assert.equal(buildInvitationArtworkLabel("", "Evento de Agosto"), "Evento de Agosto");
});

test("validateInvitationArtworkUpload accepts vertical artwork above the minimum and rejects invalid inputs", () => {
  assert.equal(isValidInvitationArtworkDimensions(720, 1280), true);
  assert.equal(isValidInvitationArtworkDimensions(1080, 1920), true);
  assert.equal(isValidInvitationArtworkDimensions(1440, 2560), true);
  assert.equal(isValidInvitationArtworkDimensions(720, 1279), false);
  assert.equal(isValidInvitationArtworkDimensions(719, 1280), false);
  assert.equal(isValidInvitationArtworkDimensions(1280, 1280), false);
  assert.equal(isValidInvitationArtworkDimensions(1920, 1080), false);

  assert.deepEqual(validateInvitationArtworkUpload({ width: 720, height: 1280, mimeType: "image/png", size: 1024 }), {
    ok: true,
  });
  assert.deepEqual(validateInvitationArtworkUpload({ width: 1080, height: 1920, mimeType: "image/jpeg", size: 1024 }), {
    ok: true,
  });
  assert.deepEqual(validateInvitationArtworkUpload({ width: 1440, height: 2560, mimeType: "image/webp", size: 1024 }), {
    ok: true,
  });
  assert.deepEqual(validateInvitationArtworkUpload({ width: 720, height: 1279, mimeType: "image/png", size: 1024 }), {
    ok: false,
    message: "La imagen debe ser vertical y tener al menos 720 × 1280 px. Recomendado: 1080 × 1920 px.",
  });
  assert.deepEqual(validateInvitationArtworkUpload({ width: 719, height: 1280, mimeType: "image/png", size: 1024 }), {
    ok: false,
    message: "La imagen debe ser vertical y tener al menos 720 × 1280 px. Recomendado: 1080 × 1920 px.",
  });
  assert.deepEqual(validateInvitationArtworkUpload({ width: 1920, height: 1080, mimeType: "image/png", size: 1024 }), {
    ok: false,
    message: "La imagen debe ser vertical y tener al menos 720 × 1280 px. Recomendado: 1080 × 1920 px.",
  });
  assert.deepEqual(validateInvitationArtworkUpload({ width: 1080, height: 1920, mimeType: "image/gif", size: 1024 }), {
    ok: false,
    message: "Usá una imagen JPG, PNG o WEBP.",
  });
  assert.deepEqual(validateInvitationArtworkUpload({ width: 1080, height: 1920, mimeType: "image/png", size: 8 * 1024 * 1024 + 1 }), {
    ok: false,
    message: "La pieza de invitación debe pesar menos de 8 MB.",
  });

  assert.equal(EVENT_INVITATION_ARTWORK_MIME_TYPES.has("image/png"), true);
  assert.equal(EVENT_INVITATION_ARTWORK_MIME_TYPES.has("image/gif"), false);
});
