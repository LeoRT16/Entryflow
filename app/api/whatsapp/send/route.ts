import { NextResponse } from "next/server";

import { sendWhatsAppCloudMessage, WhatsAppCloudError } from "@/features/access/domain/whatsapp-cloud";

type WhatsAppSendRequestBody = {
  recipient?: string;
  guestName?: string;
  eventName?: string;
  invitationCode?: string;
};

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let body: WhatsAppSendRequestBody;

  try {
    body = (await request.json()) as WhatsAppSendRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "La solicitud de WhatsApp no es válida.",
        },
      },
      { status: 400 },
    );
  }

  const recipient = getRequestString(body.recipient);
  const guestName = getRequestString(body.guestName);
  const eventName = getRequestString(body.eventName);
  const invitationCode = getRequestString(body.invitationCode);

  if (!recipient || !guestName || !eventName || !invitationCode) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_fields",
          message: "Faltan datos para preparar el envío por WhatsApp.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await sendWhatsAppCloudMessage({
      recipient,
      guestName,
      eventName,
      invitationCode,
    });

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
    });
  } catch (error) {
    if (error instanceof WhatsAppCloudError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.safeMessage,
          },
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "whatsapp_cloud_unexpected_error",
          message: "No se pudo enviar la invitación por WhatsApp.",
        },
      },
      { status: 500 },
    );
  }
}

