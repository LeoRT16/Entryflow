"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import PermissionGuard from "@/components/permission-guard";
import OrganizationCreationModal from "@/features/events/components/organization-creation-modal";
import TimezoneSelect from "@/components/timezone-select";
import Topbar from "@/components/topbar";
import { useCheckInStore } from "@/services/workspace-service";
import { buildOrganizationSwitcherOptions, validateOrganizationName } from "@/features/settings/domain/organization-settings";
import { buildSlugFromName } from "@/lib/slug";
import { formatTimezoneLabel, getDefaultTimezone } from "@/lib/timezone";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getReportingDestination, requestReportingSync, setReportingDestinationEnabled, upsertReportingDestination } from "@/repositories/reporting-sync-repositories";
import { buildReportingSyncStatus } from "@/features/reporting/sync/status";
import { buildReportingRecoveryStatus } from "@/features/reporting/sync/recovery-status";

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
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
      <Topbar title="Ajustes" description="Configuración general de tu organización." compact />

      <PermissionGuard permission="settings.view">
        <div className="space-y-6">
          <section aria-labelledby="organization-settings-title" className="space-y-3">
            <div>
              <p className="kicker">Organización</p>
              <h2 id="organization-settings-title" className="mt-1 text-xl font-semibold text-white">Identidad y contexto estable</h2>
              <p className="mt-1 text-sm text-slate-400">Estos valores aplican a toda la organización y no dependen del evento seleccionado.</p>
            </div>
            <OrganizationSettingsCard key={currentOrganization.id} canManage={canManageOrganization} />
          </section>

          <section aria-labelledby="integration-settings-title" className="space-y-3">
            <div>
              <p className="kicker">Integraciones</p>
              <h2 id="integration-settings-title" className="mt-1 text-xl font-semibold text-white">Conexiones externas</h2>
              <p className="mt-1 text-sm text-slate-400">Configura conexiones aquí; la operación y sincronización siguen sus flujos propios.</p>
            </div>
            <div className="grid gap-4">
              <GoogleSheetsSettingsCard eventId={currentEvent.id} eventName={currentEvent.name} organizationId={currentOrganizationId} authReady={browserAuthReady} canManage={canManageOrganization} />
              <GoogleDriveSettingsCard organizationId={currentOrganizationId} canManage={canManageOrganization} />
            </div>
          </section>
        </div>
      </PermissionGuard>
    </div>
  );
}

function GoogleDriveSettingsCard({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const { confirm, showToast } = useFeedback();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [integration, setIntegration] = useState<Record<string, unknown> | null>(null);
  const requestVersion = useRef(0);
  const load = useCallback(async () => { const version = ++requestVersion.current; try { const response = await fetch(`/api/integrations/google-drive/status?organizationId=${encodeURIComponent(organizationId)}`); if (!response.ok) throw new Error(); const next = await response.json(); if (version !== requestVersion.current) return; setIntegration(next); setState("ready"); } catch { if (version === requestVersion.current) setState("error"); } }, [organizationId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const disconnect = async () => { const response = await fetch("/api/integrations/google-drive/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId }) }); if (response.ok) { showToast({ title: "Google Drive desconectado", description: "Las hojas y configuraciones existentes se conservaron.", tone: "success" }); void load(); } else showToast({ title: "No pudimos desconectar Google Drive", description: "Revisá la conexión e intentá nuevamente.", tone: "error" }); };
  const connected = integration?.connected === true;
  const accountMismatch = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("googleDrive") === "account_mismatch";
  const recovery = buildReportingRecoveryStatus({ integrationStatus: String(integration?.status ?? ""), integrationErrorCode: String(integration?.errorCode ?? "") });
  const displayState = state === "loading" ? "Cargando integración…" : state === "error" ? "No pudimos cargar la integración." : recovery.state === "NEEDS_REAUTH" ? recovery.label : connected ? `Conectado como ${String(integration?.accountEmail ?? "cuenta de Google")}` : integration?.status === "disabled" ? "Desactivado" : "No conectado";
  return <section className="surface-panel p-4 sm:p-5"><p className="kicker">Integraciones · Organización</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Google Drive</h2><p className="mt-1 text-sm text-slate-400">{displayState}</p>{accountMismatch ? <p className="mt-2 text-xs text-amber-200">Esta organización está vinculada a {String(integration?.accountEmail ?? "la cuenta de Google vinculada")}. Reconecta usando esa misma cuenta.</p> : null}{recovery.reason && recovery.state !== "HEALTHY" ? <p className="mt-2 text-xs text-amber-200">{recovery.reason}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{canManage && (recovery.state === "NEEDS_REAUTH" || !connected) ? <a href={`/api/integrations/google-drive/connect?organizationId=${encodeURIComponent(organizationId)}`} className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950">{recovery.state === "NEEDS_REAUTH" ? "Reconectar Google" : "Conectar Google Drive"}</a> : null}{canManage && connected && recovery.state !== "NEEDS_REAUTH" ? <button type="button" onClick={() => confirm({ title: "¿Desconectar Google Drive?", description: "La conexión de Google Drive de esta organización se desconectará. Las hojas y configuraciones existentes no se eliminarán; las funciones dependientes necesitarán reconexión.", confirmLabel: "Desconectar", cancelLabel: "Cancelar", tone: "danger", onConfirm: () => void disconnect() })} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white">Desconectar</button> : null}</div></section>;
}

function GoogleSheetsSettingsCard({ eventId, eventName, organizationId, authReady, canManage }: { eventId: string; eventName: string; organizationId: string; authReady: boolean; canManage: boolean }) {
  const { showToast, confirm } = useFeedback();
  const [destination, setDestination] = useState<Record<string, unknown> | null>(null);
  const [draftSpreadsheetId, setDraftSpreadsheetId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [provisioning, setProvisioning] = useState<"idle" | "pending">("idle");
  const [driveConnected, setDriveConnected] = useState(false);
  const [editingSheet, setEditingSheet] = useState(false);
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
  useEffect(() => { let active = true; void fetch(`/api/integrations/google-drive/status?organizationId=${encodeURIComponent(organizationId)}`).then((response) => response.ok ? response.json() : null).then((value) => { if (active) setDriveConnected(value?.connected === true); }).catch(() => undefined); return () => { active = false; }; }, [organizationId]);
  const status = buildReportingSyncStatus({ destination: destination as never });
  const recovery = buildReportingRecoveryStatus({ integrationStatus: driveConnected ? "connected" : "", enabled: destination?.enabled as boolean | null, lastError: destination?.last_error as string | null, lastRequestedSequence: destination?.last_requested_sequence as number | null, lastProcessedSequence: destination?.last_processed_sequence as number | null });
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
  const provision = async () => { if (busy) return; setBusy(true); setProvisioning("pending"); try { const response = await fetch("/api/reporting/provisioning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId }) }); const result = await response.json().catch(() => null); if (!response.ok) throw new Error(String(result?.error ?? "reporting_provisioning_failed")); showToast({ title: result?.status === "ready" ? "Reportes configurados" : "Configuración en proceso", description: result?.status === "ready" ? "Drive y Google Sheets quedaron listos para este evento." : "La configuración continuará en segundo plano.", tone: "success" }); await load(); } catch { showToast({ title: "No pudimos configurar reportes", description: "Verificá la conexión de Google Drive e inténtalo nuevamente.", tone: "error" }); setProvisioning("idle"); } finally { setBusy(false); } };
  if (!eventId) return <section className="surface-panel p-4 sm:p-5"><p className="kicker">Integraciones · Evento</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Google Sheets</h2><p className="mt-2 text-sm text-slate-400">Seleccioná un evento para configurar Google Sheets.</p></section>;
  const sheetLabel = recovery.state === "NEEDS_REAUTH" ? recovery.label : recovery.state === "NEEDS_ACTION" ? recovery.label : recovery.state === "RECOVERING" ? recovery.label : loadState === "loading" ? "Cargando integración…" : loadState === "error" ? "No pudimos cargar la integración de Google Sheets." : status.configured ? status.enabled ? "Google Sheets activo" : "Sincronización pausada" : provisioning === "pending" ? "Configurando reportes…" : "No configurado";
  return <section className="surface-panel p-4 sm:p-5"><p className="kicker">Integraciones · Evento</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Google Sheets</h2><p className="mt-1 text-xs text-slate-500">Evento: {eventName}</p><p className="mt-1 text-sm text-slate-400">{sheetLabel}</p>{recovery.reason && recovery.state !== "HEALTHY" ? <p className="mt-2 text-xs text-amber-200">{recovery.reason}</p> : null}<div className="mt-4 grid gap-3">{!status.configured && driveConnected && canManage ? <button type="button" disabled={busy} onClick={() => void provision()} className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950">{provisioning === "pending" ? "Configurando…" : "Configurar reportes"}</button> : null}{editingSheet ? <Input label="Nueva hoja" value={draftSpreadsheetId} onChange={setDraftSpreadsheetId} placeholder="ID de la hoja de Google Sheets" disabled={!canManage || busy || loadState !== "ready"} /> : null}{status.lastSuccessAt ? <p className="text-xs text-slate-400">Última sincronización exitosa: {new Date(status.lastSuccessAt).toLocaleString()}</p> : null}{status.error && recovery.state !== "NEEDS_REAUTH" && recovery.state !== "NEEDS_ACTION" ? <p className="text-sm text-rose-300">No se pudo sincronizar: {status.error}</p> : null}<div className="flex flex-wrap gap-2">{loadState === "error" ? <button type="button" disabled={busy} onClick={() => void load()} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white">Reintentar</button> : null}{canManage && loadState === "ready" ? <button type="button" disabled={busy || (editingSheet && !draftSpreadsheetId.trim())} onClick={() => { if (!editingSheet) setEditingSheet(true); else { void save(true, draftSpreadsheetId.trim(), "save"); setEditingSheet(false); } }} className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Guardando…" : status.configured ? "Cambiar hoja" : "Guardar conexión"}</button> : null}{status.configured && canManage && loadState === "ready" ? <button type="button" disabled={busy || !persistedSpreadsheetId} onClick={() => status.enabled ? confirm({ title: "¿Desactivar Google Sheets?", description: "Se detendrá la sincronización para este evento. La hoja y su configuración no se eliminarán y podrás volver a activarlas.", confirmLabel: "Desactivar", cancelLabel: "Cancelar", tone: "danger", onConfirm: () => void save(false, persistedSpreadsheetId, "disable") }) : void save(true, persistedSpreadsheetId, "enable")} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white">{status.enabled ? "Desactivar" : "Activar"}</button> : null}{status.configured && status.enabled && loadState === "ready" && recovery.state === "HEALTHY" ? <button type="button" disabled={busy} onClick={() => void sync()} className="inline-flex h-10 items-center rounded-xl border border-cyan-300/30 px-4 text-sm font-semibold text-cyan-200">{busy ? "Solicitando…" : "Sincronizar ahora"}</button> : null}</div>{status.configured ? <details className="rounded-xl border border-white/10 px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-slate-300">Detalles avanzados</summary><p className="mt-2 break-all text-xs text-slate-500">Spreadsheet ID: {persistedSpreadsheetId || "No configurado"}</p></details> : null}</div></section>;
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
    const trimmedName = organizationName.trim();
    const nameError = validateOrganizationName(trimmedName);
    if (nameError) {
      showToast({ title: "Revisá el nombre de la organización", description: nameError, tone: "error" });
      return;
    }
    setIsSaving(true);

    const nextOrganization = {
      ...currentOrganization,
      name: trimmedName,
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
              <Input label="Nombre de la organización" value={organizationName} onChange={setOrganizationName} placeholder="Nombre de la organización" maxLength={100} />
              <TimezoneSelect
                label="Zona horaria"
                value={organizationTimezone}
                onChange={setOrganizationTimezone}
                preferredTimezone={currentOrganization.timezone}
                helperText="Se usará como zona horaria predeterminada para nuevos eventos."
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
