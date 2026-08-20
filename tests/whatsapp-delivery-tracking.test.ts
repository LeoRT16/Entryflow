import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { GET, POST } from "../app/api/whatsapp/webhook/route";
import {
  applyWhatsAppDeliveryWebhookStatus,
  buildWhatsAppDeliveryStateIndex,
  collectWhatsAppDeliveryWebhookStatuses,
  getLegacyWhatsAppDeliveryStatus,
  getWhatsAppDeliveryStatusLabel,
} from "../features/access/domain/whatsapp-delivery-tracking";
import type { WhatsAppDeliveryAttemptRow } from "../lib/supabase/types";

function buildAttemptRow(overrides: Partial<WhatsAppDeliveryAttemptRow> = {}): WhatsAppDeliveryAttemptRow {
  return {
    id: "attempt-1",
    organization_id: "org-1",
    event_id: "event-1",
    guest_id: "guest-1",
    reservation_id: "reservation-1",
    message_id: "wamid.mock-1",
    attempt_number: 1,
    delivery_status: "accepted",
    status_history: [{ status: "accepted", timestamp: "2026-08-20T00:00:00.000Z", detail: "Meta aceptó la solicitud de envío." }],
    accepted_at: "2026-08-20T00:00:00.000Z",
    sent_at: null,
    delivered_at: null,
    read_at: null,
    failed_at: null,
    failure_code: null,
    failure_message: null,
    failure_details: null,
    template_name: "entryflow_invitation_image_v1",
    template_language: "es_MX",
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

test("WhatsApp webhook GET verifies the challenge token", async () => {
  const previousEnv = {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  };

  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token";
  process.env.WHATSAPP_APP_SECRET = "app-secret";

  try {
    const response = await GET(
      new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123"),
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "challenge-123");
  } finally {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previousEnv.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = previousEnv.WHATSAPP_APP_SECRET;
  }
});

test("WhatsApp webhook GET rejects an incorrect verification token", async () => {
  const previousEnv = {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  };

  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token";
  process.env.WHATSAPP_APP_SECRET = "app-secret";

  try {
    const response = await GET(
      new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123"),
    );

    assert.equal(response.status, 403);
  } finally {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previousEnv.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = previousEnv.WHATSAPP_APP_SECRET;
  }
});

test("WhatsApp webhook POST rejects invalid signatures", async () => {
  const previousEnv = {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  };

  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token";
  process.env.WHATSAPP_APP_SECRET = "app-secret";

  try {
    const response = await POST(
      new Request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": "sha256=deadbeef",
        },
        body: JSON.stringify({ entry: [] }),
      }),
    );

    assert.equal(response.status, 403);
  } finally {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previousEnv.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = previousEnv.WHATSAPP_APP_SECRET;
  }
});

test("WhatsApp webhook POST accepts valid signatures for irrelevant payloads", async () => {
  const previousEnv = {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  };

  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token";
  process.env.WHATSAPP_APP_SECRET = "app-secret";

  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });

  try {
    const expected = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

    const response = await POST(
      new Request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": expected,
        },
        body,
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, processed: 0 });
  } finally {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previousEnv.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = previousEnv.WHATSAPP_APP_SECRET;
  }
});

test("WhatsApp webhook parser extracts delivered statuses and ignores irrelevant payloads", () => {
  assert.deepEqual(collectWhatsAppDeliveryWebhookStatuses({ entry: [] }), []);

  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid-1", status: "sent", timestamp: "10" },
                { id: "wamid-1", status: "delivered", timestamp: "11" },
                { id: "wamid-1", status: "read", timestamp: "12" },
                { id: "wamid-1", status: "failed", timestamp: "13", errors: [{ code: 131000, title: "Delivery failed" }] },
                { id: "", status: "sent", timestamp: "14" },
                { id: "wamid-2", status: "ignored", timestamp: "15" },
              ],
            },
          },
        ],
      },
    ],
  };

  const updates = collectWhatsAppDeliveryWebhookStatuses(payload);

  assert.equal(updates.length, 4);
  assert.equal(updates[0]?.status, "sent");
  assert.equal(updates[1]?.status, "delivered");
  assert.equal(updates[2]?.status, "read");
  assert.equal(updates[3]?.status, "failed");
  assert.equal(updates[3]?.errorCode, "131000");
  assert.equal(updates[3]?.errorMessage, "Delivery failed");
});

test("WhatsApp delivery attempts keep the latest attempt per guest and ignore older states", () => {
  const attempts = [
    buildAttemptRow({
      guest_id: "guest-1",
      message_id: "wamid-1",
      attempt_number: 1,
      delivery_status: "sent",
      sent_at: "2026-08-20T00:01:00.000Z",
      updated_at: "2026-08-20T00:01:00.000Z",
    }),
    buildAttemptRow({
      guest_id: "guest-1",
      message_id: "wamid-2",
      attempt_number: 2,
      delivery_status: "read",
      accepted_at: "2026-08-20T00:05:00.000Z",
      sent_at: "2026-08-20T00:06:00.000Z",
      delivered_at: "2026-08-20T00:07:00.000Z",
      read_at: "2026-08-20T00:08:00.000Z",
      updated_at: "2026-08-20T00:08:00.000Z",
    }),
    buildAttemptRow({
      guest_id: "guest-2",
      message_id: "wamid-3",
      attempt_number: 1,
      delivery_status: "failed",
      failed_at: "2026-08-20T00:09:00.000Z",
      failure_message: "Número inválido",
      updated_at: "2026-08-20T00:09:00.000Z",
    }),
  ];

  const index = buildWhatsAppDeliveryStateIndex(attempts);

  assert.equal(index.get("guest-1")?.messageId, "wamid-2");
  assert.equal(index.get("guest-1")?.currentStatus, "read");
  assert.equal(index.get("guest-1")?.attemptNumber, 2);
  assert.equal(index.get("guest-2")?.currentStatus, "failed");
  assert.equal(index.get("guest-2")?.failureMessage, "Número inválido");
});

test("WhatsApp delivery status progression stays monotonic and duplicate regressions are ignored", () => {
  const accepted = buildAttemptRow();
  const sent = applyWhatsAppDeliveryWebhookStatus(accepted, {
    messageId: accepted.message_id,
    status: "sent",
    timestamp: "2026-08-20T00:02:00.000Z",
  });

  assert.equal(sent.changed, true);
  assert.equal(sent.row.delivery_status, "sent");

  const delivered = applyWhatsAppDeliveryWebhookStatus(sent.row, {
    messageId: accepted.message_id,
    status: "delivered",
    timestamp: "2026-08-20T00:03:00.000Z",
  });

  assert.equal(delivered.changed, true);
  assert.equal(delivered.row.delivery_status, "delivered");

  const regression = applyWhatsAppDeliveryWebhookStatus(delivered.row, {
    messageId: accepted.message_id,
    status: "sent",
    timestamp: "2026-08-20T00:04:00.000Z",
  });

  assert.equal(regression.changed, false);
  assert.equal(regression.row.delivery_status, "delivered");

  const failed = applyWhatsAppDeliveryWebhookStatus(buildAttemptRow({ delivery_status: "sent" }), {
    messageId: accepted.message_id,
    status: "failed",
    timestamp: "2026-08-20T00:05:00.000Z",
    errorCode: "131000",
    errorMessage: "Delivery failed",
  });

  assert.equal(failed.changed, true);
  assert.equal(failed.row.delivery_status, "failed");
  assert.equal(failed.row.failure_code, "131000");
  assert.equal(failed.row.failure_message, "Delivery failed");
  assert.equal(getLegacyWhatsAppDeliveryStatus("read", 2), "Vista");
  assert.equal(getWhatsAppDeliveryStatusLabel("delivered"), "Entregado");
});
