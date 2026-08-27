import StatusBadge from "@/components/status-badge";
import type { AccreditationEventProfile } from "@/features/accreditation/events";

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export default function AccreditationEventProfileCard({
  profile,
}: {
  profile: AccreditationEventProfile;
}) {
  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Perfil del evento</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{profile.eventName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge variant="info">{profile.eventTypeLabel}</StatusBadge>
            <StatusBadge variant="warning">{profile.operationalModelLabel}</StatusBadge>
            <StatusBadge variant="success">{profile.venueLabel}</StatusBadge>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
            {profile.scheduleLabel}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:w-[28rem]">
          <SummaryTile label="Participantes" value={profile.participantCount} />
          <SummaryTile label="Activos" value={profile.activeParticipantCount} />
          <SummaryTile label="Cancelados" value={profile.cancelledParticipantCount} />
        </div>
      </div>
    </section>
  );
}
