import { NextResponse } from "next/server";

import type { AccreditationProgramScopeDependencies } from "@/features/accreditation/program/accreditation-program-operational";
import { createSupabaseAccreditationProgramRepositories } from "@/repositories/supabase-accreditation-program-repositories";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAccreditationProgramScope } from "@/features/accreditation/program/accreditation-program-operational";
import { AccreditationProgramValidationError, validateAccreditationProgramSessionInput } from "@/features/accreditation/program";

type SessionMutationBody = {
  title?: string;
  description?: string;
  sessionType?: string;
  startsAt?: string;
  endsAt?: string;
  room?: string;
  capacity?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

type RouteDependencies = {
  getAuthUser?: AccreditationProgramScopeDependencies["getAuthUser"];
  loadWorkspace?: AccreditationProgramScopeDependencies["loadWorkspace"];
  getClient?: typeof getSupabaseServerClient;
  resolveScope?: typeof resolveAccreditationProgramScope;
  createRepositories?: typeof createSupabaseAccreditationProgramRepositories;
};

function readBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {};
  }

  return body as SessionMutationBody;
}

function getRequestString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRequestCapacity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);

  return Number.isInteger(numeric) ? numeric : Number.NaN;
}

function buildInput(eventId: string, organizationId: string, body: SessionMutationBody) {
  return validateAccreditationProgramSessionInput({
    organizationId,
    eventId,
    title: getRequestString(body.title),
    description: getRequestString(body.description),
    sessionType: getRequestString(body.sessionType),
    startsAt: getRequestString(body.startsAt),
    endsAt: getRequestString(body.endsAt),
    room: getRequestString(body.room),
    capacity: body.capacity === undefined ? null : getRequestCapacity(body.capacity),
    metadata: body.metadata ?? null,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string; sessionId: string }> },
  dependencies: RouteDependencies = {},
) {
  const { eventId, sessionId } = await context.params;
  let body: SessionMutationBody = {};

  try {
    body = readBody(await request.json());
  } catch {
    body = {};
  }

  const resolveScope = dependencies.resolveScope ?? resolveAccreditationProgramScope;
  const scope = await resolveScope({ eventId, dependencies });

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const currentClient = (dependencies.getClient ?? getSupabaseServerClient)() as never;
  const repositories = (dependencies.createRepositories ?? createSupabaseAccreditationProgramRepositories)(currentClient);
  const current = await repositories.getById(sessionId);

  if (!current || current.organizationId !== scope.event.organizationId || current.eventId !== scope.event.id) {
    return NextResponse.json(
      { ok: false, error: { code: "session_not_found", message: "No pudimos resolver la sesión." } },
      { status: 404 },
    );
  }

  try {
    const input = buildInput(scope.event.id, scope.event.organizationId, body);
    const session = await repositories.update(sessionId, {
      title: input.title,
      description: input.description ?? null,
      sessionType: input.sessionType,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      room: input.room ?? null,
      capacity: input.capacity ?? null,
      metadata: input.metadata ?? null,
    });

    return NextResponse.json({ ok: true, session });
  } catch (error) {
    if (error instanceof AccreditationProgramValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            field: error.field,
            message: error.message,
          },
        },
        { status: 400 },
      );
    }

    throw error;
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ eventId: string; sessionId: string }> },
  dependencies: RouteDependencies = {},
) {
  const { eventId, sessionId } = await context.params;
  const resolveScope = dependencies.resolveScope ?? resolveAccreditationProgramScope;
  const scope = await resolveScope({ eventId, dependencies });

  if (!scope.ok) {
    return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
  }

  const currentClient = (dependencies.getClient ?? getSupabaseServerClient)() as never;
  const repositories = (dependencies.createRepositories ?? createSupabaseAccreditationProgramRepositories)(currentClient);
  const current = await repositories.getById(sessionId);

  if (!current || current.organizationId !== scope.event.organizationId || current.eventId !== scope.event.id) {
    return NextResponse.json(
      { ok: false, error: { code: "session_not_found", message: "No pudimos resolver la sesión." } },
      { status: 404 },
    );
  }

  const session = await repositories.cancel(sessionId);

  return NextResponse.json({ ok: true, session });
}
