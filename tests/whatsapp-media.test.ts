import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  buildWhatsAppCloudImageTemplateMessage,
  getWhatsAppImageTemplateConfig,
  uploadWhatsAppCloudMedia,
  validateWhatsAppMediaUpload,
  WhatsAppCloudError,
} from "../features/access/domain/whatsapp-cloud";

function buildProcessEnv(values: Record<string, string>) {
  return {
    NODE_ENV: "test",
    ...values,
  } as unknown as NodeJS.ProcessEnv;
}

function sha256(buffer: Uint8Array) {
  return crypto.createHash("sha256").update(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)).digest("hex");
}

test("WhatsApp image template config reads server env when configured", () => {
  const config = getWhatsAppImageTemplateConfig(
    buildProcessEnv({
      WHATSAPP_IMAGE_TEMPLATE_NAME: "entryflow_invitation_image_v1",
      WHATSAPP_IMAGE_TEMPLATE_LANGUAGE: "es_MX",
    }),
  );

  assert.deepEqual(config, {
    templateName: "entryflow_invitation_image_v1",
    templateLanguage: "es_MX",
  });
});

test("WhatsApp image template payload uses an image header and two body params", () => {
  const { payload } = buildWhatsAppCloudImageTemplateMessage(
    {
      recipient: "+591 70000097",
      guestName: "Carlos",
      eventName: "La Rota Carlota",
      mediaId: " media-123 ",
    },
    {
      templateName: "entryflow_invitation_image_v1",
      templateLanguage: "es_MX",
    },
  );

  assert.equal(payload.type, "template");
  assert.equal(payload.template?.name, "entryflow_invitation_image_v1");
  assert.equal(payload.template?.language.code, "es_MX");
  assert.equal(payload.template?.components.length, 2);
  assert.equal(payload.template?.components[0]?.type, "header");
  assert.equal(payload.template?.components[0]?.parameters[0]?.type, "image");
  assert.equal(payload.template?.components[0]?.parameters[0]?.image.id, "media-123");
  assert.equal(payload.template?.components[1]?.type, "body");
  assert.deepEqual(payload.template?.components[1]?.parameters, [
    { type: "text", text: "Carlos" },
    { type: "text", text: "La Rota Carlota" },
  ]);
  assert.equal("accessCode" in (payload.template?.components[1]?.parameters[0] ?? {}), false);
});

test("WhatsApp media validation rejects invalid MIME and oversized files", () => {
  assert.deepEqual(validateWhatsAppMediaUpload({ mimeType: "image/png", size: 1024 }), { ok: true });
  assert.deepEqual(validateWhatsAppMediaUpload({ mimeType: "image/jpeg", size: 1024 }), { ok: true });
  assert.deepEqual(validateWhatsAppMediaUpload({ mimeType: "image/webp", size: 1024 }), {
    ok: false,
    message: "Usá una imagen JPG o PNG.",
  });
  assert.deepEqual(validateWhatsAppMediaUpload({ mimeType: "image/png", size: 5 * 1024 * 1024 + 1 }), {
    ok: false,
    message: "La imagen debe pesar menos de 5 MB.",
  });
});

test("WhatsApp media upload creates multipart form-data and extracts the media id", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(input), init]);
    return new Response(JSON.stringify({ id: "media-123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await uploadWhatsAppCloudMedia(
    {
      file: new Blob(["png"], { type: "image/png" }),
      fileName: "invitation.png",
    },
    fetchImpl,
    buildProcessEnv({
      WHATSAPP_ACCESS_TOKEN: "super-secret",
      WHATSAPP_PHONE_NUMBER_ID: "987654321",
      WHATSAPP_API_VERSION: "v23.0",
    }),
  );

  assert.equal(result.mediaId, "media-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "https://graph.facebook.com/v23.0/987654321/media");

  const body = calls[0]?.[1]?.body as FormData;
  assert.equal((calls[0]?.[1]?.headers as Record<string, string>).Authorization, "Bearer super-secret");
  assert.equal(body.get("messaging_product"), "whatsapp");

  const file = body.get("file");
  assert.ok(file instanceof File);
  assert.equal((file as File).name, "invitation.png");
  assert.equal((file as File).type, "image/png");
});

test("WhatsApp media upload preserves the file bytes through multipart round-trip", async () => {
  const sourceBytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252]);
  const sourceBlob = new Blob([sourceBytes], { type: "image/png" });
  const sourceHash = sha256(sourceBytes);

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", new File([sourceBlob], "invitation.png", { type: sourceBlob.type }));

  const request = new Request("http://localhost/api/whatsapp/media", {
    method: "POST",
    body: formData,
  });
  const receivedFormData = await request.formData();
  const receivedFile = receivedFormData.get("file");

  assert.ok(receivedFile instanceof File);
  assert.equal(receivedFile.type, "image/png");
  assert.equal(receivedFile.name, "invitation.png");
  assert.equal(receivedFile.size, sourceBlob.size);
  assert.equal(sha256(new Uint8Array(await receivedFile.arrayBuffer())), sourceHash);
});

test("WhatsApp media upload sanitizes provider errors", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "Upload failed", code: 400 } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    () =>
      uploadWhatsAppCloudMedia(
        {
          file: new Blob(["png"], { type: "image/png" }),
          fileName: "invitation.png",
        },
        fetchImpl,
        buildProcessEnv({
          WHATSAPP_ACCESS_TOKEN: "super-secret",
          WHATSAPP_PHONE_NUMBER_ID: "987654321",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WhatsAppCloudError);
      assert.equal((error as WhatsAppCloudError).status, 400);
      assert.equal((error as WhatsAppCloudError).code, "whatsapp_media_upload_failed");
      assert.equal((error as WhatsAppCloudError).safeMessage, "Upload failed");
      return true;
    },
  );
});

test("WhatsApp media upload sanitizes provider 5xx errors", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "Server exploded", code: 500 } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    () =>
      uploadWhatsAppCloudMedia(
        {
          file: new Blob(["png"], { type: "image/png" }),
          fileName: "invitation.png",
        },
        fetchImpl,
        buildProcessEnv({
          WHATSAPP_ACCESS_TOKEN: "super-secret",
          WHATSAPP_PHONE_NUMBER_ID: "987654321",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WhatsAppCloudError);
      assert.equal((error as WhatsAppCloudError).status, 500);
      assert.equal((error as WhatsAppCloudError).code, "whatsapp_media_upload_failed");
      assert.equal((error as WhatsAppCloudError).safeMessage, "Server exploded");
      return true;
    },
  );
});

test("WhatsApp media upload rejects missing media ids", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    () =>
      uploadWhatsAppCloudMedia(
        {
          file: new Blob(["png"], { type: "image/png" }),
          fileName: "invitation.png",
        },
        fetchImpl,
        buildProcessEnv({
          WHATSAPP_ACCESS_TOKEN: "super-secret",
          WHATSAPP_PHONE_NUMBER_ID: "987654321",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WhatsAppCloudError);
      assert.equal((error as WhatsAppCloudError).status, 502);
      assert.equal((error as WhatsAppCloudError).code, "whatsapp_media_missing_id");
      return true;
    },
  );
});
