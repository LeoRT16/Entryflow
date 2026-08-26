import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseAccreditationInvitationDeliveryRepositories } from "../repositories/supabase-accreditation-invitation-repositories";

type QueueItem = { data?: unknown; error?: { message: string; code?: string; constraint?: string } | null };

function createFakeClient(queue: QueueItem[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  type FakeBuilder = {
    select(columns?: string): FakeBuilder;
    eq(column: string, value: unknown): FakeBuilder;
    order(column: string, options?: { ascending?: boolean }): FakeBuilder;
    insert(payload: unknown): FakeBuilder;
    maybeSingle(): Promise<QueueItem>;
    single(): Promise<QueueItem>;
    then(resolve: (value: QueueItem) => void, reject: (reason?: unknown) => void): undefined;
  };

  function createBuilder(table: string): FakeBuilder {
    const builder: FakeBuilder = {
      select(columns?: string) {
        calls.push({ table, op: `select:${columns ?? "*"}` });
        return builder;
      },
      eq(column: string, value: unknown) {
        calls.push({ table, op: `eq:${column}`, payload: value });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        calls.push({ table, op: `order:${column}`, payload: options });
        return builder;
      },
      insert(payload: unknown) {
        calls.push({ table, op: "insert", payload });
        return builder;
      },
      async maybeSingle() {
        return queue.shift() ?? { data: null, error: null };
      },
      async single() {
        return queue.shift() ?? { data: null, error: null };
      },
      then(resolve: (value: QueueItem) => void, reject: (reason?: unknown) => void) {
        const next = queue.shift() ?? { data: null, error: null };
        if (next.error) {
          reject?.(next.error);
          return undefined;
        }
        resolve(next);
        return undefined;
      },
    };

    return builder;
  }

  return {
    calls,
    from(table: string) {
      return createBuilder(table);
    },
  };
}

test("accreditation invitation delivery repository round-trips attempts through accreditation_whatsapp_delivery_attempts", async () => {
  const client = createFakeClient([
    {
      data: {
        id: "attempt-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_grant_id: "grant-1",
        operator_profile_id: "profile-1",
        recipient: "59170000097",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        message_id: "wamid.mock-1",
        attempt_number: 1,
        delivery_status: "accepted",
        status_history: [
          {
            status: "accepted",
            timestamp: "2026-08-26T12:00:00.000Z",
            detail: "Meta aceptó la solicitud de envío.",
          },
        ],
        accepted_at: "2026-08-26T12:00:00.000Z",
        sent_at: null,
        delivered_at: null,
        read_at: null,
        failed_at: null,
        failure_code: null,
        failure_message: null,
        failure_details: null,
        template_name: "accreditation_invitation",
        template_language: "es_MX",
        media_id: null,
        created_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T12:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: {
        id: "attempt-1",
        organization_id: "org-1",
        event_id: "event-1",
        enrollment_id: "enrollment-1",
        access_grant_id: "grant-1",
        operator_profile_id: "profile-1",
        recipient: "59170000097",
        access_code: "ACC-7K4D-9M2Q",
        qr_token: "acc1_1234567890abcdef1234567890abcdef",
        message_id: "wamid.mock-1",
        attempt_number: 1,
        delivery_status: "accepted",
        status_history: [],
        accepted_at: "2026-08-26T12:00:00.000Z",
        sent_at: null,
        delivered_at: null,
        read_at: null,
        failed_at: null,
        failure_code: null,
        failure_message: null,
        failure_details: null,
        template_name: "accreditation_invitation",
        template_language: "es_MX",
        media_id: null,
        created_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T12:00:00.000Z",
        deleted_at: null,
      },
    },
    {
      data: [
        {
          id: "attempt-1",
          organization_id: "org-1",
          event_id: "event-1",
          enrollment_id: "enrollment-1",
          access_grant_id: "grant-1",
          operator_profile_id: "profile-1",
          recipient: "59170000097",
          access_code: "ACC-7K4D-9M2Q",
          qr_token: "acc1_1234567890abcdef1234567890abcdef",
          message_id: "wamid.mock-1",
          attempt_number: 1,
          delivery_status: "accepted",
          status_history: [],
          accepted_at: "2026-08-26T12:00:00.000Z",
          sent_at: null,
          delivered_at: null,
          read_at: null,
          failed_at: null,
          failure_code: null,
          failure_message: null,
          failure_details: null,
          template_name: "accreditation_invitation",
          template_language: "es_MX",
          media_id: null,
          created_at: "2026-08-26T12:00:00.000Z",
          updated_at: "2026-08-26T12:00:00.000Z",
          deleted_at: null,
        },
      ],
    },
  ]);

  const repositories = createSupabaseAccreditationInvitationDeliveryRepositories(client as never);
  const created = await repositories.create({
    id: "attempt-1",
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: "enrollment-1",
    accessGrantId: "grant-1",
    operatorProfileId: "profile-1",
    recipient: "59170000097",
    accessCode: "ACC-7K4D-9M2Q",
    qrToken: "acc1_1234567890abcdef1234567890abcdef",
    messageId: "wamid.mock-1",
    attemptNumber: 1,
    deliveryStatus: "accepted",
    statusHistory: [
      {
        status: "accepted",
        timestamp: "2026-08-26T12:00:00.000Z",
        detail: "Meta aceptó la solicitud de envío.",
      },
    ],
    acceptedAt: "2026-08-26T12:00:00.000Z",
    templateName: "accreditation_invitation",
    templateLanguage: "es_MX",
    createdAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
  });

  const byMessageId = await repositories.getByMessageId({ organizationId: "org-1", eventId: "event-1" }, "wamid.mock-1");
  const list = await repositories.listByEnrollment({ organizationId: "org-1", eventId: "event-1" }, "enrollment-1");

  assert.equal(created.accessCode, "ACC-7K4D-9M2Q");
  assert.equal(byMessageId?.qrToken, "acc1_1234567890abcdef1234567890abcdef");
  assert.equal(list.length, 1);
  assert.ok(client.calls.some((call) => call.table === "accreditation_whatsapp_delivery_attempts"));
  assert.equal(client.calls.some((call) => call.table === "whatsapp_delivery_attempts"), false);
});
