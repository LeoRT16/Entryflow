import { NextResponse } from "next/server";

import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { getRolePresetBySlug, normalizeAccountPermissions } from "@/features/accounts/domain/accounts-domain";
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
  const permissions = normalizeAccountPermissions(currentProfile.metadata?.permissions, currentRole.permissions);

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
