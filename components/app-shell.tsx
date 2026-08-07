"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar";
import { FeedbackProvider } from "@/components/premium-feedback";
import { business } from "@/lib/mock-data";

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <FeedbackProvider>
      <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
        <div className="flex min-h-screen">
          <Sidebar
            mobileNavOpen={mobileNavOpen}
            onCloseMobileNav={() => setMobileNavOpen(false)}
          />

          <div className="flex min-h-screen flex-1 flex-col md:pl-72">
            <header className="sticky top-0 z-20 border-b border-white/10 bg-[color:var(--background)]/95 px-4 py-3 backdrop-blur md:hidden">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                  aria-label="Abrir menú de navegación"
                >
                  <span className="flex flex-col gap-1.5">
                    <span className="h-0.5 w-4 rounded-full bg-current" />
                    <span className="h-0.5 w-4 rounded-full bg-current" />
                    <span className="h-0.5 w-4 rounded-full bg-current" />
                  </span>
                </button>

                <div className="min-w-0 text-right">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                    {business.productName}
                  </p>
                  <p className="truncate text-sm font-medium text-white">
                    {business.currentBusiness}
                  </p>
                </div>
              </div>
            </header>

            <main className="flex-1">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </FeedbackProvider>
  );
}
