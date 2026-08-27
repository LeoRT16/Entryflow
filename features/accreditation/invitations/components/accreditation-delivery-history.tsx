import type { AccreditationInvitationOperationalHistoryEntry } from "../domain/accreditation-invitation-operational";
import AccreditationDeliveryStatus from "./accreditation-delivery-status";

function formatTimestamp(timestamp: string) {
  try {
    return new Intl.DateTimeFormat("es-BO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

export default function AccreditationDeliveryHistory({
  history,
}: {
  history: AccreditationInvitationOperationalHistoryEntry[];
}) {
  if (!history.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-slate-500">
        Sin historial de envío todavía.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <article key={`${entry.attemptNumber}-${entry.messageId}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                Intento #{entry.attemptNumber}
              </p>
              <p className="mt-1 text-sm font-medium text-white">{formatTimestamp(entry.timestamp)}</p>
            </div>
            <AccreditationDeliveryStatus state={entry.status} />
          </div>

          <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <Meta label="Destinatario" value={entry.recipient} />
            <Meta label="Estado" value={entry.statusLabel} />
            <Meta label="Operador" value={entry.operatorDisplayName || "No disponible"} />
            <Meta label="Message ID" value={entry.messageId} />
          </div>

          {entry.errorSummary ? (
            <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
              {entry.errorSummary}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-white">{value}</p>
    </div>
  );
}
