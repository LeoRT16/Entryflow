import type { AccreditationInvitationOperationalReadModel } from "../domain/accreditation-invitation-operational";
import AccreditationInvitationRow from "./accreditation-invitation-row";

function SummaryCard({
  label,
  value,
  tone = "info",
}: {
  label: string;
  value: number | string;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses = {
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-50",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-50",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-50",
    info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-50",
  }[tone];

  return (
    <div className={`rounded-[1.5rem] border p-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export default function AccreditationInvitationBoard({
  model,
}: {
  model: AccreditationInvitationOperationalReadModel;
}) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Inscripciones" value={model.summary.total} tone="info" />
        <SummaryCard label="Sin enviar" value={model.summary.neverSent} tone="warning" />
        <SummaryCard label="Reenviables" value={model.summary.sendable} tone="success" />
        <SummaryCard label="Fallidas" value={model.summary.failed} tone="danger" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Aceptadas" value={model.summary.accepted} />
        <SummaryCard label="Enviadas" value={model.summary.sent} />
        <SummaryCard label="Entregadas" value={model.summary.delivered} tone="success" />
        <SummaryCard label="Revocadas" value={model.summary.revoked} tone="danger" />
      </div>

      {model.rows.length ? (
        <div className="space-y-3">
          {model.rows.map((row) => (
            <AccreditationInvitationRow key={row.enrollmentId} row={row} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Sin inscripciones</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">No encontramos inscripciones de acreditación para este evento.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Cuando cargues inscritos y accesos, aparecerán aquí con su estado de envío y su historial de WhatsApp.
          </p>
        </div>
      )}
    </section>
  );
}
