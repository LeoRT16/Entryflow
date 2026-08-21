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
type NotificationTone = "success" | "warning" | "danger" | "info";
type NotificationIcon = EmptyStateIcon | "bell" | "reservation" | "guest" | "table" | "checkin";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
};

type NotificationAction = {
  label: string;
  tone?: NotificationTone;
  href?: string;
  onSelect?: () => void;
};

type NotificationUndo = {
  label?: string;
  timeoutMs?: number;
  onUndo: () => void;
};

type NotificationInput = {
  title: string;
  description?: string;
  tone?: NotificationTone;
  icon?: NotificationIcon;
  href?: string;
  actions?: NotificationAction[];
  undo?: NotificationUndo;
  read?: boolean;
};

type ConfirmInput = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel?: () => void;
};

type ToastItem = Required<Pick<ToastInput, "title">> &
  Pick<ToastInput, "description" | "tone"> & {
    id: string;
  };

type NotificationItem = Required<Pick<NotificationInput, "title">> &
  Pick<NotificationInput, "description" | "tone" | "icon" | "href" | "actions" | "undo"> & {
    id: string;
    time: string;
    read: boolean;
  };

type FeedbackContextValue = {
  showToast: (toast: ToastInput) => void;
  confirm: (input: ConfirmInput) => void;
  notifications: NotificationItem[];
  unreadNotifications: number;
  notify: (notification: NotificationInput) => string;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
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

const notificationToneStyles: Record<NotificationTone, { wrap: string; icon: string; accent: string }> = {
  success: {
    wrap: "border-emerald-400/20 bg-emerald-400/10 text-emerald-50",
    icon: "border-emerald-400/20 bg-emerald-400/15 text-emerald-100",
    accent: "text-emerald-200",
  },
  warning: {
    wrap: "border-amber-400/20 bg-amber-400/10 text-amber-50",
    icon: "border-amber-400/20 bg-amber-400/15 text-amber-100",
    accent: "text-amber-200",
  },
  danger: {
    wrap: "border-rose-400/20 bg-rose-400/10 text-rose-50",
    icon: "border-rose-400/20 bg-rose-400/15 text-rose-100",
    accent: "text-rose-200",
  },
  info: {
    wrap: "border-cyan-400/20 bg-cyan-400/10 text-cyan-50",
    icon: "border-cyan-400/20 bg-cyan-400/15 text-cyan-100",
    accent: "text-cyan-200",
  },
};

function createTimeStamp() {
  return new Date().toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmInput | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});
  const notificationTimersRef = useRef<Record<string, number>>({});
  const idRef = useRef(0);
  const notificationIdRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    const timer = timersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timersRef.current[id];
    }
  }, []);

  const clearNotificationUndoTimer = useCallback((id: string) => {
    const timer = notificationTimersRef.current[id];

    if (timer) {
      window.clearTimeout(timer);
      delete notificationTimersRef.current[id];
    }
  }, []);

  const updateNotification = useCallback((id: string, updater: (item: NotificationItem) => NotificationItem | null) => {
    setNotifications((current) =>
      current
        .map((notification) => {
          if (notification.id !== id) {
            return notification;
          }

          return updater(notification);
        })
        .filter((notification): notification is NotificationItem => Boolean(notification)),
    );
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    updateNotification(id, (item) => (item.read ? item : { ...item, read: true }));
  }, [updateNotification]);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);

    Object.values(notificationTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    notificationTimersRef.current = {};
  }, []);

  const notify = useCallback(
    (notification: NotificationInput) => {
      const id = `notification-${++notificationIdRef.current}`;
      const nextNotification: NotificationItem = {
        id,
        title: notification.title,
        description: notification.description,
        tone: notification.tone ?? "info",
        icon: notification.icon ?? "bell",
        href: notification.href,
        actions: notification.actions,
        undo: notification.undo,
        read: notification.read ?? false,
        time: createTimeStamp(),
      };

      setNotifications((current) => [nextNotification, ...current].slice(0, 40));

      if (notification.undo) {
        notificationTimersRef.current[id] = window.setTimeout(() => {
          updateNotification(id, (item) => {
            if (!item.undo) {
              return item;
            }

            return {
              ...item,
              undo: undefined,
            };
          });
          clearNotificationUndoTimer(id);
        }, notification.undo.timeoutMs ?? 6000);
      }

      return id;
    },
    [clearNotificationUndoTimer, updateNotification],
  );

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

      notify({
        title: toast.title,
        description: toast.description,
        tone: toast.tone === "error" ? "danger" : toast.tone,
        icon: toast.tone === "success" ? "check" : toast.tone === "warning" || toast.tone === "error" ? "alert" : "bell",
      });
    },
    [notify, removeToast],
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
      notifications,
      unreadNotifications: notifications.filter((notification) => !notification.read).length,
      notify,
      markNotificationRead,
      markAllNotificationsRead,
      clearNotifications,
    }),
    [clearNotifications, confirm, markAllNotificationsRead, markNotificationRead, notifications, notify, showToast],
  );

  return (
    <FeedbackContext.Provider value={contextValue}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
      {confirmState ? (
        <ConfirmDialog
          input={confirmState}
          onCancel={() => {
            confirmState.onCancel?.();
            setConfirmState(null);
          }}
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

function getNotificationToneClass(tone: NotificationTone) {
  return notificationToneStyles[tone];
}

function NotificationIcon({ icon }: { icon: NotificationIcon }) {
  const iconProps = {
    className: "h-4 w-4",
    fill: "none",
    viewBox: "0 0 20 20",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "reservation":
      return (
        <svg {...iconProps}>
          <path d="M4.5 5.5h11v9h-11z" />
          <path d="M7 3.5v4M13 3.5v4" />
        </svg>
      );
    case "guest":
      return (
        <svg {...iconProps}>
          <path d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M4.5 17c.8-2.7 2.8-4.2 5.5-4.2S14.7 14.3 15.5 17" />
        </svg>
      );
    case "table":
      return (
        <svg {...iconProps}>
          <path d="M4.5 7.5h11" />
          <path d="M7 7.5v9" />
          <path d="M13 7.5v9" />
          <path d="M5.5 13h9" />
        </svg>
      );
    case "checkin":
      return (
        <svg {...iconProps}>
          <path d="m6 10.5 2.2 2.2L14 7" />
          <path d="M4.5 10a5.5 5.5 0 1 1 11 0a5.5 5.5 0 0 1-11 0Z" />
        </svg>
      );
    case "alert":
      return (
        <svg {...iconProps}>
          <path d="M10 4.5 16.5 16h-13L10 4.5Z" />
          <path d="M10 8.5v3.5" />
          <path d="M10 13.8h.01" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <path d="M10 4.5a4 4 0 0 0-4 4v1.4c0 .9-.3 1.8-.9 2.5l-.6.7h11l-.6-.7c-.6-.7-.9-1.6-.9-2.5V8.5a4 4 0 0 0-4-4Z" />
          <path d="M8 16a2 2 0 0 0 4 0" />
        </svg>
      );
  }
}

export function NotificationCenter() {
  const {
    notifications,
    unreadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
  } = useFeedback();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    markAllNotificationsRead();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        panelRef.current?.contains(target as Node) ||
        buttonRef.current?.contains(target as Node)
      ) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("button, a")?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [markAllNotificationsRead, open]);

  const visibleNotifications = notifications.slice(0, 8);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Abrir centro de notificaciones"
      >
        <NotificationIcon icon="bell" />
        {unreadNotifications ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full border border-slate-950 bg-cyan-400 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">
            {unreadNotifications}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Centro de notificaciones"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-[70] w-[min(92vw,32rem)] overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0d1117] shadow-[0_28px_90px_rgba(0,0,0,0.5)]"
          style={{ animation: "dialogIn 180ms ease" }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                Notificaciones
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                Centro de notificaciones
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Historial operativo con acciones de ver y deshacer.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                clearNotifications();
                setOpen(false);
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              Limpiar
            </button>
          </div>

          <div className="max-h-[min(68vh,38rem)] overflow-y-auto p-3">
            {visibleNotifications.length ? (
              <div className="space-y-2">
                {visibleNotifications.map((notification) => {
                  const tone = getNotificationToneClass(notification.tone ?? "info");

                  return (
                    <article
                      key={notification.id}
                      className={[
                        "rounded-[1.45rem] border px-4 py-4 transition",
                        notification.read
                          ? "border-white/10 bg-white/[0.03]"
                          : "border-cyan-400/20 bg-cyan-400/10",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={[
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-white",
                            tone.icon,
                          ].join(" ")}
                        >
                          <NotificationIcon icon={notification.icon ?? "bell"} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">{notification.title}</p>
                            <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
                              {notification.time}
                            </span>
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]",
                                notification.read
                                  ? "border-white/10 bg-white/[0.04] text-slate-400"
                                  : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
                              ].join(" ")}
                            >
                              {notification.read ? "Leída" : "Nueva"}
                            </span>
                          </div>

                          {notification.description ? (
                            <p className="mt-1 text-sm leading-6 text-slate-300">
                              {notification.description}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {notification.href ? (
                              <a
                                href={notification.href}
                                onClick={() => markNotificationRead(notification.id)}
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                              >
                                Ver
                              </a>
                            ) : null}

                            {notification.actions?.map((action) => {
                              if (action.href) {
                                return (
                                  <a
                                    key={action.label}
                                  href={action.href}
                                  onClick={() => {
                                    markNotificationRead(notification.id);
                                    setOpen(false);
                                  }}
                                  className={[
                                      "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                                      action.tone === "danger"
                                        ? "border-rose-400/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
                                        : action.tone === "warning"
                                          ? "border-amber-400/20 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15"
                                          : action.tone === "success"
                                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                                            : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15",
                                    ].join(" ")}
                                  >
                                    {action.label}
                                  </a>
                                );
                              }

                              return (
                                <button
                                  key={action.label}
                                type="button"
                                onClick={() => {
                                  action.onSelect?.();
                                  markNotificationRead(notification.id);
                                  setOpen(false);
                                }}
                                className={[
                                    "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                                    action.tone === "danger"
                                      ? "border-rose-400/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
                                      : action.tone === "warning"
                                        ? "border-amber-400/20 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15"
                                        : action.tone === "success"
                                          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                                          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15",
                                  ].join(" ")}
                                >
                                  {action.label}
                                </button>
                              );
                            })}

                            {notification.undo ? (
                              <button
                                type="button"
                                onClick={() => {
                                  notification.undo?.onUndo();
                                  markNotificationRead(notification.id);
                                  setOpen(false);
                                }}
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 text-xs font-medium text-amber-100 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                              >
                                {notification.undo.label ?? "Deshacer"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[1.45rem] border border-dashed border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-sm font-semibold text-white">No hay notificaciones todavía.</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Las acciones importantes aparecerán aquí con su historial y accesos rápidos.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
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
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              {primaryAction.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
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
  const icon = input.tone === "success" ? "✓" : input.tone === "warning" ? "!" : input.tone === "danger" ? "×" : "i";

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
            {icon}
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

export type {
  ConfirmInput,
  ConfirmTone,
  EmptyStateIcon,
  NotificationAction,
  NotificationIcon,
  NotificationInput,
  NotificationItem,
  NotificationTone,
  ToastInput,
  ToastTone,
};
