"use client";

import StatusBadge from "@/components/status-badge";
import type { InvitationDesign } from "@/features/access/domain/access-domain";
import AccessQrCode from "@/features/access/components/access-qr-code";

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

  return (
    <article
      className={[
        "aspect-[9/16] w-full overflow-hidden rounded-[1.75rem] border",
        modeClasses(mode),
        className,
      ].join(" ")}
    >
      <div className={`flex h-full flex-col bg-gradient-to-b ${palette.glow}`}>
        <div className={["flex items-start justify-between gap-4 px-5 pt-5", isPrint ? "text-slate-900" : "text-white"].join(" ")}>
          <div className="min-w-0">
            <p className={["text-[10px] font-semibold uppercase tracking-[0.36em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
              Acceso privado
            </p>
            <p className={["mt-1 text-lg font-medium", isPrint ? "text-slate-700" : "text-slate-300"].join(" ")}>
              {invitation.venueName ?? invitation.eventName}
            </p>
          </div>
          <StatusBadge variant={mode === "print" ? "info" : "success"}>{palette.label}</StatusBadge>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-4">
          <section className={["rounded-[1.6rem] border px-4 py-4", isPrint ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/20"].join(" ")}>
            <p className={["text-[10px] font-semibold uppercase tracking-[0.34em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
              Evento
            </p>
            <p className={["mt-2 text-3xl font-semibold tracking-tight", isPrint ? "text-slate-900" : "text-white"].join(" ")}>
              {invitation.eventName}
            </p>
          </section>

          <section className={["rounded-[1.6rem] border px-4 py-4", isPrint ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.04]"].join(" ")}>
            <p className={["text-[10px] font-semibold uppercase tracking-[0.34em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
              Invitado
            </p>
            <p className={["mt-2 text-2xl font-semibold tracking-tight", isPrint ? "text-slate-900" : "text-white"].join(" ")}>
              {invitation.guestName}
            </p>
          </section>

          <section className={["flex flex-1 flex-col justify-between rounded-[1.6rem] border px-4 py-4", isPrint ? "border-slate-200 bg-white" : "border-dashed border-white/20 bg-white/[0.03]"].join(" ")}>
            <div className="space-y-4">
              <div className={["rounded-[1.35rem] border px-4 py-3", isPrint ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/20"].join(" ")}>
                <p className={["text-[10px] font-semibold uppercase tracking-[0.34em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                  Código de uso único
                </p>
                <p className={["mt-2 text-xl font-semibold tracking-[0.2em]", isPrint ? "text-slate-900" : "text-white"].join(" ")}>
                  {invitation.uniqueCode}
                </p>
              </div>

              <div className="flex justify-center">
                <AccessQrCode value={invitation.qrValue} size={176} />
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className={["text-[10px] font-semibold uppercase tracking-[0.28em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                  QR listo
                </p>
                <p className={["mt-1 text-sm", isPrint ? "text-slate-600" : "text-slate-300"].join(" ")}>
                  Escaneá este código una sola vez.
                </p>
              </div>
              <div className={["rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.24em]", isPrint ? "border-slate-200 bg-white text-slate-500" : "border-white/10 bg-white/[0.04] text-slate-300"].join(" ")}>
                One scan
              </div>
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}
