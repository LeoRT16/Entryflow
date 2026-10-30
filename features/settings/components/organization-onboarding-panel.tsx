"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useCheckInStore } from "@/services/workspace-service";

type OnboardingItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  required: "Obligatorio" | "Recomendado" | "Opcional";
  complete: boolean;
};

export default function OrganizationOnboardingPanel() {
  const { currentOrganization, currentAccount, accounts, venues, resources, events, can } = useCheckInStore();
  const canManageOrganization = can("organization.manage");
  const canManageAccounts = can("accounts.manage") || currentAccount.isOwner;
  const canManageResources = can("resource.manage");

  const items = useMemo<OnboardingItem[]>(() => {
    const organizationVenues = venues.filter((venue) => venue.organizationId === currentOrganization.id && venue.status === "active");
    const venueIds = new Set(organizationVenues.map((venue) => venue.id));
    const organizationResources = resources.filter((resource) => venueIds.has(resource.venueId));
    const activeMembers = accounts.filter((account) => account.organizationId === currentOrganization.id && account.status === "active");
    const hasIdentity = Boolean(currentOrganization.name.trim() && currentOrganization.timezone);
    const hasBranding = Boolean(currentOrganization.branding.logoUrl || currentOrganization.branding.primaryColor);
    const hasCommercialDefaults = Boolean(currentOrganization.settings.currency);

    return [
      { id: "identity", title: "Datos básicos", description: "Nombre y zona horaria de la organización.", href: "/settings", required: "Obligatorio", complete: hasIdentity },
      { id: "branding", title: "Identidad visual", description: "Logo o color principal para reconocer el espacio de trabajo.", href: "/settings", required: "Recomendado", complete: hasBranding },
      { id: "team", title: "Equipo y roles", description: "Owner, Administrador, Recepción y Puerta se administran por organización.", href: "/users", required: "Obligatorio", complete: activeMembers.length > 0 },
      { id: "spaces", title: "Espacios", description: "Configura venues y sectores solo si tu operación física los necesita.", href: "/tables", required: "Opcional", complete: organizationVenues.length > 0 },
      { id: "resources", title: "Recursos", description: "Mesas, zonas u otros recursos para reservas asignadas.", href: "/tables", required: "Opcional", complete: organizationResources.length > 0 },
      { id: "commercial", title: "Configuración comercial", description: "Moneda predeterminada; cada evento mantiene sus propias condiciones y snapshots.", href: "/settings", required: "Recomendado", complete: hasCommercialDefaults },
      { id: "reporting", title: "Google Drive y Sheets", description: "Conecta Reporting si quieres sincronización externa. No es requisito para operar.", href: "/settings", required: "Opcional", complete: false },
      { id: "event", title: "Primer evento", description: "Crea el primer evento cuando tengas lo necesario para tu operación.", href: "/events", required: "Obligatorio", complete: events.some((event) => event.organizationId === currentOrganization.id) },
    ];
  }, [accounts, currentOrganization, events, resources, venues]);

  const completedRequired = items.filter((item) => item.required === "Obligatorio" && item.complete).length;
  const totalRequired = items.filter((item) => item.required === "Obligatorio").length;
  const isReady = completedRequired === totalRequired;

  return (
    <section aria-labelledby="onboarding-title" className="surface-panel overflow-hidden p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="kicker">Configuración inicial</p>
          <h2 id="onboarding-title" className="mt-1 text-xl font-semibold text-white">Preparación de {currentOrganization.name}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Completa lo que sea útil para tu operación. Puedes volver a este panel cuando quieras.</p>
        </div>
        <div className={isReady ? "rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-100" : "rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-100"}>{isReady ? "Lista para crear eventos" : `${completedRequired}/${totalRequired} requisitos completados`}</div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const permitted = item.id === "identity" || item.id === "branding" || item.id === "commercial" ? canManageOrganization : item.id === "team" ? canManageAccounts : item.id === "spaces" || item.id === "resources" ? canManageResources : true;
          return <Link key={item.id} href={item.href} className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-cyan-400/30 hover:bg-white/[0.05]"><div className="flex items-center justify-between gap-2"><span className={item.complete ? "text-xs font-semibold text-emerald-200" : "text-xs font-semibold text-amber-200"}>{item.complete ? "Completado" : item.required}</span><span aria-hidden="true" className="text-slate-500 group-hover:text-cyan-200">→</span></div><h3 className="mt-2 text-sm font-semibold text-white">{item.title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>{!permitted ? <p className="mt-2 text-xs text-slate-500">Solo lectura con tu rol.</p> : null}</Link>;
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/20 p-3">
        <p className="text-sm text-slate-300">{isReady ? "La organización ya puede comenzar a operar." : "Los elementos opcionales no bloquean la creación de eventos."}</p>
        <Link href="/events" className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950">Crear primer evento</Link>
      </div>
    </section>
  );
}
