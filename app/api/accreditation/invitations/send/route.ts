import { NextResponse } from "next/server";

import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceAuthStateMessage, loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";
import { createSupabaseAccreditationRepositories } from "@/repositories/supabase-accreditation-repositories";
import { createSupabaseAccreditationAccessRepositories } from "@/repositories/supabase-accreditation-access-repositories";
import { createSupabaseAccreditationInvitationDeliveryRepositories } from "@/repositories/supabase-accreditation-invitation-repositories";
import { buildAccreditationWhatsAppDeliveryAttempt, buildAccreditationWhatsAppEnv, resolveAccreditationInvitationEligibility } from "@/features/accreditation/invitations";
import { sendWhatsAppCloudMessage, WhatsAppCloudError } from "@/features/access/domain/whatsapp-cloud";
import { getWhatsAppDeliveryStatusDetail } from "@/features/access/domain/whatsapp-delivery-tracking";

type AccreditationInvitationSendRequestBody = {
  enrollmentId?: string;
  mediaId?: string;
};

type AccreditationInvitationSendDependencies = {
  getAuthUser?: typeof getSupabaseAuthUser;
  loadWorkspace?: typeof loadWorkspaceBootstrap;
  getClient?: typeof getSupabaseServerClient;
  sendWhatsApp?: typeof sendWhatsAppCloudMessage;
  createEnrollmentRepositories?: typeof createSupabaseAccreditationRepositories;
  createAccessRepositories?: typeof createSupabaseAccreditationAccessRepositories;
  createDeliveryRepositories?: typeof createSupabaseAccreditationInvitationDeliveryRepositories;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
};

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildDeliveryFailureMessage() {
  return "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.";
}

function getStatusHistoryDetail(status: "accepted") {
  return getWhatsAppDeliveryStatusDetail(status);
}

function buildAcceptanceResponse(trackingPersisted: boolean) {
  return {
    ok: true as const,
    providerAccepted: true as const,
    trackingPersisted,
    status: "accepted" as const,
    ...(trackingPersisted
      ? {}
      : {
          warning: {
            code: "accepted_but_tracking_failed" as const,
            message: buildDeliveryFailureMessage(),
          },
        }),
  };
}

function resolveCurrentEventName(workspace: Awaited<ReturnType<typeof loadWorkspaceBootstrap>>) {
  const event = workspace.events.find((item) => item.id === workspace.currentEventId && item.organizationId === workspace.currentOrganizationId);

  return event?.name?.trim() ?? "";
}

async function resolveAccreditationInvitationSendContextFromWorkspace(params: {
  workspace: Awaited<ReturnType<typeof loadWorkspaceBootstrap>>;
  enrollmentId: string;
  createEnrollmentRepositories: typeof createSupabaseAccreditationRepositories;
  createAccessRepositories: typeof createSupabaseAccreditationAccessRepositories;
  getClient: typeof getSupabaseServerClient;
}) {
  const client = params.getClient() as never;
  const enrollmentRepositories = params.createEnrollmentRepositories(client);
  const accessRepositories = params.createAccessRepositories(client);
  const enrollment = await enrollmentRepositories.enrollments.getById(params.enrollmentId);

  if (!enrollment) {
    return { ok: false as const, error: { code: "enrollment_not_found", message: "No pudimos resolver la inscripción de acreditación." } } as const;
  }

  if (enrollment.organizationId !== params.workspace.currentOrganizationId || enrollment.eventId !== params.workspace.currentEventId) {
    return { ok: false as const, error: { code: "wrong_scope", message: "La inscripción pertenece a otro evento o organización." } } as const;
  }

  const accessGrant = await accessRepositories.getByEnrollment(
    { organizationId: params.workspace.currentOrganizationId, eventId: params.workspace.currentEventId },
    enrollment.id,
  );

  if (!accessGrant) {
    return { ok: false as const, error: { code: "grant_not_found", message: "Todavía no existe un cupo de acceso para esta inscripción." } } as const;
  }

  const eventName = resolveCurrentEventName(params.workspace);

  if (!eventName) {
    return { ok: false as const, error: { code: "event_not_found", message: "No pudimos resolver el evento activo." } } as const;
  }

  const eligibility = resolveAccreditationInvitationEligibility({
    enrollment,
    accessGrant,
    eventName,
  });

  if (!eligibility.canSend || !eligibility.recipient) {
    return {
      ok: false as const,
      error: {
        code:
          eligibility.reason === "enrollment_cancelled"
            ? "enrollment_cancelled"
            : eligibility.reason === "grant_revoked"
              ? "grant_revoked"
              : "invalid_whatsapp_number",
        message:
          eligibility.reason === "enrollment_cancelled"
            ? "La inscripción está cancelada y no se puede enviar la invitación."
            : eligibility.reason === "grant_revoked"
              ? "El cupo de acceso fue revocado y no se puede enviar la invitación."
              : "La inscripción no tiene un WhatsApp válido para enviar la invitación.",
      },
    } as const;
  }

  return {
    ok: true as const,
    enrollment,
    accessGrant,
    recipient: eligibility.recipient,
    eventName,
  } as const;
}

export async function handleAccreditationInvitationSend(
  request: Request,
  dependencies: AccreditationInvitationSendDependencies = {},
) {
  let body: AccreditationInvitationSendRequestBody;

  try {
    body = (await request.json()) as AccreditationInvitationSendRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "La solicitud de acreditación no es válida.",
        },
      },
      { status: 400 },
    );
  }

  const enrollmentId = getRequestString(body.enrollmentId);
  const mediaId = getRequestString(body.mediaId);

  if (!enrollmentId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_fields",
          message: "Falta la inscripción para preparar el envío por WhatsApp.",
        },
      },
      { status: 400 },
    );
  }

  const getAuthUser = dependencies.getAuthUser ?? getSupabaseAuthUser;
  const loadWorkspace = dependencies.loadWorkspace ?? loadWorkspaceBootstrap;
  const getClient = dependencies.getClient ?? getSupabaseServerClient;
  const sendWhatsApp = dependencies.sendWhatsApp ?? sendWhatsAppCloudMessage;
  const createEnrollmentRepositories = dependencies.createEnrollmentRepositories ?? createSupabaseAccreditationRepositories;
  const createAccessRepositories = dependencies.createAccessRepositories ?? createSupabaseAccreditationAccessRepositories;
  const createDeliveryRepositories =
    dependencies.createDeliveryRepositories ?? createSupabaseAccreditationInvitationDeliveryRepositories;
  const env = dependencies.env ?? process.env;

  const authUser = await getAuthUser();

  if (!authUser) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "Debés iniciar sesión para enviar acreditaciones por WhatsApp.",
        },
      },
      { status: 401 },
    );
  }

  const workspace = await loadWorkspace({ id: authUser.id, email: authUser.email });

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
          message: "No tenés permiso para enviar acreditaciones por WhatsApp.",
        },
      },
      { status: 403 },
    );
  }

  const resolved = await resolveAccreditationInvitationSendContextFromWorkspace({
    workspace,
    enrollmentId,
    createEnrollmentRepositories,
    createAccessRepositories,
    getClient,
  });

  if (!resolved.ok) {
    const status =
      resolved.error.code === "grant_not_found" ||
      resolved.error.code === "enrollment_not_found" ||
      resolved.error.code === "event_not_found"
        ? 404
        : resolved.error.code === "invalid_whatsapp_number" || resolved.error.code === "wrong_scope"
          ? 400
        : 409;

    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
      },
      { status },
    );
  }

  const sendEnv = buildAccreditationWhatsAppEnv({
    mediaId: Boolean(mediaId),
    env,
  });

  try {
    const result = await sendWhatsApp(
      {
        recipient: resolved.recipient,
        guestName: resolved.enrollment.name,
        eventName: resolved.eventName,
        accessCode: resolved.accessGrant.accessCode,
        ...(mediaId ? { mediaId } : {}),
      },
      fetch,
      sendEnv,
    );

    const client = getClient() as never;
    const deliveryRepositories = createDeliveryRepositories(client);
    const now = dependencies.now ?? (() => new Date().toISOString());
    const acceptedAt = now();
    const messageId = String(result.messageId ?? "");

    if (!messageId) {
      throw new WhatsAppCloudError("WhatsApp Cloud API no devolvió un message id.", {
        status: 502,
        code: "whatsapp_cloud_missing_message_id",
        safeMessage: "WhatsApp Cloud API no devolvió un message id.",
      });
    }

    const templateName = mediaId
      ? String(sendEnv.WHATSAPP_IMAGE_TEMPLATE_NAME ?? "")
      : String(sendEnv.WHATSAPP_TEMPLATE_NAME ?? "");
    const templateLanguage = mediaId
      ? String(sendEnv.WHATSAPP_IMAGE_TEMPLATE_LANGUAGE ?? "")
      : String(sendEnv.WHATSAPP_TEMPLATE_LANGUAGE ?? "");
    const attempt = buildAccreditationWhatsAppDeliveryAttempt({
      organizationId: resolved.enrollment.organizationId,
      eventId: resolved.enrollment.eventId,
      enrollmentId: resolved.enrollment.id,
      accessGrantId: resolved.accessGrant.id,
      operatorProfileId: currentProfile.id,
      recipient: resolved.recipient,
      accessCode: resolved.accessGrant.accessCode,
      qrToken: resolved.accessGrant.qrToken,
      messageId,
      deliveryStatus: "accepted",
      statusHistory: [
        {
          status: "accepted",
          timestamp: acceptedAt,
          detail: getStatusHistoryDetail("accepted"),
        },
      ],
      acceptedAt,
      templateName,
      templateLanguage,
      mediaId: mediaId || undefined,
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
    });

    let trackingPersisted = false;
    let persistedAttempt = attempt;

    try {
      persistedAttempt = await deliveryRepositories.create(attempt);
      trackingPersisted = true;
    } catch {
      trackingPersisted = false;
    }

    return NextResponse.json({
      ...buildAcceptanceResponse(trackingPersisted),
      messageId,
      enrollmentId: resolved.enrollment.id,
      attemptNumber: persistedAttempt.attemptNumber,
      mediaId: mediaId || null,
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
          code: "accreditation_whatsapp_unexpected_error",
          message: "No se pudo enviar la acreditación por WhatsApp.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handleAccreditationInvitationSend(request);
}
