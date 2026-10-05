export default function LiveSummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="min-w-0 flex-1 break-words text-right text-sm font-medium text-white">{value}</p>
    </div>
  );
}
