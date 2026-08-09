import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";

export const metadata: Metadata = {
  title: {
    default: "Centro de Operaciones",
    template: "%s | EntryFlow",
  },
  description:
    "Reservas, ingresos y operaciones para restaurantes, clubes y eventos.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialWorkspace = await loadWorkspaceBootstrap();

  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-[color:var(--background)] text-[color:var(--foreground)]">
        <AppShell initialWorkspace={initialWorkspace}>{children}</AppShell>
      </body>
    </html>
  );
}
