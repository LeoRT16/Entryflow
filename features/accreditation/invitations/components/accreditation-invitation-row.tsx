"use client";

import { useState } from "react";

import StatusBadge from "@/components/status-badge";
import type { AccreditationInvitationOperationalRow } from "../domain/accreditation-invitation-operational";
import AccreditationDeliveryHistory from "./accreditation-delivery-history";
import AccreditationDeliveryStatus from "./accreditation-delivery-status";
import AccreditationSendAction from "./accreditation-send-action";

function Meta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-white">{value}</p>
    </div>
  );
}

export default function AccreditationInvitationRow({
  row,
}: {
  row: AccreditationInvitationOperationalRow;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <article className="rounded-[1.6rem] border border-white/10 bg-[#0d1117] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-lg font-semibold tracking-tight text-white">{row.attendeeName}</h3>
            <StatusBadge variant={row.credentialState === "active" ? "success" : row.credentialState === "revoked" ? "danger" : "warning"}>
              {row.credentialStateLabel}
            </StatusBadge>
            <AccreditationDeliveryStatus state={row.latestDeliveryState} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Meta label="Teléfono" value={row.phone} />
            <Meta label="Categoría" value={row.categoryName || "Sin categoría"} />
            <Meta label="Sector / sala" value={row.sectorName || "Sin sector"} />
            <Meta label="Credencial" value={row.accessCodePresent ? "Cód. emitido" : "Sin código emitido"} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Estado de envío: {row.latestDeliveryLabel}</span>
            {row.latestDeliveryTimestamp ? <span>· {new Date(row.latestDeliveryTimestamp).toLocaleString("es-BO")}</span> : null}
            {row.sendDisabledReason ? <span>· {row.sendDisabledReason}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AccreditationSendAction
            enrollmentId={row.enrollmentId}
            latestDeliveryState={row.latestDeliveryState}
            canSend={row.canSend}
            disabledReason={row.sendDisabledReason}
          />
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            {isOpen ? "Ocultar historial" : `Ver historial (${row.history.length})`}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={row.latestDeliveryTone}>{row.latestDeliveryLabel}</StatusBadge>
            <span className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Intento actual {row.latestAttemptNumber ? `#${row.latestAttemptNumber}` : "sin envío"}
            </span>
          </div>

          <div className="mt-4">
            <AccreditationDeliveryHistory history={row.history} />
          </div>
        </div>
      ) : null}
    </article>
  );
}
