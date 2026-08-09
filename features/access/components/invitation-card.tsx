"use client";

import StatusBadge from "@/components/status-badge";
import type { InvitationDesign } from "@/features/access/domain/access-domain";

export type InvitationCardMode = "preview" | "print" | "download" | "wallet";
export type InvitationCardVariant = NonNullable<InvitationDesign["variant"]>;

type InvitationCardProps = {
  invitation: InvitationDesign;
  mode?: InvitationCardMode;
  className?: string;
};

const variantPalette: Record<InvitationCardVariant, { label: string; accent: string; glow: string }> = {
  general: {
    label: "General",
    accent: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
    glow: "from-cyan-400/16 via-transparent to-transparent",
  },
  vip: {
    label: "VIP",
    accent: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    glow: "from-amber-400/16 via-transparent to-transparent",
  },
  staff: {
    label: "Staff",
    accent: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    glow: "from-emerald-400/16 via-transparent to-transparent",
  },
  media: {
    label: "Media",
    accent: "border-sky-400/20 bg-sky-400/10 text-sky-100",
    glow: "from-sky-400/16 via-transparent to-transparent",
  },
  sponsor: {
    label: "Sponsor",
    accent: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-100",
    glow: "from-fuchsia-400/16 via-transparent to-transparent",
  },
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
  const isWallet = mode === "wallet";

  return (
    <article
      className={[
        "overflow-hidden rounded-[1.75rem] border",
        modeClasses(mode),
        isWallet ? "max-w-md" : "",
        className,
      ].join(" ")}
    >
      <div className={`bg-gradient-to-br ${palette.glow} px-4 py-4 ${isPrint ? "border-b border-slate-200" : "border-b border-white/10"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={[
                "flex h-11 w-11 items-center justify-center rounded-2xl border text-xs font-semibold uppercase tracking-[0.24em]",
                isPrint ? "border-slate-200 bg-slate-100 text-slate-900" : "border-white/10 bg-white/[0.08] text-white",
              ].join(" ")}
            >
              {invitation.logoLabel ?? invitation.eventName.slice(0, 2)}
            </div>
            <div>
              <p className={["text-[10px] font-semibold uppercase tracking-[0.32em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                {invitation.theme ?? "Invitation Designer"}
              </p>
              <p className={["mt-1 text-sm font-medium", isPrint ? "text-slate-700" : "text-slate-300"].join(" ")}>
                {invitation.artLabel ?? "Vista premium"}
              </p>
            </div>
          </div>
          <StatusBadge variant={mode === "print" ? "info" : "success"}>{palette.label}</StatusBadge>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className={["rounded-[1.5rem] border p-4", isPrint ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/20"].join(" ")}>
              <p className={["text-[10px] font-semibold uppercase tracking-[0.28em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                Evento
              </p>
              <p className={["mt-2 text-2xl font-semibold tracking-tight", isPrint ? "text-slate-900" : "text-white"].join(" ")}>
                {invitation.eventName}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge variant={isPrint ? "info" : "success"}>{invitation.date}</StatusBadge>
                <StatusBadge variant={isPrint ? "info" : "warning"}>{invitation.time}</StatusBadge>
                {invitation.tableName ? <StatusBadge variant={isPrint ? "info" : "success"}>{invitation.tableName}</StatusBadge> : null}
                {invitation.zoneName ? <StatusBadge variant={isPrint ? "info" : "warning"}>{invitation.zoneName}</StatusBadge> : null}
              </div>
            </div>

            <div className={["rounded-[1.5rem] border p-4", isPrint ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.04]"].join(" ")}>
              <p className={["text-[10px] font-semibold uppercase tracking-[0.28em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>
                Invitado
              </p>
              <p className={["mt-2 text-xl font-semibold tracking-tight", isPrint ? "text-slate-900" : "text-white"].join(" ")}>
                {invitation.guestName}
              </p>
              <p className={["mt-1 text-sm", isPrint ? "text-slate-600" : "text-slate-400"].join(" ")}>
                {invitation.reservationName} · {invitation.reservationCode}
              </p>
            </div>
          </div>

          <div className={["rounded-[1.5rem] border p-4", isPrint ? "border-slate-200 bg-slate-50" : "border-dashed border-white/15 bg-white/[0.03]"].join(" ")}>
            <div className="flex h-full flex-col justify-between gap-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <MetaLine label="Código único" value={invitation.uniqueCode} isPrint={isPrint} />
                <MetaLine label="Tema" value={palette.label} isPrint={isPrint} />
                <MetaLine label="Dress code" value={invitation.dressCode ?? "Elegante oscuro"} isPrint={isPrint} />
                <MetaLine label="QR" value="Listo" isPrint={isPrint} />
              </div>

              <div className="flex flex-col items-center gap-3 rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-5">
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.from({ length: 24 }).map((_, index) => (
                    <span
                      key={index}
                      className={[
                        "h-2.5 w-2.5 rounded-[0.15rem]",
                        (index + invitation.uniqueCode.length) % 3 === 0
                          ? "bg-cyan-400"
                          : (index + invitation.uniqueCode.length) % 2 === 0
                            ? "bg-white"
                            : "bg-white/30",
                      ].join(" ")}
                    />
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">QR</p>
                  <p className="mt-1 text-sm text-slate-300">Uso único · {invitation.qrValue}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={["flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm", isPrint ? "border-t border-slate-200 text-slate-500" : "border-t border-white/10 text-slate-400"].join(" ")}>
        <span>{invitation.reservationName}</span>
        <span>{invitation.variant ?? "general"}</span>
      </div>
    </article>
  );
}

function MetaLine({ label, value, isPrint }: { label: string; value: string; isPrint: boolean }) {
  return (
    <div className={["rounded-2xl border px-3 py-2", isPrint ? "border-slate-200 bg-white" : "border-white/10 bg-white/[0.03]"].join(" ")}>
      <p className={["text-[10px] font-semibold uppercase tracking-[0.28em]", isPrint ? "text-slate-500" : "text-slate-400"].join(" ")}>{label}</p>
      <p className={["mt-1 text-sm font-medium", isPrint ? "text-slate-900" : "text-white"].join(" ")}>{value}</p>
    </div>
  );
}
