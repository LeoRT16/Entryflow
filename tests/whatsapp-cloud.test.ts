import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/whatsapp/send/route";
import {
  buildWhatsAppCloudMessage,
  buildWhatsAppCloudMessagesUrl,
  buildWhatsAppCloudRequestInit,
  getWhatsAppCloudConfig,
  getRequiredWhatsAppTemplateConfig,
  sendWhatsAppCloudMessage,
  WhatsAppCloudError,
} from "../features/access/domain/whatsapp-cloud";

function buildProcessEnv(values: Record<string, string>) {
  return {
    NODE_ENV: "test",
    ...values,
  } as unknown as NodeJS.ProcessEnv;
}

test("WhatsApp Cloud configuration reads server env and falls back to a version", () => {
  const config = getWhatsAppCloudConfig(
    buildProcessEnv({
      WHATSAPP_ACCESS_TOKEN: "secret-token",
      WHATSAPP_PHONE_NUMBER_ID: "123456789",
      WHATSAPP_API_VERSION: "",
    }),
  );

  assert.deepEqual(config, {
    accessToken: "secret-token",
    phoneNumberId: "123456789",
    apiVersion: "v23.0",
  });
});

test("WhatsApp Cloud configuration reads template env when configured", () => {
  const config = getWhatsAppCloudConfig(
    buildProcessEnv({
      WHATSAPP_ACCESS_TOKEN: "secret-token",
      WHATSAPP_PHONE_NUMBER_ID: "123456789",
      WHATSAPP_TEMPLATE_NAME: "entryflow_invitation",
      WHATSAPP_TEMPLATE_LANGUAGE: "es_MX",
    }),
  );

  assert.deepEqual(config, {
    accessToken: "secret-token",
    phoneNumberId: "123456789",
    apiVersion: "v23.0",
    templateName: "entryflow_invitation",
    templateLanguage: "es_MX",
  });
});

test("WhatsApp Cloud approved template config fails clearly when missing", () => {
  assert.throws(
    () =>
      getRequiredWhatsAppTemplateConfig(
        buildProcessEnv({
          WHATSAPP_ACCESS_TOKEN: "secret-token",
          WHATSAPP_PHONE_NUMBER_ID: "123456789",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WhatsAppCloudError);
      assert.equal((error as WhatsAppCloudError).status, 503);
      assert.equal((error as WhatsAppCloudError).code, "whatsapp_template_not_configured");
      assert.equal((error as WhatsAppCloudError).safeMessage, "La plantilla aprobada de WhatsApp no está disponible.");
      return true;
    },
  );
});

test("WhatsApp Cloud approved template config is returned when configured", () => {
  const config = getRequiredWhatsAppTemplateConfig(
    buildProcessEnv({
      WHATSAPP_ACCESS_TOKEN: "secret-token",
      WHATSAPP_PHONE_NUMBER_ID: "123456789",
      WHATSAPP_TEMPLATE_NAME: "entryflow_invitation",
      WHATSAPP_TEMPLATE_LANGUAGE: "es_MX",
    }),
  );

  assert.deepEqual(config, {
    templateName: "entryflow_invitation",
    templateLanguage: "es_MX",
  });
});

test("WhatsApp Cloud payload normalizes Bolivia numbers and builds a text message", () => {
  const { payload } = buildWhatsAppCloudMessage({
    recipient: "+591 7737 4577",
    guestName: "WhatsApp Delivery E2E",
    eventName: "EntryFlow Summit",
    accessCode: "RES-WA-001",
  });

  assert.equal(payload.to, "59177374577");
  assert.equal(payload.messaging_product, "whatsapp");
  assert.equal(payload.recipient_type, "individual");
  assert.equal(payload.type, "text");
  assert.equal(payload.text.preview_url, false);
  assert.equal(
    payload.text.body,
    "Hola WhatsApp Delivery E2E, tienes una invitación para EntryFlow Summit.\nCódigo de invitación: RES-WA-001.\nTe esperamos.",
  );
});

test("WhatsApp Cloud payload switches to a template when one is configured", () => {
  const { payload } = buildWhatsAppCloudMessage(
    {
      recipient: "+591 7737 4577",
      guestName: "WhatsApp Delivery E2E",
      eventName: "EntryFlow Summit",
      accessCode: "RES-WA-001",
    },
    {
      templateName: "entryflow_invitation",
      templateLanguage: "es_MX",
    },
  );

  assert.equal(payload.type, "template");
  assert.equal(payload.template?.name, "entryflow_invitation");
  assert.equal(payload.template?.language.code, "es_MX");
  assert.equal(payload.template?.components.length, 1);
  assert.equal(payload.template?.components[0]?.type, "body");
  assert.deepEqual(Object.keys(payload.template ?? {}).sort(), ["components", "language", "name"]);
  assert.equal(payload.template?.components[0]?.parameters.length, 2);
  assert.deepEqual(payload.template?.components[0]?.parameters, [
    { type: "text", text: "WhatsApp Delivery E2E" },
    { type: "text", text: "EntryFlow Summit" },
  ]);
  assert.equal("text" in payload, false);
});

test("WhatsApp Cloud request init uses the server token and JSON body", () => {
  const config = {
    accessToken: "super-secret",
    phoneNumberId: "987654321",
    apiVersion: "v23.0",
  };
  const payload = buildWhatsAppCloudMessage({
    recipient: "77374577",
    guestName: "Guest",
    eventName: "Event",
    accessCode: "RES-001",
  }).payload;
  const init = buildWhatsAppCloudRequestInit(config, payload);

  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer super-secret");
  assert.equal((init.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body as string), payload);
  assert.equal(buildWhatsAppCloudMessagesUrl(config), "https://graph.facebook.com/v23.0/987654321/messages");
});

test("WhatsApp Cloud request init preserves template payloads when configured", () => {
  const config = {
    accessToken: "super-secret",
    phoneNumberId: "987654321",
    apiVersion: "v23.0",
    templateName: "entryflow_invitation",
    templateLanguage: "es_MX",
  };
  const payload = buildWhatsAppCloudMessage(
    {
      recipient: "77374577",
      guestName: "Guest",
      eventName: "Event",
      accessCode: "RES-001",
    },
    config,
  ).payload;
  const init = buildWhatsAppCloudRequestInit(config, payload);

  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer super-secret");
  assert.deepEqual(JSON.parse(init.body as string), payload);
  assert.equal(payload.type, "template");
});

test("WhatsApp Cloud send succeeds with a provider message id and never exposes secrets", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(input), init]);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.mock-1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await sendWhatsAppCloudMessage(
    {
      recipient: "77374577",
      guestName: "Guest",
      eventName: "Event",
      accessCode: "RES-001",
    },
    fetchImpl,
    buildProcessEnv({
      WHATSAPP_ACCESS_TOKEN: "super-secret",
      WHATSAPP_PHONE_NUMBER_ID: "987654321",
      WHATSAPP_API_VERSION: "v23.0",
    }),
  );

  assert.equal(result.messageId, "wamid.mock-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "https://graph.facebook.com/v23.0/987654321/messages");
  assert.equal((calls[0]?.[1]?.headers as Record<string, string>).Authorization, "Bearer super-secret");
  assert.equal(JSON.parse(calls[0]?.[1]?.body as string).to, "59177374577");
  assert.equal(JSON.parse(calls[0]?.[1]?.body as string).type, "text");
  assert.equal(JSON.parse(calls[0]?.[1]?.body as string).text.preview_url, false);
});

test("WhatsApp Cloud send rejects invalid numbers before calling Meta", async () => {
  let fetchCalled = false;

  await assert.rejects(
    () =>
      sendWhatsAppCloudMessage(
        {
          recipient: "abc",
          guestName: "Guest",
          eventName: "Event",
          accessCode: "RES-001",
        },
        async () => {
          fetchCalled = true;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
        buildProcessEnv({
          WHATSAPP_ACCESS_TOKEN: "super-secret",
          WHATSAPP_PHONE_NUMBER_ID: "987654321",
        }),
      ),
    WhatsAppCloudError,
  );

  assert.equal(fetchCalled, false);
});

test("WhatsApp Cloud send sanitizes provider errors", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "Template not found", code: 132000 } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    () =>
      sendWhatsAppCloudMessage(
        {
          recipient: "77374577",
          guestName: "Guest",
          eventName: "Event",
          accessCode: "RES-001",
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
      assert.equal((error as WhatsAppCloudError).code, "whatsapp_cloud_send_failed");
      assert.equal((error as WhatsAppCloudError).safeMessage, "Template not found");
      assert.equal((error as Error).message.includes("super-secret"), false);
      return true;
    },
  );
});

test("WhatsApp Cloud send logs Meta error details without leaking secrets", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Authentication failed",
          type: "OAuthException",
          code: 401,
          error_subcode: 123456,
          fbtrace_id: "FBTRACE-abc-123",
        },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );

  const originalConsoleError = console.error;
  const consoleCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    consoleCalls.push(args);
  };

  try {
    await assert.rejects(
      () =>
        sendWhatsAppCloudMessage(
          {
            recipient: "77374577",
            guestName: "Guest",
            eventName: "Event",
            accessCode: "RES-001",
          },
          fetchImpl,
          buildProcessEnv({
            WHATSAPP_ACCESS_TOKEN: "super-secret",
            WHATSAPP_PHONE_NUMBER_ID: "987654321",
          }),
        ),
      WhatsAppCloudError,
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(consoleCalls.length, 1);
  assert.equal(consoleCalls[0]?.[0], "Meta WhatsApp Cloud API error");
  assert.deepEqual(consoleCalls[0]?.[1], {
    httpStatus: 401,
    error: {
      message: "Authentication failed",
      type: "OAuthException",
      code: 401,
      error_subcode: 123456,
      fbtrace_id: "FBTRACE-abc-123",
    },
  });
  assert.equal(JSON.stringify(consoleCalls).includes("super-secret"), false);
  assert.equal(JSON.stringify(consoleCalls).includes("Authorization"), false);
});

test("WhatsApp Cloud route validates request data before attempting to send", async () => {
  const invalidJsonResponse = await POST(new Request("http://localhost/api/whatsapp/send", { method: "POST" }));
  const invalidJsonBody = await invalidJsonResponse.json();

  assert.equal(invalidJsonResponse.status, 400);
  assert.equal(invalidJsonBody.error.code, "invalid_request");

  const missingFieldResponse = await POST(
    new Request("http://localhost/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: "77374577",
        guestName: "Guest",
        eventName: "Event",
      }),
    }),
  );
  const missingFieldBody = await missingFieldResponse.json();

  assert.equal(missingFieldResponse.status, 400);
  assert.equal(missingFieldBody.error.code, "missing_fields");
});
