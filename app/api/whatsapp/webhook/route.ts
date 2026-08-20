import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatTimelineDisplayTime } from "@/features/timeline/domain/timeline-domain";
import {
  applyWhatsAppDeliveryWebhookStatus,
  collectWhatsAppDeliveryWebhookStatuses,
  getLegacyWhatsAppDeliveryStatus,
  getWhatsAppDeliveryStatusDetail,
  getWhatsAppDeliveryStatusLabel,
  type WhatsAppDeliveryStatus,
} from "@/features/access/domain/whatsapp-delivery-tracking";
import type { WhatsAppDeliveryAttemptRow } from "@/lib/supabase/types";

function getWhatsAppWebhookConfig(env: NodeJS.ProcessEnv = process.env) {
  const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  const appSecret = env.WHATSAPP_APP_SECRET?.trim();

  if (!verifyToken) {
    return null;
  }

  return {
    verifyToken,
    appSecret,
  };
}

function readString(value: string | null) {
  return value?.trim() ?? "";
}

function isValidSignature(rawBody: string, signature: string, appSecret: string) {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

async function updateGuestFromDeliveryStatus(
  repositories: ReturnType<typeof createSupabaseWorkspaceRepositories>,
  attempt: WhatsAppDeliveryAttemptRow,
  nextStatus: WhatsAppDeliveryStatus,
) {
  const guest = await repositories.guests.findById(attempt.guest_id);

  if (!guest) {
    return;
  }

  const timestamp = nextStatus === "failed" ? attempt.failed_at ?? attempt.updated_at : nextStatus === "read" ? attempt.read_at ?? attempt.updated_at : nextStatus === "delivered" ? attempt.delivered_at ?? attempt.updated_at : nextStatus === "sent" ? attempt.sent_at ?? attempt.updated_at : attempt.accepted_at ?? attempt.updated_at;
  const detail = nextStatus === "failed" ? attempt.failure_message ?? getWhatsAppDeliveryStatusDetail("failed") : getWhatsAppDeliveryStatusDetail(nextStatus);

  const nextGuest = {
    ...guest,
    deliveryStatus: getLegacyWhatsAppDeliveryStatus(nextStatus, attempt.attempt_number),
    recentChange: true,
    deliveryHistory: [
      ...guest.deliveryHistory,
      {
        time: formatTimelineDisplayTime(timestamp),
        title: getWhatsAppDeliveryStatusLabel(nextStatus),
        detail,
      },
    ],
    whatsappDelivery: {
      messageId: attempt.message_id,
      attemptNumber: attempt.attempt_number,
      currentStatus: nextStatus,
      updatedAt: timestamp,
      acceptedAt: attempt.accepted_at ?? undefined,
      sentAt: attempt.sent_at ?? undefined,
      deliveredAt: attempt.delivered_at ?? undefined,
      readAt: attempt.read_at ?? undefined,
      failedAt: attempt.failed_at ?? undefined,
      failureCode: attempt.failure_code ?? undefined,
      failureMessage: attempt.failure_message ?? undefined,
    },
  };

  await repositories.guests.upsert(nextGuest);
}

export async function GET(request: Request) {
  const config = getWhatsAppWebhookConfig();

  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "whatsapp_webhook_not_configured",
          message: "La verificación del webhook de WhatsApp no está configurada.",
        },
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const mode = readString(url.searchParams.get("hub.mode"));
  const verifyToken = readString(url.searchParams.get("hub.verify_token"));
  const challenge = readString(url.searchParams.get("hub.challenge"));

  if (mode === "subscribe" && verifyToken === config.verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "whatsapp_webhook_verification_failed",
        message: "No pudimos verificar el webhook de WhatsApp.",
      },
    },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const config = getWhatsAppWebhookConfig();

  if (!config || !config.appSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "whatsapp_webhook_not_configured",
          message: "La verificación del webhook de WhatsApp no está configurada.",
        },
      },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";

  if (!isValidSignature(rawBody, signature, config.appSecret)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "whatsapp_webhook_invalid_signature",
          message: "La firma del webhook de WhatsApp no es válida.",
        },
      },
      { status: 403 },
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "El webhook de WhatsApp no contiene JSON válido.",
        },
      },
      { status: 400 },
    );
  }

  const updates = collectWhatsAppDeliveryWebhookStatuses(payload);

  if (!updates.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const client = getSupabaseServerClient();
  const repositories = createSupabaseWorkspaceRepositories(client);
  let processed = 0;

  for (const update of updates) {
    const { data: attemptRow, error: selectError } = await client
      .from("whatsapp_delivery_attempts" as never)
      .select("*")
      .eq("message_id", update.messageId)
      .is("deleted_at", null)
      .maybeSingle();

    if (selectError || !attemptRow) {
      continue;
    }

    const attempt = attemptRow as WhatsAppDeliveryAttemptRow;
    const applied = applyWhatsAppDeliveryWebhookStatus(attempt, update);

    if (!applied.changed) {
      continue;
    }

    const { error: updateError } = await client.from("whatsapp_delivery_attempts" as never).update(applied.row as never).eq("id", attempt.id);

    if (updateError) {
      continue;
    }

    await updateGuestFromDeliveryStatus(repositories, applied.row, update.status).catch((error) => {
      console.error("WhatsApp guest delivery rehydrate failed", {
        guestId: attempt.guest_id,
        messageId: attempt.message_id,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
    processed += 1;
  }

  return NextResponse.json({
    ok: true,
    processed,
  });
}
