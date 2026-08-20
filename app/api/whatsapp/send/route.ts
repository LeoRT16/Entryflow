import { NextResponse } from "next/server";

import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import {
  getWhatsAppImageTemplateConfig,
  getRequiredWhatsAppTemplateConfig,
  sendWhatsAppCloudMessage,
  WhatsAppCloudError,
} from "@/features/access/domain/whatsapp-cloud";
import {
  getWhatsAppDeliveryStatusDetail,
} from "@/features/access/domain/whatsapp-delivery-tracking";
import {
  buildWhatsAppSendAcceptedGuestUpdate,
  buildWhatsAppSendAcceptanceResponse,
} from "@/features/access/domain/whatsapp-send-acceptance";

type WhatsAppSendRequestBody = {
  guestId?: string;
  recipient?: string;
  guestName?: string;
  eventName?: string;
  accessCode?: string;
  invitationCode?: string;
  mediaId?: string;
};

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type WhatsAppDeliveryAttemptsTable = {
  upsert(values: Record<string, unknown>, options: { onConflict: string }): Promise<unknown>;
};

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
  const accessCode = getRequestString(body.accessCode) || getRequestString(body.invitationCode);
  const mediaId = getRequestString(body.mediaId);
  const guestId = getRequestString(body.guestId);

  if (!recipient || !guestName || !eventName || !accessCode) {
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

  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "Debés iniciar sesión para enviar invitaciones por WhatsApp.",
        },
      },
      { status: 401 },
    );
  }

  const workspace = await loadWorkspaceBootstrap({ id: authUser.id, email: authUser.email });

  if (workspace.authState.status !== "ready") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: workspace.authState.status,
          message: getWorkspaceAuthStateMessage(workspace.authState),
        },
      },
      { status: 403 },
    );
  }

  const currentProfile = workspace.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;
  if (!currentProfile) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No pudimos resolver tu perfil activo para esta organización.",
        },
      },
      { status: 403 },
    );
  }

  const currentRole = workspace.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator");
  const permissions = resolveAccountPermissions({
    permissions: currentProfile.metadata?.permissions,
    rolePermissions: currentRole.permissions,
    roleMetadata: currentRole.metadata,
    accountMetadata: currentProfile.metadata,
  });

  if (!permissions.includes("access.issue")) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "forbidden",
          message: "No tenés permiso para enviar invitaciones por WhatsApp.",
        },
      },
      { status: 403 },
    );
  }

  const guest =
    (guestId ? workspace.guests.find((item) => item.id === guestId) : null) ??
    workspace.guests.find((item) => item.accessCode === accessCode || item.invitationCode === accessCode) ??
    null;

  if (!guest) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "guest_not_found",
          message: "No pudimos resolver el invitado para el envío de WhatsApp.",
        },
      },
      { status: 404 },
    );
  }

  try {
    const templateConfig = mediaId ? getWhatsAppImageTemplateConfig() : getRequiredWhatsAppTemplateConfig();

    const result = await sendWhatsAppCloudMessage({
      recipient,
      guestName,
      eventName,
      accessCode,
      ...(mediaId ? { mediaId } : {}),
    });

    const client = getSupabaseServerClient();
    const repositories = createSupabaseWorkspaceRepositories(client);
    const deliveryAttemptsTable = client.from("whatsapp_delivery_attempts" as never) as unknown as WhatsAppDeliveryAttemptsTable;
    const acceptedAt = new Date().toISOString();
    const messageId = result.messageId?.trim() || "";
    const attemptNumber =
      workspace.whatsappDeliveryAttempts.filter((attempt) => attempt.guest_id === guest.id && !attempt.deleted_at).reduce((max, attempt) => Math.max(max, attempt.attempt_number), 0) + 1;
    const deliveryStatus = "accepted" as const;
    let trackingPersisted = false;

    if (messageId) {
      try {
        await deliveryAttemptsTable.upsert(
          {
            organization_id: workspace.currentOrganizationId,
            event_id: workspace.currentEventId,
            guest_id: guest.id,
            reservation_id: guest.reservationId,
            message_id: messageId,
            attempt_number: attemptNumber,
            delivery_status: deliveryStatus,
            status_history: [
              {
                status: deliveryStatus,
                timestamp: acceptedAt,
                detail: getWhatsAppDeliveryStatusDetail(deliveryStatus),
              },
            ],
            accepted_at: acceptedAt,
            sent_at: null,
            delivered_at: null,
            read_at: null,
            failed_at: null,
            failure_code: null,
            failure_message: null,
            failure_details: null,
            template_name: templateConfig?.templateName ?? "",
            template_language: templateConfig?.templateLanguage ?? "",
          },
          { onConflict: "message_id" },
        );
        trackingPersisted = true;
      } catch (error) {
        console.error("WhatsApp delivery attempt persistence failed", {
          guestId: guest.id,
          eventId: workspace.currentEventId,
          messageId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    } else {
      console.error("WhatsApp Cloud response missing message id", {
        guestId: guest.id,
        eventId: workspace.currentEventId,
      });
    }

    const nextGuest = buildWhatsAppSendAcceptedGuestUpdate({
      guest,
      attemptNumber,
      acceptedAt,
      messageId: messageId || guest.accessCode || guest.invitationCode,
      trackingPersisted,
    });

    await repositories.guests.upsert(nextGuest).catch((error) => {
      console.error("WhatsApp guest persistence failed", {
        guestId: guest.id,
        messageId: result.messageId ?? null,
        error: error instanceof Error ? error.message : "unknown",
      });
    });

    return NextResponse.json(buildWhatsAppSendAcceptanceResponse(trackingPersisted));
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
