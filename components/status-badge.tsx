import type { ReactNode } from "react";

export default function StatusBadge({
  variant,
  children,
}: {
  variant: "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const variantClasses = {
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-200",
    info: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  }[variant];

  return (
    <span
      className={[
        "context-chip",
        variantClasses,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
