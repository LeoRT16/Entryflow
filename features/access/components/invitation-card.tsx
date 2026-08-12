"use client";

import StatusBadge from "@/components/status-badge";
import type { InvitationDesign } from "@/features/access/domain/access-domain";
import AccessQrCode from "@/features/access/components/access-qr-code";
import { buildInvitationComposition } from "@/features/access/domain/invitation-rendering";

export type InvitationCardMode = "preview" | "print" | "download" | "wallet";
export type InvitationCardVariant = NonNullable<InvitationDesign["variant"]>;

type InvitationCardProps = {
  invitation: InvitationDesign;
  mode?: InvitationCardMode;
  className?: string;
};

const variantPalette: Record<InvitationCardVariant, { label: string; glow: string }> = {
  general: { label: "General", glow: "from-cyan-400/20 via-transparent to-transparent" },
  vip: { label: "VIP", glow: "from-amber-400/20 via-transparent to-transparent" },
  staff: { label: "Staff", glow: "from-emerald-400/20 via-transparent to-transparent" },
  media: { label: "Media", glow: "from-sky-400/20 via-transparent to-transparent" },
  sponsor: { label: "Sponsor", glow: "from-fuchsia-400/20 via-transparent to-transparent" },
};

function modeClasses(mode: InvitationCardMode) {
  if (mode === "print") {
    return "bg-white text-slate-950 border-slate-200 shadow-[0_18px_70px_rgba(0,0,0,0.18)]";
  }

  if (mode === "download") {
    return "bg-[#07111b] text-white border-white/10 shadow-[0_24px_90px_rgba(0,0,0,0.42)]";
  }

  if (mode === "wallet") {
    return "bg-[#09101a] text-white border-white/10 shadow-[0_24px_90px_rgba(0,0,0,0.42)]";
  }

  return "bg-[#0b111a] text-white border-white/10 shadow-[0_24px_90px_rgba(0,0,0,0.42)]";
}

export default function InvitationCard({ invitation, mode = "preview", className = "" }: InvitationCardProps) {
  const palette = variantPalette[invitation.variant ?? "general"];
  const isPrint = mode === "print";
  const composition = buildInvitationComposition(invitation, mode);
  const data = composition.data;
  const locationLabel = data.venueName ?? data.eventName;
  const resourceLabel = data.tableName ?? data.zoneName ?? data.reservationName;
  const details = [
    { label: "Fecha", value: data.date },
    { label: "Hora", value: data.time },
    { label: "Lugar", value: locationLabel },
    { label: "Recurso", value: resourceLabel },
  ];

  return (
    <article
      className={[
        "relative aspect-[9/16] w-full overflow-hidden rounded-[2.5rem] border",
        modeClasses(mode),
        className,
      ].join(" ")}
      data-composition-mode={composition.template.mode}
      data-composition-variant={composition.template.variant}
      data-composition-width={composition.template.width}
      data-composition-height={composition.template.height}
    >
      <div className={`absolute inset-0 bg-gradient-to-b ${palette.glow}`} />
      <div className={["absolute inset-0 opacity-70", isPrint ? "bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.2),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.12),_transparent_32%)]" : "bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.18),_transparent_30%)]"].join(" ")} />

      <div className="relative flex h-full flex-col">
        <div className={["flex items-start justify-between gap-4 px-8 pt-8", isPrint ? "text-slate-900" : "text-white"].join(" ")}>
          <div className="min-w-0">
            <p className={["text-[10px] font-semibold uppercase tracking-[0.42em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
              EntryFlow Invitation
            </p>
            <p className={["mt-2 text-[15px] font-medium uppercase tracking-[0.26em]", isPrint ? "text-slate-700" : "text-slate-300"].join(" ")}>
              {locationLabel}
            </p>
          </div>
          <StatusBadge variant={mode === "print" ? "info" : "success"}>{palette.label}</StatusBadge>
        </div>

        <div className="relative flex flex-1 flex-col px-8 pb-8 pt-6">
          <section className={["rounded-[2rem] border px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)]", isPrint ? "border-slate-200 bg-white" : "border-white/10 bg-black/20 backdrop-blur-sm"].join(" ")}>
            <p className={["text-[10px] font-semibold uppercase tracking-[0.36em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
              Evento
            </p>
            <h1 className={["mt-3 text-[38px] font-semibold leading-[0.96] tracking-tight sm:text-[44px]", isPrint ? "text-slate-950" : "text-white"].join(" ")}>
              {data.eventName}
            </h1>
            <p className={["mt-3 text-[20px] leading-snug", isPrint ? "text-slate-600" : "text-slate-300"].join(" ")}>
              {data.reservationName}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className={["rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em]", isPrint ? "border-slate-200 bg-slate-50 text-slate-500" : "border-white/10 bg-white/[0.04] text-slate-200"].join(" ")}>
                {data.accessTypeLabel}
              </span>
              <span className={["rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em]", isPrint ? "border-slate-200 bg-slate-50 text-slate-500" : "border-white/10 bg-white/[0.04] text-slate-200"].join(" ")}>
                Uso único
              </span>
            </div>
          </section>

          <section className="mt-6 grid gap-6">
            <div className={["rounded-[2rem] border px-6 py-5", isPrint ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.04]"].join(" ")}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className={["text-[10px] font-semibold uppercase tracking-[0.36em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                    Código de uso único
                  </p>
                  <p className={["mt-3 truncate text-[26px] font-semibold tracking-[0.24em] sm:text-[30px]", isPrint ? "text-slate-950" : "text-white"].join(" ")}>
                    {data.uniqueCode}
                  </p>
                </div>

                <div className={["rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em]", isPrint ? "border-slate-200 bg-white text-slate-500" : "border-white/10 bg-black/20 text-slate-200"].join(" ")}>
                  QR listo
                </div>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[auto_1fr] xl:items-center">
                <div className="mx-auto flex w-full max-w-[360px] justify-center">
                  <AccessQrCode value={data.qrToken} size={320} />
                </div>

                <div className="space-y-3">
                  <div className={["rounded-[1.5rem] border px-4 py-4", isPrint ? "border-slate-200 bg-white" : "border-white/10 bg-black/20"].join(" ")}>
                    <p className={["text-[10px] font-semibold uppercase tracking-[0.34em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                      Invitado
                    </p>
                    <p className={["mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]", isPrint ? "text-slate-950" : "text-white"].join(" ")}>
                      {data.guestName}
                    </p>
                  </div>

                  <div className={["rounded-[1.5rem] border px-4 py-4", isPrint ? "border-slate-200 bg-white" : "border-white/10 bg-black/20"].join(" ")}>
                    <p className={["text-[10px] font-semibold uppercase tracking-[0.34em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                      Uso
                    </p>
                    <p className={["mt-2 text-base font-medium leading-relaxed", isPrint ? "text-slate-600" : "text-slate-200"].join(" ")}>
                      Escaneá este código una sola vez.
                    </p>
                    <p className={["mt-3 text-sm leading-relaxed", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                      La captura de pantalla no garantiza el ingreso.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <section className={["rounded-[2rem] border px-6 py-5", isPrint ? "border-slate-200 bg-white" : "border-white/10 bg-black/20"].join(" ")}>
              <p className={["text-[10px] font-semibold uppercase tracking-[0.36em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                Detalles
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {details.map((detail) => (
                  <div
                    key={detail.label}
                    className={["rounded-[1.25rem] border px-4 py-3", isPrint ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.03]"].join(" ")}
                  >
                    <p className={["text-[10px] font-semibold uppercase tracking-[0.32em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                      {detail.label}
                    </p>
                    <p className={["mt-2 text-sm font-medium", isPrint ? "text-slate-950" : "text-white"].join(" ")}>
                      {detail.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <div className="mt-6 flex items-end justify-between gap-3 px-2">
            <div>
              <p className={["text-[10px] font-semibold uppercase tracking-[0.36em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                Lista para compartir
              </p>
              <p className={["mt-2 max-w-[32rem] text-sm leading-relaxed", isPrint ? "text-slate-600" : "text-slate-300"].join(" ")}>
                {data.theme ?? "Pieza vertical lista para entrega y validación operativa."}
              </p>
            </div>
            <div className={["rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em]", isPrint ? "border-slate-200 bg-white text-slate-500" : "border-white/10 bg-white/[0.04] text-slate-200"].join(" ")}>
              {data.variant.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
