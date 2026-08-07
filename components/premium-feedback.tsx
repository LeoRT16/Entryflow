"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "warning" | "error" | "info";
type ConfirmTone = "success" | "warning" | "danger" | "info";
type EmptyStateIcon = "calendar" | "search" | "spark" | "inbox" | "user" | "alert" | "check";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
};

type ConfirmInput = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
};

type ToastItem = Required<Pick<ToastInput, "title">> &
  Pick<ToastInput, "description" | "tone"> & {
    id: string;
  };

type FeedbackContextValue = {
  showToast: (toast: ToastInput) => void;
  confirm: (input: ConfirmInput) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const toastToneStyles: Record<ToastTone, { wrap: string; icon: string }> = {
  success: {
    wrap: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    icon: "bg-emerald-400/20 text-emerald-100",
  },
  warning: {
    wrap: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    icon: "bg-amber-400/20 text-amber-100",
  },
  error: {
    wrap: "border-rose-400/20 bg-rose-400/10 text-rose-100",
    icon: "bg-rose-400/20 text-rose-100",
  },
  info: {
    wrap: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
    icon: "bg-cyan-400/20 text-cyan-100",
  },
};

const confirmToneStyles: Record<ConfirmTone, { button: string; accent: string }> = {
  success: {
    button: "border-emerald-400/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15",
    accent: "text-emerald-200",
  },
  warning: {
    button: "border-amber-400/25 bg-amber-400/10 text-amber-50 hover:bg-amber-400/15",
    accent: "text-amber-200",
  },
  danger: {
    button: "border-rose-400/25 bg-rose-400/10 text-rose-50 hover:bg-rose-400/15",
    accent: "text-rose-200",
  },
  info: {
    button: "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15",
    accent: "text-cyan-200",
  },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmInput | null>(null);
  const timersRef = useRef<Record<string, number>>({});
  const idRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    const timer = timersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timersRef.current[id];
    }
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = `toast-${++idRef.current}`;
      const nextToast: ToastItem = {
        id,
        title: toast.title,
        description: toast.description,
        tone: toast.tone ?? "info",
      };

      setToasts((current) => [...current, nextToast]);

      timersRef.current[id] = window.setTimeout(() => {
        removeToast(id);
      }, toast.duration ?? 3600);
    },
    [removeToast],
  );

  const confirm = useCallback((input: ConfirmInput) => {
    setConfirmState(input);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      showToast,
      confirm,
    }),
    [showToast, confirm],
  );

  return (
    <FeedbackContext.Provider value={contextValue}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
      {confirmState ? (
        <ConfirmDialog
          input={confirmState}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            confirmState.onConfirm();
            setConfirmState(null);
          }}
        />
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);

  if (!context) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }

  return context;
}

export function SkeletonBlock({
  className = "",
  rounded = "rounded-[1.5rem]",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden border border-white/10 bg-white/[0.04]",
        rounded,
        className,
      ].join(" ")}
    >
      <div className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] motion-safe:animate-[shimmer_1.6s_infinite]" />
    </div>
  );
}

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <SkeletonBlock rounded="rounded-full" className={className} />;
}

export function SkeletonStack({
  count,
  className = "",
  itemClassName = "",
}: {
  count: number;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock key={index} className={itemClassName} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  icon: EmptyStateIcon;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
}) {
  return (
    <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300">
        <EmptyIcon icon={icon} />
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
      {primaryAction || secondaryAction ? (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {primaryAction ? (
            <Link
              href={primaryAction.href}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              {primaryAction.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions removals"
      className="fixed right-4 top-4 z-[80] flex w-[min(100vw-2rem,24rem)] flex-col gap-3 sm:right-6 sm:top-6"
    >
      {toasts.map((toast) => {
        const tone = toastToneStyles[toast.tone ?? "info"];

        return (
          <div
            key={toast.id}
            role="status"
            className={[
              "rounded-[1.35rem] border p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur",
              tone.wrap,
            ].join(" ")}
            style={{ animation: "toastIn 180ms ease" }}
          >
            <div className="flex items-start gap-3">
              <div className={[
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]",
                tone.icon,
              ].join(" ")}>
                {toast.tone === "success"
                  ? "✓"
                  : toast.tone === "warning"
                    ? "!"
                    : toast.tone === "error"
                      ? "×"
                      : "i"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-1 text-sm leading-6 text-slate-300">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white transition hover:bg-white/[0.1]"
                aria-label="Cerrar notificación"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog({
  input,
  onCancel,
  onConfirm,
}: {
  input: ConfirmInput;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  const tone = confirmToneStyles[input.tone ?? "info"];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
        aria-label="Cerrar confirmación"
        onClick={onCancel}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.45)] outline-none"
        style={{ animation: "dialogIn 180ms ease" }}
      >
        <div className="flex items-start gap-4">
          <div className={[
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg font-semibold",
            tone.button,
          ].join(" ")}>
            !
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Confirmación
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {input.title}
            </h3>
            {input.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-400">{input.description}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            {input.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition",
              tone.button,
            ].join(" ")}
          >
            {input.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyIcon({ icon }: { icon: EmptyStateIcon }) {
  const common = "h-5 w-5";

  if (icon === "search") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12.5 12.5 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "calendar") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <rect x="3.5" y="4.5" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 3.5v3M14 3.5v3M3.5 8h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "spark") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="M10 3l1.7 4.3L16 9l-4.3 1.7L10 15l-1.7-4.3L4 9l4.3-1.7L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "inbox") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="M3.5 10.5 5.5 4.5h9L16.5 10.5H13l-1.5 2h-3l-1.5-2H3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "alert") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="M10 4.2 17 16H3L10 4.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M10 7.4v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13.5" r="0.9" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "check") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="m5.5 10 3 3 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
      <circle cx="10" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 16c1.6-2.4 3.6-3.5 6-3.5s4.4 1.1 6 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export type { ConfirmInput, ConfirmTone, EmptyStateIcon, ToastInput, ToastTone };
