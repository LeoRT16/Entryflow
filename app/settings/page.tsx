"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import PermissionGuard from "@/components/permission-guard";
import OrganizationCreationModal from "@/features/events/components/organization-creation-modal";
import TimezoneSelect from "@/components/timezone-select";
import Topbar from "@/components/topbar";
import { useCheckInStore } from "@/services/workspace-service";
import { buildOrganizationSwitcherOptions } from "@/features/settings/domain/organization-settings";
import { buildSlugFromName } from "@/lib/slug";
import { formatTimezoneLabel, getDefaultTimezone } from "@/lib/timezone";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getReportingDestination, requestReportingSync, setReportingDestinationEnabled, upsertReportingDestination } from "@/repositories/reporting-sync-repositories";
import { buildReportingSyncStatus } from "@/features/reporting/sync/status";

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
  const { status, error, organizations, can, currentOrganization, currentOrganizationId, currentEvent, browserAuthReady } = useCheckInStore();
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
          <GoogleSheetsSettingsCard eventId={currentEvent.id} organizationId={currentOrganizationId} authReady={browserAuthReady} canManage={canManageOrganization} />
          <GoogleDriveSettingsCard organizationId={currentOrganizationId} canManage={canManageOrganization} />
        </section>
      </PermissionGuard>
    </div>
  );
}

function GoogleDriveSettingsCard({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [integration, setIntegration] = useState<Record<string, unknown> | null>(null);
  const requestVersion = useRef(0);
  const load = async () => { const version = ++requestVersion.current; try { const response = await fetch(`/api/integrations/google-drive/status?organizationId=${encodeURIComponent(organizationId)}`); if (!response.ok) throw new Error(); const next = await response.json(); if (version !== requestVersion.current) return; setIntegration(next); setState("ready"); } catch { if (version === requestVersion.current) setState("error"); } };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [organizationId]);
  const disconnect = async () => { const response = await fetch("/api/integrations/google-drive/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId }) }); if (response.ok) void load(); };
  const connected = integration?.connected === true;
  return <section className="surface-panel p-4 sm:p-5"><p className="kicker">Integraciones · Organización</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Google Drive</h2><p className="mt-1 text-sm text-slate-400">{state === "loading" ? "Cargando integración…" : state === "error" ? "No pudimos cargar la integración." : connected ? `Conectado como ${String(integration?.accountEmail ?? "cuenta de Google")}` : integration?.status === "needs_reauth" ? "Necesita reconexión" : integration?.status === "disabled" ? "Desactivado" : "No conectado"}</p><div className="mt-4 flex flex-wrap gap-2">{canManage && !connected ? <a href={`/api/integrations/google-drive/connect?organizationId=${encodeURIComponent(organizationId)}`} className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950">Conectar Google Drive</a> : null}{canManage && connected ? <button type="button" onClick={() => void disconnect()} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white">Desconectar</button> : null}</div></section>;
}

function GoogleSheetsSettingsCard({ eventId, organizationId, authReady, canManage }: { eventId: string; organizationId: string; authReady: boolean; canManage: boolean }) {
  const { showToast } = useFeedback();
  const [destination, setDestination] = useState<Record<string, unknown> | null>(null);
  const [draftSpreadsheetId, setDraftSpreadsheetId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const mutationLockRef = useRef(false);
  const requestVersion = useRef(0);
  const loadedEventId = useRef("");
  const client = getSupabaseBrowserClient();
  const load = async () => {
    if (!client || !authReady || !organizationId || !eventId) return;
    const version = ++requestVersion.current;
    if (loadedEventId.current && loadedEventId.current !== eventId) setDestination(null);
    loadedEventId.current = eventId;
    setLoadState("loading");
    try {
      const value = await getReportingDestination(client, eventId);
      const next = value as Record<string, unknown> | null;
      if (version !== requestVersion.current || loadedEventId.current !== eventId) return;
      setDestination(next);
      setDraftSpreadsheetId(String(next?.spreadsheet_id ?? ""));
      setLoadState("ready");
    } catch {
      if (version === requestVersion.current && loadedEventId.current === eventId) setLoadState("error");
    }
  };
  // The effect hydrates persisted integration state after the event context is ready.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [eventId, organizationId, authReady]);
  const status = buildReportingSyncStatus({ destination: destination as never });
  const persistedSpreadsheetId = String(destination?.spreadsheet_id ?? "");
  const save = async (nextEnabled: boolean, nextSpreadsheetId: string, operation: "save" | "disable" | "enable") => {
    if (!client || busy || mutationLockRef.current) return;
    mutationLockRef.current = true;
    setBusy(true);
    const wasConfigured = status.configured;
    const changedSheet = wasConfigured && persistedSpreadsheetId !== nextSpreadsheetId;
    const shouldRequest = nextEnabled && (operation === "enable" || !wasConfigured || changedSheet);
    const success = operation === "disable" ? { title: "Sincronización pausada", description: "La sincronización con Google Sheets está pausada." } : operation === "enable" ? { title: "Sincronización activada", description: "La sincronización con Google Sheets está activa." } : { title: wasConfigured ? "Hoja actualizada" : "Google Sheets conectado", description: "La configuración quedó actualizada." };
    try {
      const saved = operation === "enable" || operation === "disable"
        ? await setReportingDestinationEnabled(client, eventId, nextEnabled)
        : await upsertReportingDestination(client, eventId, nextSpreadsheetId, nextEnabled);
      setDestination((current) => ({ ...(current ?? {}), ...(saved ?? {}), enabled: nextEnabled, spreadsheet_id: nextSpreadsheetId, last_requested_sequence: Number((current?.last_requested_sequence as number | undefined) ?? 0) + (shouldRequest ? 1 : 0) }));
      if (!shouldRequest) showToast({ ...success, tone: "success" });
      if (shouldRequest) {
        try {
          await requestReportingSync(client, eventId);
          showToast({ title: success.title, description: operation === "enable" ? "Se solicitó una nueva sincronización." : changedSheet ? "Se solicitó la sincronización de la nueva hoja." : "Se solicitó la primera sincronización.", tone: "success" });
        } catch {
          showToast({ title: "Google Sheets quedó configurado, pero no pudimos solicitar la sincronización.", description: "Puedes usar “Sincronizar ahora”.", tone: "warning" });
        }
      }
      try { await load(); } catch { showToast({ title: "La configuración se guardó, pero no pudimos actualizar su estado.", description: "Actualiza la página para reconciliar el estado.", tone: "warning" }); }
    } catch (error) {
      showToast({ title: operation === "disable" ? "No pudimos pausar la sincronización" : operation === "enable" ? "No pudimos activar la sincronización" : "No pudimos guardar Google Sheets", description: error instanceof Error && error.message === "reporting_spreadsheet_required" ? "La hoja configurada no es válida." : "Revisá la conexión e inténtalo nuevamente.", tone: "error" });
    } finally { mutationLockRef.current = false; setBusy(false); }
  };
  const sync = async () => { if (!client || busy || mutationLockRef.current) return; mutationLockRef.current = true; setBusy(true); try { await requestReportingSync(client, eventId); showToast({ title: "Sincronización solicitada", description: "Se procesará en segundo plano.", tone: "success" }); try { await load(); } catch { showToast({ title: "La solicitud se guardó, pero no pudimos actualizar su estado.", description: "Actualiza la página para reconciliar el estado.", tone: "warning" }); } } catch { showToast({ title: "No se pudo solicitar la sincronización", description: "Revisá la conexión e inténtalo nuevamente.", tone: "error" }); } finally { mutationLockRef.current = false; setBusy(false); } };
  const title = loadState === "error" ? "No pudimos cargar Google Sheets" : status.enabled ? "Google Sheets guardado" : "No pudimos pausar la sincronización";
  return <section className="surface-panel p-4 sm:p-5"><p className="kicker">Integraciones · Evento</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Google Sheets</h2><p className="mt-1 text-sm text-slate-400">{loadState === "loading" ? "Cargando integración…" : loadState === "error" ? "No pudimos cargar la integración de Google Sheets." : status.configured ? status.enabled ? "Google Sheets conectado" : "Sincronización pausada" : "No configurado"}</p><div className="mt-4 grid gap-3"><Input label="Spreadsheet ID" value={draftSpreadsheetId} onChange={setDraftSpreadsheetId} placeholder="ID de la hoja de Google Sheets" disabled={!canManage || busy || loadState !== "ready"} /><p className="text-xs text-slate-500">Comparte la hoja con el Service Account del entorno. Nunca introduzcas credenciales aquí.</p>{status.lastSuccessAt ? <p className="text-xs text-slate-400">Última sincronización exitosa: {new Date(status.lastSuccessAt).toLocaleString()}</p> : null}{status.error ? <p className="text-sm text-rose-300">No se pudo sincronizar: {status.error}</p> : null}<div className="flex flex-wrap gap-2">{loadState === "error" ? <button type="button" disabled={busy} onClick={() => void load()} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white">Reintentar</button> : null}{canManage && loadState === "ready" ? <button type="button" disabled={busy || !draftSpreadsheetId.trim()} onClick={() => void save(true, draftSpreadsheetId.trim(), "save")} className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Guardando…" : status.configured ? "Cambiar hoja" : "Guardar conexión"}</button> : null}{status.configured && canManage && loadState === "ready" ? <button type="button" disabled={busy || !persistedSpreadsheetId} onClick={() => void save(!status.enabled, persistedSpreadsheetId, status.enabled ? "disable" : "enable")} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white">{status.enabled ? "Desactivar" : "Activar"}</button> : null}{status.configured && status.enabled && loadState === "ready" ? <button type="button" disabled={busy} onClick={() => void sync()} className="inline-flex h-10 items-center rounded-xl border border-cyan-300/30 px-4 text-sm font-semibold text-cyan-200">Sincronizar ahora</button> : null}</div></div></section>;
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
