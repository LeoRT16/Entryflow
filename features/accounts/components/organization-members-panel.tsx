"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import StatusBadge from "@/components/status-badge";
import {
  ACCOUNT_PERMISSION_GROUPS,
  getAccountEditablePermissions,
  getAccountStatusLabel,
  getPermissionLabel,
  getRolePresetBySlug,
  canonicalizeAccountPermissionsForPersistence,
  normalizeAccountPermissions,
} from "@/features/accounts/domain/accounts-domain";
import { buildOrganizationMembersModel, getRoleMvpIntent } from "@/features/accounts/domain/members-directory";
import type { AccountPermissionKey, AccountRoleSlug, OrganizationAccount } from "@/features/accounts/types";
import { useCheckInStore } from "@/services/workspace-service";

type AccountFormState = {
  userEmail: string;
  displayName: string;
  roleSlug: AccountRoleSlug;
  area: string;
  status: "active" | "inactive";
  permissions: AccountPermissionKey[];
  tempPassword: string;
  confirmTempPassword: string;
};

type OrganizationMembersPanelProps = {
  newMemberRequest?: number;
};

function toFormState(account: OrganizationAccount): AccountFormState {
  return {
    userEmail: account.userEmail,
    displayName: account.displayName,
    roleSlug: account.roleSlug,
    area: account.attributes.area ?? "",
    status: account.status,
    permissions: getAccountEditablePermissions(account),
    tempPassword: "",
    confirmTempPassword: "",
  };
}

function emptyFormState(): AccountFormState {
  return {
    userEmail: "",
    displayName: "",
    roleSlug: "administrator",
    area: "",
    status: "active",
    permissions: getRolePresetBySlug("administrator").permissions,
    tempPassword: "",
    confirmTempPassword: "",
  };
}

export default function OrganizationMembersPanel({ newMemberRequest }: OrganizationMembersPanelProps) {
  const {
    accounts,
    currentAccount,
    currentOrganization,
    createAccount,
    reloadWorkspace,
    updateAccount,
    setAccountStatus,
    can,
  } = useCheckInStore();
  const canManageAccounts = can("accounts.manage") || currentAccount.isOwner;
  const canManagePermissions = can("permissions.manage") || currentAccount.isOwner;

  const model = useMemo(
    () =>
      buildOrganizationMembersModel({
        accounts,
        organizationId: currentOrganization.id,
        canManageAccounts,
        canManagePermissions,
      }),
    [accounts, canManageAccounts, canManagePermissions, currentOrganization.id],
  );

  const initialSelectedAccount = model.members[0] ? accounts.find((account) => account.id === model.members[0].id) ?? null : null;
  const [selectedId, setSelectedId] = useState<string>(initialSelectedAccount?.id ?? "new");
  const [form, setForm] = useState<AccountFormState>(initialSelectedAccount ? toFormState(initialSelectedAccount) : emptyFormState());
  const [isSaving, setIsSaving] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetTempPassword, setResetTempPassword] = useState("");
  const [resetConfirmTempPassword, setResetConfirmTempPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const lastRequestRef = useRef<number | undefined>(newMemberRequest);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId && account.organizationId === currentOrganization.id && account.id !== "bootstrap-account") ?? null,
    [accounts, currentOrganization.id, selectedId],
  );

  const selectedModel = selectedAccount
    ? model.members.find((member) => member.id === selectedAccount.id) ?? null
    : null;
  const selectedRole = getRoleMvpIntent(form.roleSlug);

  useEffect(() => {
    if (newMemberRequest === undefined || newMemberRequest === lastRequestRef.current) {
      return;
    }

    lastRequestRef.current = newMemberRequest;
    setSelectedId("new");
    setForm(emptyFormState());
    setPermissionsOpen(false);
    setResetOpen(false);
    setSaveError(null);
    setResetSuccess(null);
    setResetError(null);
    setResetTempPassword("");
    setResetConfirmTempPassword("");
  }, [newMemberRequest]);

  const clearResetNotice = () => {
    setResetSuccess(null);
    setResetError(null);
  };

  const selectAccount = (accountId: string) => {
    setSelectedId(accountId);
    setPermissionsOpen(false);
    setResetOpen(false);
    setSaveError(null);
    clearResetNotice();

    if (accountId === "new") {
      setForm(emptyFormState());
      setResetTempPassword("");
      setResetConfirmTempPassword("");
      return;
    }

    const account = accounts.find((item) => item.id === accountId);
    if (account) {
      setForm(toFormState(account));
      setResetTempPassword("");
      setResetConfirmTempPassword("");
    }
  };

  const togglePermission = (permission: AccountPermissionKey) => {
    setForm((current) => {
      const currentPermissions = new Set(current.permissions);

      if (currentPermissions.has(permission)) {
        currentPermissions.delete(permission);
      } else {
        currentPermissions.add(permission);
      }

      return {
        ...current,
        permissions: normalizeAccountPermissions([...currentPermissions], getRolePresetBySlug(current.roleSlug).permissions),
      };
    });
  };

  const handleRoleChange = (roleSlug: AccountRoleSlug) => {
    const preset = getRolePresetBySlug(roleSlug);

    setForm((current) => ({
      ...current,
      roleSlug,
      permissions: preset.permissions,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const baseName = form.displayName.trim() || form.userEmail.split("@")[0] || "Miembro";
      const displayName = form.displayName.trim() || baseName;
      const userDisplayName = displayName;
      const permissions = canonicalizeAccountPermissionsForPersistence({
        permissions: form.permissions,
        rolePermissions: getRolePresetBySlug(form.roleSlug).permissions,
      });

      if (!selectedAccount || selectedId === "new") {
        const tempPassword = form.tempPassword.trim();
        const confirmTempPassword = form.confirmTempPassword.trim();

        if (!tempPassword || tempPassword.length < 8) {
          setSaveError("Ingresá una contraseña temporal de al menos 8 caracteres.");
          return;
        }

        if (confirmTempPassword !== tempPassword) {
          setSaveError("Las contraseñas temporales no coinciden.");
          return;
        }

        const created = await createAccount({
          email: form.userEmail.trim(),
          displayName: userDisplayName,
          organizationId: currentOrganization.id,
          roleSlug: form.roleSlug,
          area: form.area.trim(),
          permissions,
          tempPassword,
          confirmTempPassword,
        });

        setSelectedId(created.id);
        setForm(toFormState(created));
        setPermissionsOpen(false);
        setResetOpen(false);
        setResetTempPassword("");
        setResetConfirmTempPassword("");
        clearResetNotice();
        return;
      }

      const updated = await updateAccount({
        ...selectedAccount,
        userEmail: form.userEmail.trim(),
        userDisplayName,
        displayName,
        roleSlug: form.roleSlug,
        roleId: getRolePresetBySlug(form.roleSlug).id,
        roleName: getRolePresetBySlug(form.roleSlug).name,
        rolePermissions: getRolePresetBySlug(form.roleSlug).permissions,
        permissions,
        attributes: {
          ...selectedAccount.attributes,
          area: form.area.trim(),
          permissions,
          status: form.status,
        },
        status: form.status,
      });

      setSelectedId(updated.id);
      setForm(toFormState(updated));
      setPermissionsOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : "No se pudo guardar al miembro.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (status: "active" | "inactive") => {
    if (!selectedAccount || selectedAccount.id === "bootstrap-account") {
      return;
    }

    setIsSaving(true);
    try {
      await setAccountStatus(selectedAccount.id, status);
      setForm((current) => ({ ...current, status }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetTemporaryPassword = async () => {
    if (!canManageAccounts || !selectedAccount || selectedAccount.id === "bootstrap-account" || selectedAccount.status !== "active") {
      return;
    }

    const tempPassword = resetTempPassword.trim();
    const confirmTempPassword = resetConfirmTempPassword.trim();

    if (!tempPassword || tempPassword.length < 8) {
      setResetError("Ingresá una contraseña temporal de al menos 8 caracteres.");
      return;
    }

    if (confirmTempPassword !== tempPassword) {
      setResetError("Las contraseñas temporales no coinciden.");
      return;
    }

    setIsResetting(true);
    clearResetNotice();

    try {
      const response = await fetch("/api/accounts/resend-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: selectedAccount.id,
          tempPassword,
          confirmTempPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || "No se pudo restablecer la contraseña temporal.");
      }

      await reloadWorkspace();
      setResetSuccess(`Restablecimos la contraseña temporal de ${selectedAccount.userEmail}.`);
      setResetTempPassword("");
      setResetConfirmTempPassword("");
      setResetOpen(false);
    } catch (error) {
      setResetError(error instanceof Error && error.message ? error.message : "No se pudo restablecer la contraseña temporal.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <section className="surface-panel mx-auto w-full max-w-[1140px] p-4 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[0.34fr_0.66fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="kicker">Miembros</p>
            {!canManageAccounts ? (
              <StatusBadge variant="warning">Solo lectura</StatusBadge>
            ) : null}
          </div>

          <div className="space-y-2">
            {model.empty ? (
              <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Esta organización todavía no tiene miembros visibles.
              </div>
            ) : (
              model.members.map((member) => {
                const selected = member.id === selectedId;

                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => selectAccount(member.id)}
                    className={[
                      "w-full rounded-[1.25rem] border px-4 py-3 text-left transition",
                      selected
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{member.displayName}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{member.userEmail || "Sin email"}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {member.roleName} · {member.area || "Sin área"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge variant={member.status === "inactive" ? "warning" : member.isOwner ? "success" : "info"}>
                          {getAccountStatusLabel(member.status)}
                        </StatusBadge>
                        {member.protectedOwner ? <StatusBadge variant="danger">Owner protegido</StatusBadge> : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="kicker">Detalle del miembro</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{selectedAccount?.displayName ?? "Nuevo miembro"}</h3>
              <p className="mt-2 text-sm text-slate-400">
                {selectedAccount ? selectedAccount.userEmail : "Creá un miembro nuevo o elegí uno existente."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedModel ? (
                <StatusBadge variant={selectedModel.isOwner ? "success" : selectedModel.status === "inactive" ? "warning" : "info"}>
                  {selectedModel.isOwner ? "Owner" : getAccountStatusLabel(selectedModel.status)}
                </StatusBadge>
              ) : null}
              {selectedModel?.protectedOwner ? <StatusBadge variant="danger">Owner protegido</StatusBadge> : null}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-200">Rol</p>
            <select
              value={form.roleSlug}
              onChange={(event) => handleRoleChange(event.target.value as AccountRoleSlug)}
              disabled={!canManageAccounts}
              className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
            >
              {(["owner", "administrator", "reception", "door"] as AccountRoleSlug[]).map((slug) => (
                <option key={slug} value={slug}>
                  {getRolePresetBySlug(slug).name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-slate-400">{selectedRole.intent}</p>
          </div>

          <fieldset disabled={!canManageAccounts} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Nombre visible</span>
                <input
                  value={form.displayName}
                  onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  placeholder="Nombre en la interfaz"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Email</span>
                <input
                  value={form.userEmail}
                  onChange={(event) => setForm((current) => ({ ...current, userEmail: event.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  placeholder="miembro@dominio.com"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Área</span>
                <input
                  value={form.area}
                  onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  placeholder="Recepción, puerta, dirección..."
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Estado</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
            </div>
          </fieldset>

          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kicker">Personalizar permisos</p>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsOpen((current) => !current)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                {permissionsOpen ? "Cerrar" : "Abrir"}
              </button>
            </div>

            {!permissionsOpen ? (
              <div className="mt-3 text-sm text-slate-400">Configuración avanzada.</div>
            ) : (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {ACCOUNT_PERMISSION_GROUPS.map((group) => (
                  <div key={group.id} className="rounded-[1rem] border border-white/10 bg-slate-950/30 p-4">
                    <p className="kicker">{group.label}</p>
                    <div className="mt-3 space-y-2">
                      {group.permissions.map((permission) => {
                        const checked = form.permissions.includes(permission.key);

                        return (
                          <label key={permission.key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(permission.key)}
                              disabled={!canManagePermissions}
                              className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-cyan-400 focus:ring-cyan-400/60"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white">{permission.label}</p>
                              <p className="mt-1 text-xs text-slate-500">{permission.description}</p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-600">{getPermissionLabel(permission.key)}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedId === "new" ? (
            <div className="rounded-[1.25rem] border border-cyan-400/15 bg-cyan-400/8 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/80">Contraseña temporal</p>
                  <p className="mt-1 text-sm text-cyan-50/80">
                    Esta contraseña la entrega el Owner/Admin al miembro por fuera de EntryFlow.
                  </p>
                </div>
                <StatusBadge variant="info">Requerida para crear</StatusBadge>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Contraseña temporal</span>
                  <input
                    value={form.tempPassword}
                    onChange={(event) => setForm((current) => ({ ...current, tempPassword: event.target.value }))}
                    type="password"
                    autoComplete="new-password"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                    placeholder="Mínimo 8 caracteres"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Confirmar contraseña</span>
                  <input
                    value={form.confirmTempPassword}
                    onChange={(event) => setForm((current) => ({ ...current, confirmTempPassword: event.target.value }))}
                    type="password"
                    autoComplete="new-password"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                    placeholder="Repetí la contraseña"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="kicker">Restablecer contraseña temporal</p>
                  <p className="mt-1 text-sm text-slate-400">Acción secundaria para actualizar una clave de acceso temporal.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setResetOpen((current) => !current)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                >
                  {resetOpen ? "Cerrar" : "Abrir"}
                </button>
              </div>

              {resetOpen ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">Contraseña temporal</span>
                      <input
                        value={resetTempPassword}
                        onChange={(event) => setResetTempPassword(event.target.value)}
                        type="password"
                        autoComplete="new-password"
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                        placeholder="Mínimo 8 caracteres"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">Confirmar contraseña</span>
                      <input
                        value={resetConfirmTempPassword}
                        onChange={(event) => setResetConfirmTempPassword(event.target.value)}
                        type="password"
                        autoComplete="new-password"
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                        placeholder="Repetí la contraseña"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetTemporaryPassword}
                    disabled={isResetting}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isResetting ? "Restableciendo..." : "Restablecer contraseña temporal"}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pb-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Guardando..." : selectedId === "new" ? "Crear miembro" : "Guardar cambios"}
            </button>
            {selectedAccount && selectedAccount.id !== "bootstrap-account" ? (
              selectedModel?.canDeactivate ? (
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedAccount.status === "active" ? "inactive" : "active")}
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedAccount.status === "active" ? "Desactivar" : "Reactivar"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-slate-500"
                >
                  Owner protegido
                </button>
              )
            ) : null}
          </div>

          {selectedModel?.deactivationHint ? <p className="text-xs text-amber-300">{selectedModel.deactivationHint}</p> : null}

          {saveError ? <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{saveError}</p> : null}
          {resetSuccess ? <p className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">{resetSuccess}</p> : null}
          {resetError ? <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{resetError}</p> : null}
        </div>
      </div>
    </section>
  );
}
