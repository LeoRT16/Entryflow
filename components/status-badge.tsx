import type { ReactNode } from "react";

export default function StatusBadge({
  variant,
  children,
}: {
  variant: "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const variantClasses = {
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-300",
    info: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  }[variant];

  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        variantClasses,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
