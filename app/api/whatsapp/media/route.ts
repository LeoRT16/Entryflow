import { NextResponse } from "next/server";

import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import {
  uploadWhatsAppCloudMedia,
  validateWhatsAppMediaUpload,
  WhatsAppCloudError,
} from "@/features/access/domain/whatsapp-cloud";

export async function POST(request: Request) {
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "Debés iniciar sesión para subir la imagen de WhatsApp.",
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
          message: "No tenés permiso para subir la imagen de WhatsApp.",
        },
      },
      { status: 403 },
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "La solicitud de WhatsApp Media no es válida.",
        },
      },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_file",
          message: "Adjuntá una imagen válida para subir a WhatsApp.",
        },
      },
      { status: 400 },
    );
  }

  const validation = validateWhatsAppMediaUpload({
    mimeType: fileEntry.type || "application/octet-stream",
    size: fileEntry.size,
  });

  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_file",
          message: validation.message,
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await uploadWhatsAppCloudMedia({
      file: fileEntry,
      fileName: fileEntry.name || "invitation.png",
    });

    return NextResponse.json({
      ok: true,
      mediaId: result.mediaId,
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
          code: "whatsapp_media_unexpected_error",
          message: "No se pudo subir la imagen de WhatsApp.",
        },
      },
      { status: 500 },
    );
  }
}
