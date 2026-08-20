import Link from "next/link";
import type { ReactNode } from "react";

function isActivePath(pathname: string, href: string) {
  return pathname === href;
}

export default function PublicLegalShell({
  currentPath,
  title,
  description,
  children,
}: {
  currentPath: "/privacy" | "/data-deletion";
  title: string;
  description: string;
  children: ReactNode;
}) {
  const navItems = [
    { href: "/privacy", label: "Política de privacidad" },
    { href: "/data-deletion", label: "Eliminación de datos" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="surface-quiet px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.22em] text-white uppercase">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-100">
              E
            </span>
            EntryFlow
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {navItems.map((item) => {
              const active = isActivePath(currentPath, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-full border px-3 py-2 transition",
                    active
                      ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <section className="surface-panel mt-6 p-6 sm:p-8">
        <p className="kicker">EntryFlow · Documentación legal</p>
        <div className="mt-4 max-w-3xl space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h1>
          <p className="text-base leading-7 text-slate-300 sm:text-lg">{description}</p>
        </div>
      </section>

      <div className="mt-6">{children}</div>
    </main>
  );
}
