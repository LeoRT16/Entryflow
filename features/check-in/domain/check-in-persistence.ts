import type { CheckInMethod, CheckIn, Guest } from "@/features/check-in/types";
import { createAdmissionTimelineEntry, type AdmissionEngineOutput, type Ticket } from "@/features/access/domain/access-domain";
import type { TimelineEvent } from "@/features/timeline/types";
import { createUuid } from "@/lib/supabase/helpers";

export type CheckInPersistenceRepositories = {
  checkIns: {
    create(checkIn: CheckIn): Promise<CheckIn>;
    delete(id: string): Promise<boolean>;
  };
  guests: {
    upsert(guest: Guest): Promise<Guest>;
  };
  timeline: {
    upsert(entry: TimelineEvent): Promise<TimelineEvent>;
  };
};

export type CompletedCheckInBundle = {
  nextGuest: Guest;
  checkIn: CheckIn;
  timelineEntry: TimelineEvent;
};

export class CheckInAlreadyConsumedError extends Error {
  constructor(message = "El acceso ya fue consumido.") {
    super(message);
    this.name = "CheckInAlreadyConsumedError";
  }
}

function isUniqueAccessGrantViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; constraint?: unknown; message?: unknown };

  return (
    maybeError.code === "23505" &&
    (maybeError.constraint === "checkins_access_grant_id_active_unique" ||
      (typeof maybeError.message === "string" && maybeError.message.includes("access_grant_id")))
  );
}

export function buildRejectedCheckInTimelineEntry(params: {
  guest: Guest | null;
  result: AdmissionEngineOutput;
  ticket: Ticket | null;
}) {
  const { guest, result, ticket } = params;

  return {
    ...createAdmissionTimelineEntry(result, ticket),
    eventId: guest?.eventId ?? ticket?.eventId ?? "",
  } as TimelineEvent;
}

export function isAccessGrantAlreadyConsumed(
  accessGrantKey: string | undefined,
  consumedAccessGrantIds: ReadonlySet<string>,
) {
  return Boolean(accessGrantKey && consumedAccessGrantIds.has(accessGrantKey));
}

export function buildCompletedCheckInBundle(params: {
  guest: Guest;
  result: AdmissionEngineOutput;
  ticket: Ticket | null;
  method: CheckInMethod;
  operator: string;
  timestampIso: string;
}) {
  const { guest, result, ticket, method, operator, timestampIso } = params;
  const timestamp = timestampIso.slice(11, 16);
  const admissionMethod = method === "Manual" ? "manual" : "qr";
  const gate = method === "Manual" ? "Recepción" : guest.gate ?? "Principal";

  const nextGuest: Guest = {
    ...guest,
    admissionStatus: "Ingresó",
    qrStatus: "Usado",
    reservationStatus: "Checked In",
    checkInTime: timestamp,
    checkInMethod: method,
    gate,
    manualAdmission: method === "Manual" ? true : guest.manualAdmission,
  };

  const checkIn: CheckIn = {
    id: createUuid(),
    accessType: admissionMethod,
    guestId: guest.id,
    reservationId: guest.reservationId,
    eventId: guest.eventId,
    accessGrantId: guest.accessGrantId ?? guest.id,
    method,
    checkedInAt: timestamp,
    checkedOutAt: undefined,
    operator,
    gate,
    notes: result.note,
    auditTrail: [
      {
        id: createUuid(),
        timestamp,
        kind: "access.checked_in",
        title: result.title,
        description: result.note,
        tone: "success",
        operator,
        gate,
        metadata: { method: admissionMethod, query: ticket?.code ?? guest.accessCode ?? guest.invitationCode, result: result.result },
      },
    ],
    reentryAllowed: true,
    maxEntries: 1,
    reentryWindowMinutes: undefined,
    attemptCount: 1,
    lastAttemptAt: timestamp,
    status: "Checked In",
    source: admissionMethod,
  };

  const timelineEntry: TimelineEvent = {
    ...createAdmissionTimelineEntry(result, ticket),
    eventId: guest.eventId,
  } as TimelineEvent;

  return { nextGuest, checkIn, timelineEntry } satisfies CompletedCheckInBundle;
}

export async function persistCompletedCheckInBundle(params: {
  repositories: CheckInPersistenceRepositories;
  originalGuest: Guest;
  bundle: CompletedCheckInBundle;
}) {
  const { repositories, originalGuest, bundle } = params;

  let checkInPersisted = false;
  let guestPersisted = false;

  try {
    await repositories.checkIns.create(bundle.checkIn);
    checkInPersisted = true;
  } catch (error) {
    if (isUniqueAccessGrantViolation(error)) {
      throw new CheckInAlreadyConsumedError();
    }

    throw error;
  }

  try {
    await repositories.guests.upsert(bundle.nextGuest);
    guestPersisted = true;

    await repositories.timeline.upsert(bundle.timelineEntry);
  } catch (error) {
    if (guestPersisted) {
      await repositories.guests.upsert(originalGuest).catch(() => undefined);
    }

    if (checkInPersisted) {
      await repositories.checkIns.delete(bundle.checkIn.id).catch(() => undefined);
    }

    throw error;
  }
}
