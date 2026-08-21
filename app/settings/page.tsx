"use client";

import { useMemo, useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import PermissionGuard from "@/components/permission-guard";
import OrganizationCreationModal from "@/features/events/components/organization-creation-modal";
import TimezoneSelect from "@/components/timezone-select";
import Topbar from "@/components/topbar";
import { useCheckInStore } from "@/services/workspace-service";
import { buildOrganizationSwitcherOptions } from "@/features/settings/domain/organization-settings";
import { buildSlugFromName } from "@/lib/slug";
import { formatTimezoneLabel, getDefaultTimezone } from "@/lib/timezone";

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function SettingsPage() {
  const { status, error, organizations, can, currentOrganization } = useCheckInStore();
  const canManageOrganization = can("organization.manage");

  if (status === "loading") {
    return <PanelShell title="Cargando ajustes" description="Estamos preparando la configuración de la organización." />;
  }

  if (status === "error") {
    return (
      <PanelShell
        title="No pudimos cargar ajustes"
        description={error?.message ?? "Revisá la conexión con Supabase."}
        actionLabel="Reintentar"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (!organizations.length) {
    return <PanelShell title="Ajustes sin datos" description="Creá una organización para continuar." />;
  }

  return (
    <div className="mx-auto w-full max-w-[1140px] space-y-5 px-4 sm:px-6 lg:px-0">
      <Topbar eyebrow="Ajustes" title="Ajustes" description="Configuración general de tu organización." />

      <PermissionGuard permission="settings.view">
        <section className="grid gap-4">
          <OrganizationSettingsCard key={currentOrganization.id} canManage={canManageOrganization} />
        </section>
      </PermissionGuard>
    </div>
  );
}

function OrganizationSettingsCard({ canManage }: { canManage: boolean }) {
  const { showToast } = useFeedback();
  const {
    currentOrganization,
    currentAccount,
    currentUser,
    currentProfile,
    currentOrganizationId,
    organizations,
    profiles,
    roles,
    setCurrentOrganizationId,
    createOrganization,
  } = useCheckInStore();
  const [organizationName, setOrganizationName] = useState(currentOrganization.name);
  const [organizationTimezone, setOrganizationTimezone] = useState(() => getDefaultTimezone(currentOrganization.timezone));
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const organizationOptions = useMemo(
    () =>
      buildOrganizationSwitcherOptions({
        organizations,
        profiles,
        roles,
        currentUserId: currentUser?.id ?? "",
        currentOrganizationId,
      }),
    [currentOrganizationId, currentUser?.id, organizations, profiles, roles],
  );

  const saveOrganization = async () => {
    setIsSaving(true);

    const nextOrganization = {
      ...currentOrganization,
      name: organizationName.trim() || currentOrganization.name,
      slug: currentOrganization.slug || buildSlugFromName(organizationName),
      timezone: organizationTimezone.trim() || currentOrganization.timezone,
    };

    try {
      const savedOrganization = await createOrganization(nextOrganization);
      showToast({
        title: "Organización actualizada",
        description: `${savedOrganization.name} quedó sincronizada.`,
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "No pudimos guardar la organización",
        description: error instanceof Error && error.message ? error.message : "Revisá la conexión con Supabase.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="space-y-2">
        <p className="kicker">Organización</p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{currentOrganization.name}</h2>
        <p className="text-sm text-slate-400">Edita la identidad básica de tu organización.</p>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-200">Organización activa</span>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <label className="block">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 transition focus-within:border-cyan-400/60 focus-within:bg-white/[0.06]">
                <select
                  value={currentOrganization.id}
                  onChange={(event) => setCurrentOrganizationId(event.target.value)}
                  className="h-9 w-full bg-transparent text-sm text-white outline-none"
                >
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id} className="bg-slate-950 text-white">
                      {organization.isCurrent ? `${organization.name} · ${organization.roleName} · Actual` : `${organization.name} · ${organization.roleName}`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-slate-500">{currentAccount ? `Rol actual: ${currentAccount.roleName}` : "Cambiar organización actualiza el contexto completo."}</p>
            </label>

            {canManage ? (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex h-11 items-center justify-center self-start rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                + Crear organización
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4">
          {canManage ? (
            <>
              <Input label="Nombre de la organización" value={organizationName} onChange={setOrganizationName} placeholder="Nombre de la organización" />
              <TimezoneSelect
                label="Zona horaria"
                value={organizationTimezone}
                onChange={setOrganizationTimezone}
                preferredTimezone={currentOrganization.timezone}
                helperText="Define los horarios utilizados por la organización."
              />
            </>
          ) : (
            <>
              <ReadOnlyField label="Nombre de la organización" value={currentOrganization.name} hint={currentProfile ? `Membresía: ${currentProfile.displayName}` : "Solo lectura para este perfil."} />
              <ReadOnlyField label="Zona horaria" value={formatTimezoneLabel(currentOrganization.timezone)} hint="Solo lectura para este perfil." />
            </>
          )}
        </div>
      </div>

      {canManage ? (
        <button
          type="button"
          onClick={saveOrganization}
          disabled={isSaving}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          {isSaving ? "Guardando..." : "Guardar organización"}
        </button>
      ) : null}

      <OrganizationCreationModal
        key={`${currentOrganization.id}-${isCreateOpen ? "open" : "closed"}`}
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={createOrganization}
        templateOrganization={currentOrganization}
      />
    </section>
  );
}

function PanelShell({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="space-y-6">
      <Topbar eyebrow="Ajustes" title={title} description={description} />
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm text-slate-300">{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </div>
  );
}
