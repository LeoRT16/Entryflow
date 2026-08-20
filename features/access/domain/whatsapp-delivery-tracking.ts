import type { WhatsAppDeliveryAttemptRow } from "@/lib/supabase/types";

export type WhatsAppDeliveryStatus = "accepted" | "sent" | "delivered" | "read" | "failed";

export type WhatsAppDeliveryHistoryEntry = {
  status: WhatsAppDeliveryStatus;
  timestamp: string;
  detail?: string;
  code?: string;
};

export type WhatsAppLegacyDeliveryStatus = "Pendiente de envío" | "Enviada" | "Reenviada" | "Vista" | "Fallida";

export type WhatsAppDeliveryState = {
  messageId: string;
  attemptNumber: number;
  currentStatus: WhatsAppDeliveryStatus;
  updatedAt: string;
  acceptedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
};

export type WhatsAppDeliveryWebhookStatus = {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  timestamp: string;
  recipientId?: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string;
};

const WHATSAPP_DELIVERY_STATUS_ORDER: Record<WhatsAppDeliveryStatus, number> = {
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

const WHATSAPP_DELIVERY_STATUS_LABELS: Record<WhatsAppDeliveryStatus, string> = {
  accepted: "Aceptado",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
};

const WHATSAPP_DELIVERY_STATUS_TONES: Record<WhatsAppDeliveryStatus, "success" | "warning" | "danger" | "info"> = {
  accepted: "info",
  sent: "info",
  delivered: "success",
  read: "success",
  failed: "danger",
};

export function isWhatsAppDeliveryStatus(value: string): value is WhatsAppDeliveryStatus {
  return value === "accepted" || value === "sent" || value === "delivered" || value === "read" || value === "failed";
}

export function getWhatsAppDeliveryStatusLabel(status: WhatsAppDeliveryStatus | string) {
  return isWhatsAppDeliveryStatus(status) ? WHATSAPP_DELIVERY_STATUS_LABELS[status] : status;
}

export function getWhatsAppDeliveryStatusTone(status: WhatsAppDeliveryStatus | string) {
  return isWhatsAppDeliveryStatus(status) ? WHATSAPP_DELIVERY_STATUS_TONES[status] : "info";
}

export function getLegacyWhatsAppDeliveryStatus(status: WhatsAppDeliveryStatus, attemptNumber: number): WhatsAppLegacyDeliveryStatus {
  if (status === "failed") {
    return "Fallida";
  }

  if (status === "read") {
    return "Vista";
  }

  return attemptNumber > 1 ? "Reenviada" : "Enviada";
}

export function getWhatsAppDeliveryStatusDetail(status: WhatsAppDeliveryStatus) {
  if (status === "accepted") {
    return "Meta aceptó la solicitud de envío.";
  }

  if (status === "sent") {
    return "Meta procesó el envío.";
  }

  if (status === "delivered") {
    return "El mensaje llegó al teléfono.";
  }

  if (status === "read") {
    return "El mensaje fue leído.";
  }

  return "Meta informó un fallo en el envío.";
}

export function mapWhatsAppDeliveryAttemptRowToState(row: WhatsAppDeliveryAttemptRow): WhatsAppDeliveryState {
  return {
    messageId: row.message_id,
    attemptNumber: row.attempt_number,
    currentStatus: row.delivery_status,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at ?? undefined,
    sentAt: row.sent_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    failureCode: row.failure_code ?? undefined,
    failureMessage: row.failure_message ?? undefined,
  };
}

export function buildWhatsAppDeliveryStateIndex(rows: WhatsAppDeliveryAttemptRow[]) {
  const latestByGuestId = new Map<string, WhatsAppDeliveryState>();

  for (const row of rows) {
    if (row.deleted_at) {
      continue;
    }

    const nextState = mapWhatsAppDeliveryAttemptRowToState(row);
    const currentState = latestByGuestId.get(row.guest_id);

    if (
      !currentState ||
      nextState.attemptNumber > currentState.attemptNumber ||
      (nextState.attemptNumber === currentState.attemptNumber && nextState.updatedAt > currentState.updatedAt)
    ) {
      latestByGuestId.set(row.guest_id, nextState);
    }
  }

  return latestByGuestId;
}

export function getInitialWhatsAppDeliveryHistory(state: WhatsAppDeliveryState): WhatsAppDeliveryHistoryEntry[] {
  const history: WhatsAppDeliveryHistoryEntry[] = [];

  if (state.acceptedAt) {
    history.push({
      status: "accepted",
      timestamp: state.acceptedAt,
      detail: getWhatsAppDeliveryStatusDetail("accepted"),
    });
  }

  if (state.sentAt) {
    history.push({
      status: "sent",
      timestamp: state.sentAt,
      detail: getWhatsAppDeliveryStatusDetail("sent"),
    });
  }

  if (state.deliveredAt) {
    history.push({
      status: "delivered",
      timestamp: state.deliveredAt,
      detail: getWhatsAppDeliveryStatusDetail("delivered"),
    });
  }

  if (state.readAt) {
    history.push({
      status: "read",
      timestamp: state.readAt,
      detail: getWhatsAppDeliveryStatusDetail("read"),
    });
  }

  if (state.failedAt) {
    history.push({
      status: "failed",
      timestamp: state.failedAt,
      detail: state.failureMessage || getWhatsAppDeliveryStatusDetail("failed"),
      code: state.failureCode,
    });
  }

  return history;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoFromMetaTimestamp(timestamp?: string) {
  const seconds = Number(timestamp);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return new Date().toISOString();
  }

  return new Date(seconds * 1000).toISOString();
}

export function collectWhatsAppDeliveryWebhookStatuses(payload: unknown): WhatsAppDeliveryWebhookStatus[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const entries = Array.isArray((payload as { entry?: unknown }).entry) ? ((payload as { entry: unknown[] }).entry ?? []) : [];
  const updates: WhatsAppDeliveryWebhookStatus[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const changes = Array.isArray((entry as { changes?: unknown }).changes) ? ((entry as { changes: unknown[] }).changes ?? []) : [];

    for (const change of changes) {
      if (!change || typeof change !== "object") {
        continue;
      }

      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") {
        continue;
      }

      const statuses = Array.isArray((value as { statuses?: unknown }).statuses)
        ? ((value as { statuses: unknown[] }).statuses ?? [])
        : [];

      for (const status of statuses) {
        if (!status || typeof status !== "object") {
          continue;
        }

        const messageId = readString((status as { id?: unknown }).id);
        const statusName = readString((status as { status?: unknown }).status) as WhatsAppDeliveryStatus;
        const timestamp = readString((status as { timestamp?: unknown }).timestamp);

        if (!messageId || !isWhatsAppDeliveryStatus(statusName)) {
          continue;
        }

        const errors = Array.isArray((status as { errors?: unknown }).errors) ? ((status as { errors: Array<Record<string, unknown>> }).errors ?? []) : [];
        const firstError = errors[0] ?? null;
        const errorData = firstError && typeof firstError === "object" ? (firstError.error_data as Record<string, unknown> | undefined) : undefined;

        updates.push({
          messageId,
          status: statusName,
          timestamp: timestamp ? toIsoFromMetaTimestamp(timestamp) : new Date().toISOString(),
          recipientId: readString((status as { recipient_id?: unknown }).recipient_id) || undefined,
          errorCode: firstError && typeof firstError.code !== "undefined" ? String(firstError.code) : undefined,
          errorMessage: firstError && typeof firstError.title === "string" ? firstError.title : undefined,
          errorDetails: errorData && typeof errorData.details === "string" ? errorData.details : undefined,
        });
      }
    }
  }

  return updates;
}

function readStatusTimestamp(row: WhatsAppDeliveryAttemptRow, status: WhatsAppDeliveryStatus) {
  if (status === "accepted") {
    return row.accepted_at;
  }

  if (status === "sent") {
    return row.sent_at;
  }

  if (status === "delivered") {
    return row.delivered_at;
  }

  if (status === "read") {
    return row.read_at;
  }

  return row.failed_at;
}

function nextStatusTimestampKey(status: WhatsAppDeliveryStatus) {
  if (status === "accepted") {
    return "accepted_at";
  }

  if (status === "sent") {
    return "sent_at";
  }

  if (status === "delivered") {
    return "delivered_at";
  }

  if (status === "read") {
    return "read_at";
  }

  return "failed_at";
}

function parseStatusHistory(rows: WhatsAppDeliveryAttemptRow) {
  const history = Array.isArray(rows.status_history) ? rows.status_history : [];
  return history.filter((entry): entry is WhatsAppDeliveryHistoryEntry => Boolean(entry && typeof entry === "object" && "status" in entry && "timestamp" in entry));
}

function hasStatusHistoryEntry(history: WhatsAppDeliveryHistoryEntry[], nextEntry: WhatsAppDeliveryHistoryEntry) {
  return history.some(
    (entry) =>
      entry.status === nextEntry.status &&
      entry.timestamp === nextEntry.timestamp &&
      entry.detail === nextEntry.detail &&
      entry.code === nextEntry.code,
  );
}

export function applyWhatsAppDeliveryWebhookStatus(
  row: WhatsAppDeliveryAttemptRow,
  update: WhatsAppDeliveryWebhookStatus,
) {
  const currentRank = WHATSAPP_DELIVERY_STATUS_ORDER[row.delivery_status];
  const nextRank = WHATSAPP_DELIVERY_STATUS_ORDER[update.status];

  if (row.delivery_status === "failed" && update.status !== "failed") {
    return { row, changed: false };
  }

  if (row.delivery_status === "failed" && update.status === "failed") {
    return { row, changed: false };
  }

  if (update.status === "failed" && (row.delivery_status === "delivered" || row.delivery_status === "read")) {
    return { row, changed: false };
  }

  if (update.status !== "failed" && nextRank <= currentRank) {
    return { row, changed: false };
  }

  const history = parseStatusHistory(row);
  const detail =
    update.status === "failed"
      ? update.errorMessage || getWhatsAppDeliveryStatusDetail("failed")
      : getWhatsAppDeliveryStatusDetail(update.status);
  const nextHistoryEntry: WhatsAppDeliveryHistoryEntry = {
    status: update.status,
    timestamp: update.timestamp,
    detail,
    ...(update.errorCode ? { code: update.errorCode } : {}),
  };

  const nextHistory = hasStatusHistoryEntry(history, nextHistoryEntry) ? history : [...history, nextHistoryEntry];
  const nextTimestampKey = nextStatusTimestampKey(update.status);

  return {
    changed: true,
    row: {
      ...row,
      delivery_status: update.status,
      status_history: nextHistory,
      [nextTimestampKey]: readStatusTimestamp(row, update.status) ?? update.timestamp,
      ...(update.status === "accepted" && !row.accepted_at ? { accepted_at: update.timestamp } : {}),
      ...(update.status === "sent" && !row.sent_at ? { sent_at: update.timestamp } : {}),
      ...(update.status === "delivered" && !row.delivered_at ? { delivered_at: update.timestamp } : {}),
      ...(update.status === "read" && !row.read_at ? { read_at: update.timestamp } : {}),
      ...(update.status === "failed"
        ? {
            failed_at: row.failed_at ?? update.timestamp,
            failure_code: update.errorCode ?? row.failure_code ?? null,
            failure_message: update.errorMessage ?? row.failure_message ?? null,
            failure_details:
              update.errorDetails
                ? {
                    ...(row.failure_details && typeof row.failure_details === "object" ? row.failure_details : {}),
                    details: update.errorDetails,
                  }
                : row.failure_details,
          }
        : {}),
    },
  } as const;
}
