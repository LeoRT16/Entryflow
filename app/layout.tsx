import type { Metadata } from "next";
import {
  Anton,
  Archivo_Narrow,
  Bebas_Neue,
  Cormorant_Garamond,
  Inter,
  Montserrat,
  Oswald,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";

const invitationInter = Inter({
  subsets: ["latin"],
  variable: "--font-invitation-inter",
  weight: ["400", "500", "700"],
});

const invitationMontserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-invitation-montserrat",
  weight: ["400", "500", "700"],
});

const invitationPlayfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-invitation-playfair-display",
  weight: ["400", "500", "700"],
});

const invitationBebas = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-invitation-bebas-neue",
  weight: "400",
});

const invitationOswald = Oswald({
  subsets: ["latin"],
  variable: "--font-invitation-oswald",
  weight: ["400", "500", "700"],
});

const invitationAnton = Anton({
  subsets: ["latin"],
  variable: "--font-invitation-anton",
  weight: "400",
});

const invitationCormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-invitation-cormorant-garamond",
  weight: ["400", "500", "700"],
});

const invitationArchivo = Archivo_Narrow({
  subsets: ["latin"],
  variable: "--font-invitation-archivo-narrow",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Centro de Operaciones",
    template: "%s | EntryFlow",
  },
  description:
    "Reservas, ingresos y operaciones para restaurantes, clubes y eventos.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const authUser = await getSupabaseAuthUser();
  const initialWorkspace = await loadWorkspaceBootstrap(authUser ? { id: authUser.id, email: authUser.email } : undefined);

  return (
    <html
      lang="es"
      className={[
        "h-full antialiased",
        invitationInter.variable,
        invitationMontserrat.variable,
        invitationPlayfair.variable,
        invitationBebas.variable,
        invitationOswald.variable,
        invitationAnton.variable,
        invitationCormorant.variable,
        invitationArchivo.variable,
      ].join(" ")}
    >
      <body className="min-h-full bg-[color:var(--background)] text-[color:var(--foreground)]">
        <AppShell initialWorkspace={initialWorkspace}>{children}</AppShell>
      </body>
    </html>
  );
}
