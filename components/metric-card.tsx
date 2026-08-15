export default function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses = {
    success: "border-emerald-400/20 bg-emerald-400/5 text-emerald-300",
    warning: "border-amber-400/20 bg-amber-400/5 text-amber-300",
    danger: "border-rose-400/20 bg-rose-400/5 text-rose-300",
    info: "border-sky-400/20 bg-sky-400/5 text-sky-300",
  }[tone];
  const toneLabels = {
    success: "Correcto",
    warning: "Pendiente",
    danger: "Incidencia",
    info: "Información",
  }[tone];

  return (
    <section className="surface-panel min-w-0 p-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="kicker">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>

        <span
          className={[
            "inline-flex shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]",
            toneClasses,
          ].join(" ")}
        >
          {toneLabels}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-400">{detail}</p>
    </section>
  );
}
